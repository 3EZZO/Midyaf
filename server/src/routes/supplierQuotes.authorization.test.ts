import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ActivityStatus, QuoteStatus, Role } from "@prisma/client";
import type { MemoryPrisma } from "../testing/memoryPrisma.js";
import type { Harness } from "../testing/httpHarness.js";

/**
 * SUPPLIER-001 HTTP checks for owned immutable quotations, append-only notes,
 * the logistics review/rejection path, and the D-011 policy (approved
 * 2026-10-31): the Super Admin alone opens the vault, approves and contracts.
 * Real routers and JWT middleware over an in-memory Prisma
 * double; telemetry/geofence singletons are stubbed. Synthetic records only.
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
const suppliersRouter = (await import("./suppliers.js")).default;
const operationsRouter = (await import("./operations.js")).default;
const { SUPPLIER_DEMO_REQUESTS } = await import("../utils/supplierPortal.js");

const DEMO = SUPPLIER_DEMO_REQUESTS[0];
const QUOTES = `/api/suppliers/me/requests/${DEMO.intakeId}/quotes`;
const NOTES = `/api/suppliers/me/requests/${DEMO.intakeId}/notes`;

const actors = {
  hotel: { id: "usr_sup_hotel", role: Role.SUPPLIER },
  hotel2: { id: "usr_sup_hotel2", role: Role.SUPPLIER },
  hotel3: { id: "usr_sup_hotel3", role: Role.SUPPLIER },
  catering: { id: "usr_sup_catering", role: Role.SUPPLIER },
  badCommission: { id: "usr_sup_bad", role: Role.SUPPLIER },
  unlinked: { id: "usr_sup_unlinked", role: Role.SUPPLIER },
  lm: { id: "usr_lm", role: Role.LOGISTICS_MANAGER },
  sa: { id: "usr_sa", role: Role.SUPER_ADMIN },
  org: { id: "usr_org", role: Role.ORGANIZER },
  org2: { id: "usr_org2", role: Role.ORGANIZER },
  coordinator: { id: "usr_coord", role: Role.COORDINATOR },
  company: { id: "usr_company", role: Role.COMPANY_ORGANIZER }
};

const validQuote = { item: "Synthetic supplier hotel offer", quantity: 15, unitPrice: 1200 };

function seed() {
  const intake = (id: string, eventId: string | null, status = ActivityStatus.QUOTING) => ({
    id,
    eventId,
    activityName: `Activity ${id}`,
    activityPlace: "Synthetic place",
    visitorCount: 24,
    vipVisitorCount: 6,
    normalVisitorCount: 18,
    ticketType: "MIXED",
    status,
    submittedBy: "company@example.test"
  });
  const supplier = (id: string, userId: string | null, category: string, commissionPercent = "12.00") => ({
    id,
    userId,
    name: `Synthetic ${id}`,
    category,
    verified: true,
    commissionPercent,
    rating: 4
  });
  const legacy = (id: string, intakeId: string) => ({
    id,
    intakeId,
    supplierId: null,
    category: "Hotels",
    vendorName: `Legacy ${id}`,
    item: "Legacy rooms",
    quantity: 10,
    unitPrice: "1000.00",
    totalPrice: "10000.00",
    commissionPercent: "12.00",
    commissionAmount: "1200.00",
    score: 80,
    status: QuoteStatus.RECEIVED,
    isVaultSealed: true
  });

  memory.current.seed({
    user: Object.values(actors).map((actor) => ({
      id: actor.id,
      role: actor.role,
      name: `Name ${actor.id}`,
      email: `${actor.id}@example.test`
    })),
    event: [
      { id: DEMO.eventId, organizerId: "usr_org", date: new Date("2026-11-02T06:00:00Z"), currency: "SAR", timezone: "Asia/Riyadh" },
      { id: "evt_org_b", organizerId: "usr_org", date: new Date("2026-11-20T06:00:00Z"), currency: "SAR", timezone: "Asia/Riyadh" },
      { id: "evt_other", organizerId: "usr_org2", date: new Date("2026-12-01T06:00:00Z"), currency: "SAR", timezone: "Asia/Riyadh" }
    ],
    activityIntake: [
      intake(DEMO.intakeId, DEMO.eventId),
      intake("int_org_b", "evt_org_b"),
      intake("int_other", "evt_other")
    ],
    supplier: [
      supplier("sup_hotel", "usr_sup_hotel", "HOTEL"),
      supplier("sup_hotel2", "usr_sup_hotel2", "HOTEL"),
      supplier("sup_hotel3", "usr_sup_hotel3", "HOTEL"),
      supplier("sup_catering", "usr_sup_catering", "CATERING"),
      supplier("sup_bad", "usr_sup_bad", "HOTEL", "30.00")
    ],
    vendorQuote: [legacy("q_legacy", DEMO.intakeId), legacy("q_legacy_b", "int_org_b")]
  });
}

let http: Harness;

beforeAll(async () => {
  http = await startHarness([
    ["/api/suppliers", suppliersRouter],
    ["/api", operationsRouter]
  ]);
});

afterAll(async () => {
  await http.close();
});

beforeEach(() => {
  seed();
});

const supplierQuotes = () => memory.current.rows("vendorQuote").filter((q) => q.supplierId);
const audits = (action: string) => memory.current.rows("auditLog").filter((a) => a.action === action);

async function submitHotelQuote() {
  const response = await http.post(QUOTES, actors.hotel, validQuote);
  expect(response.status).toBe(201);
  return response.body.quote as { id: string };
}

describe("POST /suppliers/me/requests/:intakeId/quotes", () => {
  it("persists an owned, RECEIVED, sealed quote with server-computed terms", async () => {
    const { status, body } = await http.post(QUOTES, actors.hotel, validQuote);
    expect(status).toBe(201);
    expect(body.quote).toMatchObject({
      intakeId: DEMO.intakeId,
      category: "HOTEL",
      item: "Synthetic supplier hotel offer",
      quantity: 15,
      unitPrice: "1200.00",
      totalPrice: "18000.00",
      currency: "SAR",
      status: "RECEIVED",
      sealed: true
    });
    expect(JSON.stringify(body)).not.toMatch(/score|commission|vendorName/);

    const [row] = supplierQuotes();
    expect(row).toMatchObject({
      supplierId: "sup_hotel",
      vendorName: "Synthetic sup_hotel",
      category: "HOTEL",
      status: QuoteStatus.RECEIVED,
      isVaultSealed: true,
      score: 0,
      totalPrice: "18000.00",
      commissionPercent: "12.00",
      commissionAmount: "2160.00"
    });

    // The intake row was locked inside the transaction.
    expect(memory.current.calls.some((call) => call.method === "$queryRaw")).toBe(true);
    const [audit] = audits("supplier_quote.submit");
    expect(audit).toMatchObject({
      actorUserId: "usr_sup_hotel",
      entityId: row.id,
      eventId: DEMO.eventId,
      metadata: { intakeId: DEMO.intakeId, supplierId: "sup_hotel", quoteId: row.id }
    });
    expect(JSON.stringify(audit)).not.toMatch(/1200|18000|2160|offer/);
  });

  it("refuses a second initial quote, also when two arrive at once", async () => {
    await submitHotelQuote();
    expect((await http.post(QUOTES, actors.hotel, validQuote)).status).toBe(409);

    seed();
    const results = await Promise.all([
      http.post(QUOTES, actors.hotel, validQuote),
      http.post(QUOTES, actors.hotel, { ...validQuote, unitPrice: 1 })
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(supplierQuotes()).toHaveLength(1);
  });

  it("lets a different supplier of the same category submit its own", async () => {
    await submitHotelQuote();
    expect((await http.post(QUOTES, actors.hotel2, validQuote)).status).toBe(201);
    expect(new Set(supplierQuotes().map((q) => q.supplierId))).toEqual(
      new Set(["sup_hotel", "sup_hotel2"])
    );
  });

  it.each([
    ["supplierId", { supplierId: "sup_hotel2" }],
    ["vendorName", { vendorName: "Spoofed" }],
    ["category", { category: "CAR" }],
    ["status", { status: "APPROVED" }],
    ["score", { score: 100 }],
    ["commissionPercent", { commissionPercent: 0 }],
    ["totalPrice", { totalPrice: 1 }],
    ["isVaultSealed", { isVaultSealed: false }],
    ["role", { role: "SUPER_ADMIN" }]
  ])("rejects the privileged field %s without writing", async (_name, extra) => {
    const response = await http.post(QUOTES, actors.hotel, { ...validQuote, ...extra });
    expect(response.status).toBe(400);
    expect(supplierQuotes()).toHaveLength(0);
  });

  it("denies inaccessible requests with the same 404 before any write", async () => {
    const paths = [
      "/api/suppliers/me/requests/int_other/quotes",
      "/api/suppliers/me/requests/int_missing/quotes",
      "/api/suppliers/me/requests/bad%20id!/quotes"
    ];
    for (const path of paths) {
      const response = await http.post(path, actors.hotel, validQuote);
      expect(response.status).toBe(404);
      expect(response.body.error.message).toBe("Request not found");
    }
    // Category without demand.
    expect((await http.post(QUOTES, actors.catering, validQuote)).status).toBe(404);
    // Closed request.
    memory.current.rows("activityIntake").find((i) => i.id === DEMO.intakeId)!.status =
      ActivityStatus.CONTRACTING;
    expect((await http.post(QUOTES, actors.hotel, validQuote)).status).toBe(404);
    expect(supplierQuotes()).toHaveLength(0);
  });

  it("requires a linked supplier profile and the SUPPLIER role", async () => {
    expect((await http.post(QUOTES, actors.unlinked, validQuote)).status).toBe(403);
    for (const actor of [actors.lm, actors.org, actors.company]) {
      expect((await http.post(QUOTES, actor, validQuote)).status).toBe(403);
    }
  });

  it("refuses totals that overflow and commissions outside the stored bounds", async () => {
    const overflow = await http.post(QUOTES, actors.hotel, {
      item: "Too large",
      quantity: 1_000_000,
      unitPrice: 9_999_999.99
    });
    expect(overflow.status).toBe(422);
    expect((await http.post(QUOTES, actors.badCommission, validQuote)).status).toBe(409);
    expect(supplierQuotes()).toHaveLength(0);
  });

  it("rolls the quote back when the audit write fails", async () => {
    memory.current.failNext("auditLog", "create", new Error("audit store unavailable"));
    const response = await http.post(QUOTES, actors.hotel, validQuote);
    expect(response.status).toBe(500);
    expect(response.body.error.message).toBe("Internal server error");
    expect(supplierQuotes()).toHaveLength(0);
  });
});

describe("POST /suppliers/me/requests/:intakeId/notes", () => {
  it("appends a note with author provenance and a text-free audit", async () => {
    const response = await http.post(NOTES, actors.hotel, { text: "Synthetic recommendation" });
    expect(response.status).toBe(201);
    const [note] = memory.current.rows("supplierRequestNote");
    expect(note).toMatchObject({
      intakeId: DEMO.intakeId,
      supplierId: "sup_hotel",
      authorUserId: "usr_sup_hotel",
      text: "Synthetic recommendation"
    });
    const [audit] = audits("supplier_note.append");
    expect(audit.metadata).toEqual({ intakeId: DEMO.intakeId, supplierId: "sup_hotel", noteId: note.id });
    expect(JSON.stringify(audit)).not.toContain("Synthetic recommendation");

    const own = await http.get("/api/suppliers/me/requests", actors.hotel);
    expect(own.body.requests[0].notes.map((n: any) => n.text)).toEqual(["Synthetic recommendation"]);
    const other = await http.get("/api/suppliers/me/requests", actors.hotel2);
    expect(other.body.requests[0].notes).toEqual([]);
  });

  it("rejects extra fields, blank text and inaccessible requests", async () => {
    expect((await http.post(NOTES, actors.hotel, { text: "x", supplierId: "sup_hotel2" })).status).toBe(400);
    expect((await http.post(NOTES, actors.hotel, { text: "   " })).status).toBe(400);
    expect(
      (await http.post("/api/suppliers/me/requests/int_other/notes", actors.hotel, { text: "x" })).status
    ).toBe(404);
    expect(memory.current.rows("supplierRequestNote")).toHaveLength(0);
  });
});

describe("GET /suppliers/me/quotes", () => {
  it("lists only the supplier's own terms, also after the request closes", async () => {
    await submitHotelQuote();
    await http.post(QUOTES, actors.hotel2, validQuote);
    memory.current.rows("activityIntake").find((i) => i.id === DEMO.intakeId)!.status =
      ActivityStatus.CONTRACTING;

    const { status, body } = await http.get("/api/suppliers/me/quotes", actors.hotel);
    expect(status).toBe(200);
    expect(body.quotes).toHaveLength(1);
    expect(body.quotes[0]).toMatchObject({ totalPrice: "18000.00", status: "RECEIVED" });
    expect(JSON.stringify(body)).not.toMatch(/score|commission|Legacy/);
    expect(body.nextCursor).toBeNull();
  });

  it("validates cursors and page sizes", async () => {
    expect((await http.get("/api/suppliers/me/quotes?cursor=q_legacy", actors.hotel)).status).toBe(400);
    expect((await http.get("/api/suppliers/me/quotes?limit=101", actors.hotel)).status).toBe(400);
    expect((await http.get("/api/suppliers/me/quotes?other=1", actors.hotel)).status).toBe(400);
  });
});

describe("legacy quote paths contain supplier submissions", () => {
  it("keeps supplier quotes out of the raw vendor-quote list", async () => {
    await submitHotelQuote();
    const { body } = await http.get("/api/vendor-quotes", actors.lm);
    expect(body.vendorQuotes.map((q: any) => q.id).sort()).toEqual(["q_legacy", "q_legacy_b"]);
    const supplierView = await http.get("/api/vendor-quotes", actors.hotel);
    expect(supplierView.body.vendorQuotes).toEqual([]);
  });

  it("refuses edits, deletion, approval and contracts for supplier quotes", async () => {
    const quote = await submitHotelQuote();
    const before = JSON.stringify(supplierQuotes());

    expect((await http.put(`/api/vendor-quotes/${quote.id}`, actors.lm, { unitPrice: 1 })).status).toBe(409);
    expect((await http.del(`/api/vendor-quotes/${quote.id}`, actors.lm)).status).toBe(409);
    expect((await http.put(`/api/vendor-quotes/${quote.id}/approve`, actors.sa)).status).toBe(409);
    const contract = await http.post("/api/contracts", actors.lm, {
      quoteId: quote.id,
      vendorName: "Synthetic vendor",
      category: "HOTEL",
      amount: 1,
      commissionAmount: 0
    });
    expect(contract.status).toBe(409);

    expect(JSON.stringify(supplierQuotes())).toBe(before);
    expect(memory.current.rows("vendorContract")).toHaveLength(0);
  });

  it("keeps manual legacy edits working and checks both intakes when reparenting", async () => {
    const edit = await http.put("/api/vendor-quotes/q_legacy", actors.org, { unitPrice: 900 });
    expect(edit.status).toBe(200);
    expect(edit.body.vendorQuote.totalPrice).toBe(9000);

    const reparent = await http.put("/api/vendor-quotes/q_legacy", actors.org, { intakeId: "int_other" });
    expect(reparent.status).toBe(403);
    const intoOwn = await http.put("/api/vendor-quotes/q_legacy", actors.org, { intakeId: "int_org_b" });
    expect(intoOwn.status).toBe(200);
    expect((await http.put("/api/vendor-quotes/q_legacy_b", actors.org2, { intakeId: "int_other" })).status).toBe(403);
  });

  it("lets only the Super Admin approve a legacy quote and sign its contract (D-011)", async () => {
    expect((await http.put("/api/vendor-quotes/q_legacy_b/approve", actors.lm)).status).toBe(403);
    expect((await http.put("/api/vendor-quotes/q_legacy_b/approve", actors.org)).status).toBe(403);
    const approved = await http.put("/api/vendor-quotes/q_legacy_b/approve", actors.sa);
    expect(approved.status).toBe(200);
    expect(approved.body.vendorQuote.status).toBe("APPROVED");

    // Logistics may still draft a legacy contract; signing is the Super Admin's.
    const draft = await http.post("/api/contracts", actors.org, {
      quoteId: "q_legacy_b",
      vendorName: "Legacy q_legacy_b",
      category: "Hotels",
      amount: 10000,
      commissionAmount: 1200
    });
    expect(draft.status).toBe(201);
    expect((await http.put(`/api/contracts/${draft.body.contract.id}/approve`, actors.org)).status).toBe(403);
    expect((await http.put(`/api/contracts/${draft.body.contract.id}/approve`, actors.lm)).status).toBe(403);
    expect((await http.put(`/api/contracts/${draft.body.contract.id}/approve`, actors.sa)).status).toBe(200);
    // Legacy contracts stay listed for logistics.
    expect((await http.get("/api/contracts", actors.org)).body.contracts).toHaveLength(1);
  });

  it("refuses to delete an intake that holds supplier submissions", async () => {
    await submitHotelQuote();
    expect((await http.del(`/api/activity-intakes/${DEMO.intakeId}`, actors.lm)).status).toBe(409);
    expect(memory.current.rows("activityIntake").some((i) => i.id === DEMO.intakeId)).toBe(true);
  });
});

describe("D-011 vault: the Super Admin is the single key holder", () => {
  it("lets logistics read the state, never creates a session on read and denies other roles", async () => {
    const read = await http.get(`/api/vault/${DEMO.intakeId}`, actors.lm);
    expect(read.status).toBe(200);
    expect(read.body).toMatchObject({
      vaultSession: { status: "LOCKED", id: null },
      keyHolder: "SUPER_ADMIN",
      opened: false,
      canOpen: false
    });
    expect((await http.get(`/api/vault/${DEMO.intakeId}`, actors.sa)).body.canOpen).toBe(true);
    expect(memory.current.rows("vaultSession")).toHaveLength(0);

    expect((await http.get(`/api/vault/${DEMO.intakeId}`, actors.hotel)).status).toBe(403);
    expect((await http.get(`/api/vault/${DEMO.intakeId}`, actors.coordinator)).status).toBe(403);
    expect((await http.get(`/api/vault/${DEMO.intakeId}`, actors.org2)).status).toBe(403);
    expect((await http.get("/api/vault/int_missing", actors.lm)).status).toBe(404);
  });

  it("refuses every key turn by other roles, including the event owner and a spoofed label", async () => {
    for (const actor of [actors.lm, actors.org, actors.hotel, actors.coordinator, actors.company]) {
      const response = await http.post(`/api/vault/${DEMO.intakeId}/authorize`, actor, {
        keyNumber: 1,
        roleName: "Midyaf Super Admin"
      });
      expect(response.status).toBe(403);
    }
    expect((await http.post("/api/vault/int_org_b/authorize", actors.org, { keyNumber: 1 })).status).toBe(403);
    expect(memory.current.rows("vaultSession")).toHaveLength(0);
    expect(memory.current.rows("vendorQuote").every((q) => q.isVaultSealed)).toBe(true);
  });

  it("opens the whole intake with one audited Super Admin action", async () => {
    await submitHotelQuote();
    const response = await http.post(`/api/vault/${DEMO.intakeId}/authorize`, actors.sa, {});
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ opened: true, isFullyUnlocked: true });
    expect(response.body.vaultSession).toMatchObject({
      status: "UNLOCKED",
      key1User: "usr_sa@example.test",
      key1Role: "Midyaf Super Admin",
      key2User: null,
      key3User: null
    });
    expect(audits("vault.opened_by_super_admin")).toHaveLength(1);
    // Legacy manual quotes lose their flag; supplier terms keep theirs.
    const rows = memory.current.rows("vendorQuote").filter((q) => q.intakeId === DEMO.intakeId);
    expect(rows.find((q) => q.id === "q_legacy")!.isVaultSealed).toBe(false);
    expect(rows.filter((q) => q.supplierId).every((q) => q.isVaultSealed)).toBe(true);

    // Idempotent: a second open neither changes nor re-audits.
    expect((await http.post(`/api/vault/${DEMO.intakeId}/authorize`, actors.sa)).status).toBe(200);
    expect(audits("vault.opened_by_super_admin")).toHaveLength(1);
    expect((await http.post(`/api/vault/${DEMO.intakeId}/authorize`, actors.sa, { keyNumber: 4 })).status).toBe(400);
    expect((await http.post(`/api/vault/${DEMO.intakeId}/authorize`, actors.sa, { extra: true })).status).toBe(400);
  });

  it("gives a session unlocked by the retired multi-key flow no authority", async () => {
    const quote = await submitHotelQuote();
    memory.current.rows("vaultSession").push({
      id: "vs_legacy",
      intakeId: DEMO.intakeId,
      status: "UNLOCKED",
      key1User: "someone@example.test",
      key1Role: "Sila Operations Director",
      key1ApprovedAt: new Date(),
      unlockedAt: new Date(),
      createdAt: new Date()
    });
    const view = await http.get(`/api/supplier-submissions?intakeId=${DEMO.intakeId}`, actors.sa);
    expect(view.body.vault.opened).toBe(false);
    expect(view.body.submissions[0]).toMatchObject({ sealed: true, terms: null });
    expect((await http.post(`/api/supplier-submissions/${quote.id}/approve`, actors.sa)).status).toBe(409);
  });

  it("lets only the Super Admin re-seal, with an audit entry", async () => {
    expect((await http.post(`/api/vault/${DEMO.intakeId}/reset`, actors.lm)).status).toBe(403);
    expect((await http.post(`/api/vault/${DEMO.intakeId}/reset`, actors.org)).status).toBe(403);
    expect((await http.post(`/api/vault/${DEMO.intakeId}/reset`, actors.hotel)).status).toBe(403);
    await http.post(`/api/vault/${DEMO.intakeId}/authorize`, actors.sa);
    const response = await http.post(`/api/vault/${DEMO.intakeId}/reset`, actors.sa);
    expect(response.status).toBe(200);
    expect(response.body.vaultSession).toMatchObject({ status: "LOCKED", key1Role: null, unlockedAt: null });
    expect(audits("vault.reset_sealed")).toHaveLength(1);
    expect(memory.current.rows("vendorQuote").every((q) => q.isVaultSealed)).toBe(true);
    const view = await http.get(`/api/supplier-submissions?intakeId=${DEMO.intakeId}`, actors.sa);
    expect(view.body.vault.opened).toBe(false);
  });
});

describe("D-011 Super Admin approval and contracts", () => {
  async function twoHotelQuotes() {
    const first = await submitHotelQuote();
    const second = await http.post(QUOTES, actors.hotel2, { ...validQuote, unitPrice: 1100 });
    expect(second.status).toBe(201);
    return { first, second: second.body.quote as { id: string } };
  }

  async function openVault() {
    expect((await http.post(`/api/vault/${DEMO.intakeId}/authorize`, actors.sa)).status).toBe(200);
  }

  it("reveals terms to the Super Admin only after opening, and never to other roles", async () => {
    await submitHotelQuote();
    const sealed = await http.get(`/api/supplier-submissions?intakeId=${DEMO.intakeId}`, actors.sa);
    expect(sealed.body).toMatchObject({ vault: { opened: false, canOpen: true, canApprove: false }, sealedCount: 1 });
    expect(JSON.stringify(sealed.body)).not.toMatch(/1200|18000|2160|Price|commission/);

    await openVault();
    const open = await http.get(`/api/supplier-submissions?intakeId=${DEMO.intakeId}`, actors.sa);
    expect(open.body).toMatchObject({ vault: { opened: true, canApprove: true }, sealedCount: 0 });
    expect(open.body.submissions[0]).toMatchObject({
      sealed: false,
      terms: { unitPrice: "1200.00", totalPrice: "18000.00", commissionPercent: "12.00", commissionAmount: "2160.00", currency: "SAR" }
    });

    for (const actor of [actors.lm, actors.org]) {
      const { body } = await http.get(`/api/supplier-submissions?intakeId=${DEMO.intakeId}`, actor);
      expect(body.vault).toMatchObject({ opened: true, canOpen: false, canApprove: false });
      expect(body.submissions[0]).toMatchObject({ sealed: true, terms: null });
      expect(JSON.stringify(body)).not.toMatch(/1200|18000|2160|Price|commission/);
    }
  });

  it("approves one quote per category, marks the others not selected and closes the category", async () => {
    const { first, second } = await twoHotelQuotes();
    expect((await http.post(`/api/supplier-submissions/${first.id}/approve`, actors.sa)).status).toBe(409);

    await openVault();
    for (const actor of [actors.lm, actors.org, actors.hotel, actors.company]) {
      expect((await http.post(`/api/supplier-submissions/${first.id}/approve`, actor)).status).toBe(403);
    }
    expect((await http.post(`/api/supplier-submissions/${first.id}/approve`, actors.sa, { status: "APPROVED" })).status).toBe(400);
    expect((await http.post("/api/supplier-submissions/q_legacy/approve", actors.sa)).status).toBe(404);

    const approved = await http.post(`/api/supplier-submissions/${first.id}/approve`, actors.sa);
    expect(approved.status).toBe(200);
    expect(approved.body.submission).toMatchObject({ status: "APPROVED", terms: { totalPrice: "18000.00" } });

    const byId = new Map(supplierQuotes().map((q) => [q.id, q]));
    expect(byId.get(first.id)!.status).toBe(QuoteStatus.APPROVED);
    expect(byId.get(second.id)!.status).toBe(QuoteStatus.REJECTED);
    expect(audits("supplier_quote.approve")[0].metadata).toMatchObject({
      quoteId: first.id,
      supplierId: "sup_hotel",
      notSelectedCount: 1
    });

    expect((await http.post(`/api/supplier-submissions/${second.id}/approve`, actors.sa)).status).toBe(409);
    expect((await http.post(`/api/supplier-submissions/${first.id}/approve`, actors.sa)).status).toBe(409);
    // The awarded category takes no further submissions.
    expect((await http.post(QUOTES, actors.hotel3, validQuote)).status).toBe(409);

    expect((await http.get("/api/suppliers/me/quotes", actors.hotel)).body.quotes[0].status).toBe("APPROVED");
    expect((await http.get("/api/suppliers/me/quotes", actors.hotel2)).body.quotes[0].status).toBe("REJECTED");
  });

  it("drafts the contract from the stored quote and lets only the Super Admin see and sign it", async () => {
    const { first, second } = await twoHotelQuotes();
    await openVault();
    expect((await http.post(`/api/supplier-submissions/${first.id}/contract`, actors.sa)).status).toBe(409);
    expect((await http.post(`/api/supplier-submissions/${first.id}/approve`, actors.sa)).status).toBe(200);

    expect((await http.post(`/api/supplier-submissions/${first.id}/contract`, actors.lm)).status).toBe(403);
    expect(
      (await http.post(`/api/supplier-submissions/${first.id}/contract`, actors.sa, { amount: 1 })).status
    ).toBe(400);
    expect((await http.post(`/api/supplier-submissions/${second.id}/contract`, actors.sa)).status).toBe(409);

    const created = await http.post(`/api/supplier-submissions/${first.id}/contract`, actors.sa);
    expect(created.status).toBe(201);
    const [contract] = memory.current.rows("vendorContract");
    expect(contract).toMatchObject({ quoteId: first.id, vendorName: "Synthetic sup_hotel", category: "HOTEL", status: "DRAFT" });
    expect(Number(contract.amount)).toBe(18000);
    expect(Number(contract.commissionAmount)).toBe(2160);
    expect(audits("supplier_contract.create")).toHaveLength(1);
    expect((await http.post(`/api/supplier-submissions/${first.id}/contract`, actors.sa)).status).toBe(409);

    // Listing: the key holder sees it; other logistics roles do not see sealed amounts.
    const saList = await http.get("/api/contracts", actors.sa);
    expect(saList.body.contracts.map((c: any) => c.id)).toContain(contract.id);
    const lmList = await http.get("/api/contracts", actors.lm);
    expect(lmList.body.contracts.map((c: any) => c.id)).not.toContain(contract.id);
    const review = await http.get(`/api/supplier-submissions?intakeId=${DEMO.intakeId}`, actors.org);
    expect(review.body.submissions.find((s: any) => s.quoteId === first.id).contract).toEqual({ id: contract.id, status: "DRAFT" });

    // Legacy contract paths stay closed for supplier quotes.
    const legacyCreate = await http.post("/api/contracts", actors.sa, {
      quoteId: first.id,
      vendorName: "Synthetic vendor",
      category: "HOTEL",
      amount: 1,
      commissionAmount: 0
    });
    expect(legacyCreate.status).toBe(409);
    expect((await http.put(`/api/contracts/${contract.id}`, actors.sa, { amount: 1 })).status).toBe(409);

    expect((await http.put(`/api/contracts/${contract.id}/approve`, actors.lm)).status).toBe(403);
    expect((await http.put(`/api/contracts/${contract.id}/approve`, actors.org)).status).toBe(403);
    const signed = await http.put(`/api/contracts/${contract.id}/approve`, actors.sa);
    expect(signed.status).toBe(200);
    expect(signed.body.contract.status).toBe("SIGNED");
    expect((await http.put(`/api/contracts/${contract.id}/approve`, actors.sa)).status).toBe(409);
  });
});

describe("logistics review of supplier submissions", () => {
  it("shows origin, item, quantity, status and notes to the event owner, never prices", async () => {
    await submitHotelQuote();
    await http.post(NOTES, actors.hotel, { text: "Synthetic recommendation" });

    for (const actor of [actors.lm, actors.org]) {
      const { status, body } = await http.get(
        `/api/supplier-submissions?intakeId=${DEMO.intakeId}`,
        actor
      );
      expect(status).toBe(200);
      expect(body).toMatchObject({
        intakeId: DEMO.intakeId,
        vault: { keyHolder: "SUPER_ADMIN", opened: false, canOpen: false, canApprove: false },
        sealedCount: 1
      });
      expect(body.submissions[0]).toMatchObject({
        source: "SUPPLIER_PORTAL",
        supplier: { id: "sup_hotel", name: "Synthetic sup_hotel", category: "HOTEL" },
        item: "Synthetic supplier hotel offer",
        quantity: 15,
        status: "RECEIVED",
        sealed: true,
        terms: null,
        contract: null
      });
      expect(body.notes[0]).toMatchObject({
        text: "Synthetic recommendation",
        supplier: { id: "sup_hotel" },
        author: { id: "usr_sup_hotel" }
      });
      expect(JSON.stringify(body)).not.toMatch(/1200|18000|2160|Price|commission|score/);
    }
  });

  it("denies non-owners, suppliers and other roles", async () => {
    const path = `/api/supplier-submissions?intakeId=${DEMO.intakeId}`;
    expect((await http.get(path, actors.org2)).status).toBe(403);
    expect((await http.get(path, actors.hotel)).status).toBe(403);
    expect((await http.get(path, actors.coordinator)).status).toBe(403);
    expect((await http.get(path, actors.company)).status).toBe(403);
    expect((await http.get("/api/supplier-submissions", actors.lm)).status).toBe(400);
  });

  it("records an audited rejection that the supplier sees after closure", async () => {
    const quote = await submitHotelQuote();
    const before = { ...supplierQuotes()[0] };

    const rejected = await http.post(`/api/supplier-submissions/${quote.id}/reject`, actors.org, {
      reason: "Synthetic reason"
    });
    expect(rejected.status).toBe(200);
    expect(rejected.body.submission.status).toBe("REJECTED");

    const after = supplierQuotes()[0];
    for (const field of ["item", "quantity", "unitPrice", "totalPrice", "commissionAmount", "supplierId"]) {
      expect(after[field]).toEqual(before[field]);
    }
    const [audit] = audits("supplier_quote.reject");
    expect(audit.metadata).toMatchObject({ quoteId: quote.id, supplierId: "sup_hotel", reasonProvided: true });

    memory.current.rows("activityIntake").find((i) => i.id === DEMO.intakeId)!.status =
      ActivityStatus.CONTRACTING;
    const own = await http.get("/api/suppliers/me/quotes", actors.hotel);
    expect(own.body.quotes[0].status).toBe("REJECTED");

    expect((await http.post(`/api/supplier-submissions/${quote.id}/reject`, actors.lm)).status).toBe(409);
  });

  it("re-checks event ownership under the intake lock before rejecting", async () => {
    const quote = await submitHotelQuote();
    // Ownership moves after the pre-transaction check, before the lock.
    memory.current.beforeNext("$raw", "$queryRaw", () => {
      memory.current.rows("event").find((e) => e.id === DEMO.eventId)!.organizerId = "usr_org2";
    });
    const response = await http.post(`/api/supplier-submissions/${quote.id}/reject`, actors.org, {
      reason: "Synthetic reason"
    });
    expect(response.status).toBe(403);
    expect(supplierQuotes()[0].status).toBe(QuoteStatus.RECEIVED);
    expect(audits("supplier_quote.reject")).toHaveLength(0);
  });

  it("re-checks a relinked intake under the lock", async () => {
    const quote = await submitHotelQuote();
    memory.current.beforeNext("$raw", "$queryRaw", () => {
      memory.current.rows("activityIntake").find((i) => i.id === DEMO.intakeId)!.eventId = "evt_other";
    });
    const response = await http.post(`/api/supplier-submissions/${quote.id}/reject`, actors.org);
    expect(response.status).toBe(403);
    expect(supplierQuotes()[0].status).toBe(QuoteStatus.RECEIVED);
  });

  it("still lets the authorized owner reject after the request closed", async () => {
    const quote = await submitHotelQuote();
    memory.current.rows("activityIntake").find((i) => i.id === DEMO.intakeId)!.status =
      ActivityStatus.CONTRACTING;
    const response = await http.post(`/api/supplier-submissions/${quote.id}/reject`, actors.org);
    expect(response.status).toBe(200);
    expect(supplierQuotes()[0].status).toBe(QuoteStatus.REJECTED);
    expect(audits("supplier_quote.reject")[0]).toMatchObject({ eventId: DEMO.eventId });
  });

  it("denies rejection to suppliers and non-owners, and of legacy quotes", async () => {
    const quote = await submitHotelQuote();
    expect((await http.post(`/api/supplier-submissions/${quote.id}/reject`, actors.hotel)).status).toBe(403);
    expect((await http.post(`/api/supplier-submissions/${quote.id}/reject`, actors.org2)).status).toBe(403);
    expect((await http.post("/api/supplier-submissions/q_legacy/reject", actors.lm)).status).toBe(404);
    expect(
      (await http.post(`/api/supplier-submissions/${quote.id}/reject`, actors.lm, { reason: "x", status: "APPROVED" })).status
    ).toBe(400);
    expect(supplierQuotes()[0].status).toBe(QuoteStatus.RECEIVED);
  });
});
