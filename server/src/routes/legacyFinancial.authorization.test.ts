import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ActivityStatus, ContractStatus, QuoteStatus, Role } from "@prisma/client";
import type { MemoryPrisma } from "../testing/memoryPrisma.js";
import type { Harness } from "../testing/httpHarness.js";

/**
 * SILA-DASHBOARD-003 / VD011-R2-01..03 direct-route regressions for the
 * GENERIC quotation and contract routes (POST/PUT/DELETE), which must never
 * bypass the exclusive, audited Super Admin decision routes:
 *  - R2-01: a supplier contract never enters the generic contract update,
 *    whatever replacement quote is proposed, role or vault state; legacy
 *    reparenting needs both scopes;
 *  - R2-02: generic writes cannot grant/undo approval or edit approved terms;
 *  - R2-03: generic writes cannot sign, inject signedAt, edit or roll back a
 *    signed contract.
 * Real routers and JWT middleware over the in-memory Prisma double. Every
 * assertion expects the secure outcome. Synthetic records only.
 */

const memory = vi.hoisted(() => ({ current: undefined as unknown as MemoryPrisma }));

vi.mock("../db.js", async () => {
  const { createMemoryPrisma } = await import("../testing/memoryPrisma.js");
  memory.current = createMemoryPrisma();
  return { prisma: memory.current.prisma };
});
vi.mock("../services/telemetryBuffer.js", () => ({ telemetryBuffer: {} }));
vi.mock("../services/geofenceEngine.js", () => ({
  GeofenceEngine: class {},
  geofenceEngine: {}
}));

const { startHarness } = await import("../testing/httpHarness.js");
const operationsRouter = (await import("./operations.js")).default;

const actors = {
  lm: { id: "usr_lm", role: Role.LOGISTICS_MANAGER },
  sa: { id: "usr_sa", role: Role.SUPER_ADMIN },
  org: { id: "usr_org", role: Role.ORGANIZER },
  org2: { id: "usr_org2", role: Role.ORGANIZER },
  coordinator: { id: "usr_coord", role: Role.COORDINATOR },
  company: { id: "usr_company", role: Role.COMPANY_ORGANIZER },
  hotel: { id: "usr_sup_hotel", role: Role.SUPPLIER }
};
/** Roles allowed on the generic legacy routes (event scope still applies to ORGANIZER). */
const legacyWriters = [actors.lm, actors.org, actors.sa];
const deniedRoles = [actors.coordinator, actors.company, actors.hotel];

/** Sealed supplier terms that must never appear in a denial. */
const SEALED_TERMS = /9876|456/;

function seed() {
  const intake = (id: string, eventId: string | null) => ({
    id,
    eventId,
    activityName: `Activity ${id}`,
    activityPlace: "Synthetic place",
    visitorCount: 24,
    vipVisitorCount: 6,
    normalVisitorCount: 18,
    ticketType: "MIXED",
    status: ActivityStatus.QUOTING,
    submittedBy: "company@example.test"
  });
  const quote = (id: string, intakeId: string, status: QuoteStatus, supplierId: string | null = null) => ({
    id,
    intakeId,
    supplierId,
    category: supplierId ? "HOTEL" : "Hotels",
    vendorName: `Vendor ${id}`,
    item: "Synthetic rooms",
    quantity: 10,
    unitPrice: "1000.00",
    totalPrice: "10000.00",
    commissionPercent: "12.00",
    commissionAmount: "1200.00",
    score: 80,
    status,
    isVaultSealed: Boolean(supplierId)
  });
  const contract = (
    id: string,
    quoteId: string,
    amount: string,
    commissionAmount: string,
    status: ContractStatus,
    signedAt: Date | null = null
  ) => ({
    id,
    quoteId,
    vendorName: `Vendor ${quoteId}`,
    category: "Hotels",
    amount,
    commissionAmount,
    status,
    signedAt,
    updatedAt: new Date("2026-10-01T00:00:00Z")
  });

  memory.current.seed({
    user: Object.values(actors).map((actor) => ({
      id: actor.id,
      role: actor.role,
      name: `Name ${actor.id}`,
      email: `${actor.id}@example.test`
    })),
    event: [
      { id: "evt_a", organizerId: "usr_org", date: new Date("2026-11-20T06:00:00Z"), currency: "SAR", timezone: "Asia/Riyadh" },
      { id: "evt_b", organizerId: "usr_org2", date: new Date("2026-12-01T06:00:00Z"), currency: "SAR", timezone: "Asia/Riyadh" }
    ],
    activityIntake: [
      intake("int_a", "evt_a"),
      intake("int_a2", "evt_a"),
      intake("int_b", "evt_b"),
      intake("int_c", null)
    ],
    supplier: [
      {
        id: "sup_hotel",
        userId: "usr_sup_hotel",
        name: "Synthetic sup_hotel",
        category: "HOTEL",
        verified: true,
        commissionPercent: "12.00",
        rating: 4
      }
    ],
    vendorQuote: [
      { ...quote("q_supplier", "int_a", QuoteStatus.APPROVED, "sup_hotel"), totalPrice: "9876.00", commissionAmount: "456.00" },
      quote("q_a", "int_a", QuoteStatus.RECEIVED),
      quote("q_a2", "int_a2", QuoteStatus.RECEIVED),
      quote("q_approved", "int_a", QuoteStatus.APPROVED),
      quote("q_signed", "int_a", QuoteStatus.RECEIVED),
      quote("q_b", "int_b", QuoteStatus.RECEIVED),
      quote("q_c", "int_c", QuoteStatus.RECEIVED)
    ],
    vendorContract: [
      contract("c_supplier", "q_supplier", "9876.00", "456.00", ContractStatus.DRAFT),
      contract("c_draft", "q_a", "5000.00", "600.00", ContractStatus.DRAFT),
      contract("c_signed", "q_signed", "7000.00", "840.00", ContractStatus.SIGNED, new Date("2026-10-15T09:00:00Z"))
    ]
  });
}

let http: Harness;

beforeAll(async () => {
  http = await startHarness([["/api", operationsRouter]]);
});

afterAll(async () => {
  await http.close();
});

beforeEach(() => {
  seed();
});

const quoteRow = (id: string) => memory.current.rows("vendorQuote").find((q) => q.id === id)!;
const contractRow = (id: string) => memory.current.rows("vendorContract").find((c) => c.id === id)!;
const snapshot = (model: string) => JSON.stringify(memory.current.rows(model));
const audits = (action: string) => memory.current.rows("auditLog").filter((a) => a.action === action);

const newQuote = (overrides: Record<string, unknown> = {}) => ({
  intakeId: "int_a",
  category: "Transport",
  vendorName: "Synthetic coaches",
  item: "Coach hire",
  quantity: 2,
  unitPrice: 1500,
  commissionPercent: 10,
  ...overrides
});

const newContract = (overrides: Record<string, unknown> = {}) => ({
  quoteId: "q_a2",
  vendorName: "Vendor q_a2",
  category: "Hotels",
  amount: 10000,
  commissionAmount: 1200,
  ...overrides
});

async function openVault() {
  expect((await http.post("/api/vault/int_a/authorize", actors.sa)).status).toBe(200);
}

describe("VD011-R2-01: supplier contracts never enter the generic contract update", () => {
  for (const vault of ["sealed", "open"] as const) {
    it(`refuses supplier-to-manual reassignment and term edits (vault ${vault}) for every legacy writer`, async () => {
      if (vault === "open") await openVault();
      const before = snapshot("vendorContract");

      for (const actor of legacyWriters) {
        for (const body of [
          { quoteId: "q_a" },
          { quoteId: "q_a", amount: 1 },
          { amount: 1, commissionAmount: 0 },
          { vendorName: "Detached vendor" },
          { status: "UNDER_REVIEW" }
        ]) {
          const response = await http.put("/api/contracts/c_supplier", actor, body);
          expect(response.status).toBe(409);
          expect(JSON.stringify(response.body)).not.toMatch(SEALED_TERMS);
        }
      }

      // Provenance and terms are untouched; nothing was audited as an update.
      expect(snapshot("vendorContract")).toBe(before);
      expect(contractRow("c_supplier")).toMatchObject({ quoteId: "q_supplier", amount: "9876.00", commissionAmount: "456.00" });
      expect(audits("contract.update")).toHaveLength(0);
    });
  }

  it("refuses an organizer outside the supplier contract's event and denied roles, without terms", async () => {
    const before = snapshot("vendorContract");
    const outside = await http.put("/api/contracts/c_supplier", actors.org2, { quoteId: "q_b" });
    expect(outside.status).toBe(403);
    expect(JSON.stringify(outside.body)).not.toMatch(SEALED_TERMS);

    for (const actor of deniedRoles) {
      const response = await http.put("/api/contracts/c_supplier", actor, { quoteId: "q_a" });
      expect(response.status).toBe(403);
      expect(JSON.stringify(response.body)).not.toMatch(SEALED_TERMS);
    }
    expect(snapshot("vendorContract")).toBe(before);
  });

  it("keeps the supplier contract hidden from logistics listing while sealed", async () => {
    const list = await http.get("/api/contracts", actors.lm);
    expect(list.status).toBe(200);
    expect(list.body.contracts.map((c: { id: string }) => c.id)).not.toContain("c_supplier");
    expect(JSON.stringify(list.body)).not.toMatch(SEALED_TERMS);
  });

  it("refuses moving a legacy contract onto a supplier quote", async () => {
    await openVault();
    for (const actor of legacyWriters) {
      expect((await http.put("/api/contracts/c_draft", actor, { quoteId: "q_supplier" })).status).toBe(409);
    }
    expect(contractRow("c_draft").quoteId).toBe("q_a");
  });

  it("requires access to both the current and the proposed scope for legacy reparenting", async () => {
    // Organizer A cannot move its contract into organizer B's intake ...
    expect((await http.put("/api/contracts/c_draft", actors.org, { quoteId: "q_b" })).status).toBe(403);
    // ... and organizer B cannot pull organizer A's contract into its own.
    expect((await http.put("/api/contracts/c_draft", actors.org2, { quoteId: "q_b" })).status).toBe(403);
    expect(contractRow("c_draft").quoteId).toBe("q_a");
    expect((await http.put("/api/contracts/c_draft", actors.lm, { quoteId: "q_missing" })).status).toBe(404);

    // Within its own scopes the ordinary legacy reassignment still works.
    const moved = await http.put("/api/contracts/c_draft", actors.org, { quoteId: "q_a2" });
    expect(moved.status).toBe(200);
    expect(moved.body.contract).toMatchObject({ id: "c_draft", quoteId: "q_a2", status: "DRAFT" });
    expect(audits("contract.update")).toHaveLength(1);
  });
});

describe("VD011-R2-02: generic quotation writes cannot grant or undo approval", () => {
  it("rejects APPROVED and provenance injection on create, for every legacy writer", async () => {
    const before = snapshot("vendorQuote");
    for (const actor of legacyWriters) {
      expect((await http.post("/api/vendor-quotes", actor, newQuote({ status: "APPROVED" }))).status).toBe(400);
      expect((await http.post("/api/vendor-quotes", actor, newQuote({ supplierId: "sup_hotel" }))).status).toBe(400);
      expect((await http.post("/api/vendor-quotes", actor, newQuote({ isVaultSealed: false }))).status).toBe(400);
    }
    expect(snapshot("vendorQuote")).toBe(before);
  });

  it("initialises permitted non-approved legacy quotes server-side", async () => {
    const created = await http.post("/api/vendor-quotes", actors.org, newQuote());
    expect(created.status).toBe(201);
    expect(created.body.vendorQuote).toMatchObject({ status: "REQUESTED", totalPrice: 3000 });
    expect(created.body.vendorQuote.supplierId ?? null).toBeNull();
    const received = await http.post("/api/vendor-quotes", actors.lm, newQuote({ status: "RECEIVED" }));
    expect(received.status).toBe(201);
    expect(received.body.vendorQuote.status).toBe("RECEIVED");
    expect((await http.post("/api/vendor-quotes", actors.org2, newQuote())).status).toBe(403);
  });

  it("rejects granting approval through the generic update", async () => {
    for (const actor of legacyWriters) {
      expect((await http.put("/api/vendor-quotes/q_a", actor, { status: "APPROVED" })).status).toBe(400);
      expect((await http.put("/api/vendor-quotes/q_a", actor, { status: "APPROVED", unitPrice: 1 })).status).toBe(400);
    }
    expect(quoteRow("q_a")).toMatchObject({ status: QuoteStatus.RECEIVED, unitPrice: "1000.00" });
  });

  it("locks an approved quotation: no undo, term edit, reparent or delete", async () => {
    const before = snapshot("vendorQuote");
    for (const actor of legacyWriters) {
      for (const body of [
        { status: "RECEIVED" },
        { status: "REJECTED" },
        { unitPrice: 1 },
        { commissionPercent: 0 },
        { intakeId: "int_a2" },
        { vendorName: "Renamed vendor" }
      ]) {
        expect((await http.put("/api/vendor-quotes/q_approved", actor, body)).status).toBe(409);
      }
    }
    expect((await http.del("/api/vendor-quotes/q_approved", actors.lm)).status).toBe(409);
    expect((await http.del("/api/vendor-quotes/q_approved", actors.sa)).status).toBe(409);
    expect(snapshot("vendorQuote")).toBe(before);
    expect(audits("vendor_quote.update")).toHaveLength(0);
  });

  it("locks the terms of a quotation whose contract is signed, and keeps contracted quotes", async () => {
    expect((await http.put("/api/vendor-quotes/q_signed", actors.lm, { unitPrice: 1 })).status).toBe(409);
    expect((await http.del("/api/vendor-quotes/q_signed", actors.lm)).status).toBe(409);
    // A draft contract also keeps its quotation from being deleted (no orphaning).
    expect((await http.del("/api/vendor-quotes/q_a", actors.lm)).status).toBe(409);
    expect(quoteRow("q_signed").unitPrice).toBe("1000.00");
    expect(memory.current.rows("vendorQuote").some((q) => q.id === "q_a")).toBe(true);
  });

  it("keeps legitimate legacy draft editing and deletion", async () => {
    const edit = await http.put("/api/vendor-quotes/q_a", actors.org, { unitPrice: 900, status: "RECOMMENDED" });
    expect(edit.status).toBe(200);
    expect(edit.body.vendorQuote).toMatchObject({ status: "RECOMMENDED", totalPrice: 9000 });
    expect(audits("vendor_quote.update")).toHaveLength(1);

    expect((await http.put("/api/vendor-quotes/q_a", actors.org2, { unitPrice: 1 })).status).toBe(403);
    for (const actor of deniedRoles) {
      expect((await http.put("/api/vendor-quotes/q_a", actor, { unitPrice: 1 })).status).toBe(403);
    }

    expect((await http.del("/api/vendor-quotes/q_a2", actors.lm)).status).toBe(204);
    expect(memory.current.rows("vendorQuote").some((q) => q.id === "q_a2")).toBe(false);
  });

  it("approval stays the exclusive, audited Super Admin decision", async () => {
    expect((await http.put("/api/vendor-quotes/q_a2/approve", actors.lm)).status).toBe(403);
    expect((await http.put("/api/vendor-quotes/q_a2/approve", actors.org)).status).toBe(403);
    const approved = await http.put("/api/vendor-quotes/q_a2/approve", actors.sa);
    expect(approved.status).toBe(200);
    expect(approved.body.vendorQuote.status).toBe("APPROVED");
    expect(audits("vendor_quote.approve")).toHaveLength(1);
    // Once approved, the generic path can no longer change it.
    expect((await http.put("/api/vendor-quotes/q_a2", actors.lm, { status: "RECEIVED" })).status).toBe(409);
  });

  it("re-checks fresh state under the lock: an approval landing after the preflight read wins", async () => {
    // Simulates a Super Admin approval committing between this request's
    // preflight read and its locked write.
    memory.current.beforeNext("$raw", "$queryRaw", () => {
      quoteRow("q_a").status = QuoteStatus.APPROVED;
    });
    const response = await http.put("/api/vendor-quotes/q_a", actors.lm, { unitPrice: 1, status: "RECEIVED" });
    expect(response.status).toBe(409);
    // The memory double rolls the whole transaction back (including the
    // simulated approval); what matters is that this edit wrote nothing.
    expect(quoteRow("q_a")).toMatchObject({ unitPrice: "1000.00", totalPrice: "10000.00" });
    expect(audits("vendor_quote.update")).toHaveLength(0);
  });
});

describe("VD011-R2-03: generic contract writes cannot sign or edit signed contracts", () => {
  it("rejects SIGNED/ACTIVE status and signedAt injection on create, for every legacy writer", async () => {
    for (const actor of legacyWriters) {
      for (const injected of [
        { status: "SIGNED", signedAt: "2026-11-01T10:00:00Z" },
        { status: "SIGNED" },
        { status: "ACTIVE" },
        { signedAt: "2026-11-01T10:00:00Z" }
      ]) {
        expect((await http.post("/api/contracts", actor, newContract(injected))).status).toBe(400);
      }
    }
    expect(memory.current.rows("vendorContract")).toHaveLength(3);
  });

  it("creates an unsigned legacy draft server-side", async () => {
    const created = await http.post("/api/contracts", actors.org, newContract());
    expect(created.status).toBe(201);
    expect(created.body.contract).toMatchObject({ quoteId: "q_a2", status: "DRAFT", signedAt: null });
    expect(audits("contract.create")).toHaveLength(1);
    expect((await http.post("/api/contracts", actors.org2, newContract())).status).toBe(403);
    expect((await http.post("/api/contracts", actors.lm, newContract({ quoteId: "q_supplier" }))).status).toBe(409);
  });

  it("rejects SIGNED/signedAt injection on an existing draft", async () => {
    for (const actor of legacyWriters) {
      expect((await http.put("/api/contracts/c_draft", actor, { status: "SIGNED", signedAt: "2026-11-01T10:00:00Z" })).status).toBe(400);
      expect((await http.put("/api/contracts/c_draft", actor, { status: "SIGNED" })).status).toBe(400);
      expect((await http.put("/api/contracts/c_draft", actor, { signedAt: "2026-11-01T10:00:00Z" })).status).toBe(400);
    }
    expect(contractRow("c_draft")).toMatchObject({ status: ContractStatus.DRAFT, signedAt: null });
  });

  it("refuses status rollback, term edits and reparenting of a signed contract", async () => {
    const before = snapshot("vendorContract");
    for (const actor of legacyWriters) {
      for (const body of [
        { status: "DRAFT" },
        { status: "UNDER_REVIEW" },
        { amount: 1 },
        { commissionAmount: 0 },
        { vendorName: "Renamed vendor" },
        { quoteId: "q_a" }
      ]) {
        expect((await http.put("/api/contracts/c_signed", actor, body)).status).toBe(409);
      }
    }
    expect(snapshot("vendorContract")).toBe(before);
    expect(contractRow("c_signed")).toMatchObject({ status: ContractStatus.SIGNED, amount: "7000.00" });
  });

  it("keeps legitimate edits of an unsigned legacy contract", async () => {
    const edit = await http.put("/api/contracts/c_draft", actors.org, { status: "UNDER_REVIEW", amount: 5500 });
    expect(edit.status).toBe(200);
    expect(edit.body.contract).toMatchObject({ status: "UNDER_REVIEW", amount: 5500, signedAt: null });
    for (const actor of deniedRoles) {
      expect((await http.put("/api/contracts/c_draft", actor, { amount: 1 })).status).toBe(403);
    }
  });

  it("signing stays the exclusive, audited Super Admin decision; afterwards the contract is locked", async () => {
    expect((await http.put("/api/contracts/c_draft/approve", actors.lm)).status).toBe(403);
    expect((await http.put("/api/contracts/c_draft/approve", actors.org)).status).toBe(403);
    const signed = await http.put("/api/contracts/c_draft/approve", actors.sa);
    expect(signed.status).toBe(200);
    expect(signed.body.contract.status).toBe("SIGNED");
    expect(signed.body.contract.signedAt).toBeTruthy();
    expect(audits("contract.approve")).toHaveLength(1);

    expect((await http.put("/api/contracts/c_draft/approve", actors.sa)).status).toBe(409);
    expect((await http.put("/api/contracts/c_draft", actors.lm, { status: "DRAFT" })).status).toBe(409);
    expect((await http.put("/api/contracts/c_draft", actors.sa, { amount: 1 })).status).toBe(409);
    expect(contractRow("c_draft")).toMatchObject({ status: ContractStatus.SIGNED, amount: "5000.00" });
  });

  it("re-checks fresh state under the lock: a signature landing after the preflight read wins", async () => {
    memory.current.beforeNext("$raw", "$queryRaw", () => {
      Object.assign(contractRow("c_draft"), { status: ContractStatus.SIGNED, signedAt: new Date() });
    });
    const response = await http.put("/api/contracts/c_draft", actors.lm, { amount: 1, status: "DRAFT" });
    expect(response.status).toBe(409);
    // The memory double rolls back the simulated signature with this
    // transaction; the edit itself must not have been written or audited.
    expect(contractRow("c_draft")).toMatchObject({ amount: "5000.00" });
    expect(audits("contract.update")).toHaveLength(0);
  });
});

describe("D-011: legacy financial decisions and mutations are atomic with their audit", () => {
  const AUDIT_DOWN = () =>
    memory.current.failNext("auditLog", "create", new Error("synthetic audit store outage"));

  /** The audit outage rolls the request back and leaks nothing internal. */
  function expectRolledBack(response: { status: number; body: any }) {
    expect(response.status).toBe(500);
    expect(response.body.error.message).toBe("Internal server error");
    expect(JSON.stringify(response.body)).not.toMatch(/synthetic audit store outage/);
  }

  it("approval: no APPROVED status survives a failed audit; the retry is audited exactly once", async () => {
    const before = snapshot("vendorQuote");
    AUDIT_DOWN();
    expectRolledBack(await http.put("/api/vendor-quotes/q_a2/approve", actors.sa));
    expect(quoteRow("q_a2").status).toBe(QuoteStatus.RECEIVED);
    expect(snapshot("vendorQuote")).toBe(before);
    expect(audits("vendor_quote.approve")).toHaveLength(0);

    const approved = await http.put("/api/vendor-quotes/q_a2/approve", actors.sa);
    expect(approved.status).toBe(200);
    expect(quoteRow("q_a2").status).toBe(QuoteStatus.APPROVED);
    const [audit] = audits("vendor_quote.approve");
    expect(audits("vendor_quote.approve")).toHaveLength(1);
    expect(audit).toMatchObject({
      actorUserId: "usr_sa",
      actorRole: Role.SUPER_ADMIN,
      entityType: "VENDOR_QUOTE",
      entityId: "q_a2",
      eventId: "evt_a",
      beforeData: expect.objectContaining({ status: "RECEIVED" }),
      afterData: expect.objectContaining({ status: "APPROVED" }),
      metadata: expect.objectContaining({
        intakeId: "int_a2",
        decision: "APPROVED",
        previousStatus: "RECEIVED",
        method: "PUT",
        path: "/api/vendor-quotes/q_a2/approve"
      })
    });

    // One decision only: a repeat approval is refused and adds no audit.
    expect((await http.put("/api/vendor-quotes/q_a2/approve", actors.sa)).status).toBe(409);
    expect(audits("vendor_quote.approve")).toHaveLength(1);
  });

  it("signing: no SIGNED status or signedAt survives a failed audit; the retry is audited exactly once", async () => {
    const before = snapshot("vendorContract");
    AUDIT_DOWN();
    expectRolledBack(await http.put("/api/contracts/c_draft/approve", actors.sa));
    expect(contractRow("c_draft")).toMatchObject({ status: ContractStatus.DRAFT, signedAt: null });
    expect(snapshot("vendorContract")).toBe(before);
    expect(audits("contract.approve")).toHaveLength(0);

    const signed = await http.put("/api/contracts/c_draft/approve", actors.sa);
    expect(signed.status).toBe(200);
    expect(contractRow("c_draft").status).toBe(ContractStatus.SIGNED);
    expect(contractRow("c_draft").signedAt).toBeTruthy();
    expect(audits("contract.approve")).toHaveLength(1);
    expect(audits("contract.approve")[0]).toMatchObject({
      actorUserId: "usr_sa",
      actorRole: Role.SUPER_ADMIN,
      entityType: "CONTRACT",
      entityId: "c_draft",
      eventId: "evt_a",
      beforeData: expect.objectContaining({ status: "DRAFT", signedAt: null }),
      afterData: expect.objectContaining({ status: "SIGNED" }),
      metadata: expect.objectContaining({ quoteId: "q_a", decision: "SIGNED", previousStatus: "DRAFT" })
    });

    expect((await http.put("/api/contracts/c_draft/approve", actors.sa)).status).toBe(409);
    expect(audits("contract.approve")).toHaveLength(1);
  });

  it("generic quotation create/edit/delete write nothing when their audit fails", async () => {
    const quotes = snapshot("vendorQuote");
    const intakes = snapshot("activityIntake");

    AUDIT_DOWN();
    expectRolledBack(await http.post("/api/vendor-quotes", actors.lm, newQuote()));
    AUDIT_DOWN();
    expectRolledBack(await http.put("/api/vendor-quotes/q_a2", actors.lm, { unitPrice: 1, status: "RECOMMENDED" }));
    AUDIT_DOWN();
    expectRolledBack(await http.del("/api/vendor-quotes/q_a2", actors.lm));

    expect(snapshot("vendorQuote")).toBe(quotes);
    expect(snapshot("activityIntake")).toBe(intakes);
    expect(memory.current.rows("auditLog")).toHaveLength(0);

    // With the audit store back, each mutation commits with exactly one audit.
    expect((await http.put("/api/vendor-quotes/q_a2", actors.lm, { unitPrice: 900 })).status).toBe(200);
    expect(audits("vendor_quote.update")).toHaveLength(1);
    expect(audits("vendor_quote.update")[0]).toMatchObject({
      actorUserId: "usr_lm",
      beforeData: expect.objectContaining({ unitPrice: "1000.00" }),
      afterData: expect.objectContaining({ totalPrice: 9000 })
    });
    expect((await http.del("/api/vendor-quotes/q_a2", actors.lm)).status).toBe(204);
    expect(audits("vendor_quote.delete")).toHaveLength(1);
  });

  it("generic contract create/edit write nothing when their audit fails", async () => {
    const before = snapshot("vendorContract");
    AUDIT_DOWN();
    expectRolledBack(await http.post("/api/contracts", actors.lm, newContract()));
    AUDIT_DOWN();
    expectRolledBack(await http.put("/api/contracts/c_draft", actors.lm, { amount: 1, status: "UNDER_REVIEW" }));
    expect(snapshot("vendorContract")).toBe(before);
    expect(memory.current.rows("auditLog")).toHaveLength(0);

    expect((await http.put("/api/contracts/c_draft", actors.lm, { amount: 5100 })).status).toBe(200);
    expect(audits("contract.update")).toHaveLength(1);
    expect(audits("contract.update")[0]).toMatchObject({
      actorUserId: "usr_lm",
      actorRole: Role.LOGISTICS_MANAGER,
      beforeData: expect.objectContaining({ amount: "5000.00" }),
      afterData: expect.objectContaining({ amount: 5100 })
    });
  });

  it("intake deletion is kept when its audit fails", async () => {
    AUDIT_DOWN();
    expectRolledBack(await http.del("/api/activity-intakes/int_c", actors.lm));
    expect(memory.current.rows("activityIntake").some((i) => i.id === "int_c")).toBe(true);
    expect(audits("activity_intake.delete")).toHaveLength(0);

    expect((await http.del("/api/activity-intakes/int_c", actors.lm)).status).toBe(204);
    expect(audits("activity_intake.delete")).toHaveLength(1);
  });
});

describe("deletion is not a bypass of financial decisions", () => {
  it("refuses deleting an intake holding an approved quotation or a contract", async () => {
    // int_a2: approve its quote through the decision route, then try to delete.
    expect((await http.put("/api/vendor-quotes/q_a2/approve", actors.sa)).status).toBe(200);
    expect((await http.del("/api/activity-intakes/int_a2", actors.lm)).status).toBe(409);

    // int_c: a contract on its quote also blocks deletion.
    expect((await http.post("/api/contracts", actors.lm, newContract({ quoteId: "q_c" }))).status).toBe(201);
    expect((await http.del("/api/activity-intakes/int_c", actors.sa)).status).toBe(409);
    expect(memory.current.rows("activityIntake").map((i) => i.id).sort()).toEqual(["int_a", "int_a2", "int_b", "int_c"]);
  });

  it("still deletes an intake with only non-approved, uncontracted legacy quotes", async () => {
    expect((await http.del("/api/activity-intakes/int_c", actors.lm)).status).toBe(204);
    expect(memory.current.rows("activityIntake").some((i) => i.id === "int_c")).toBe(false);
  });
});
