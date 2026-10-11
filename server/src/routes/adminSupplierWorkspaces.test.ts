import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ActivityStatus, QuoteStatus, Role } from "@prisma/client";
import type { MemoryPrisma } from "../testing/memoryPrisma.js";
import type { Harness } from "../testing/httpHarness.js";

/**
 * ADMIN-PORTALS-001 HTTP checks for the read-only Super Admin supplier
 * workspace: SUPER_ADMIN-only access, supplier isolation by database id,
 * sealed quote metadata without prices (D-011 Pending), no writes on GET, and
 * the supplier's own /me workspace unchanged. Real routers and JWT middleware
 * over an in-memory Prisma double; synthetic records only.
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
const DIRECTORY = "/api/suppliers/admin/workspaces";
const workspaceUrl = (id: string) => `${DIRECTORY}/${id}`;

const sa = { id: "usr_sa", role: Role.SUPER_ADMIN };
const hotel = { id: "usr_sup_hotel", role: Role.SUPPLIER };
const NON_SUPER_ADMIN_ROLES = Object.values(Role).filter((role) => role !== Role.SUPER_ADMIN);

const SECRETS = [
  "1010101010", // CR number
  "1200.00", // hotel's sealed unit price
  "18000.00", // hotel's sealed total
  "777.77", // car's sealed unit price
  "usr_sup_hotel",
  "usr_sup_car",
  "hash-not-a-secret-but-never-returned",
  "secret organizer brief",
  "Synthetic Palace Venue",
  "Synthetic Summit Activity",
  "Hidden metadata"
];

const ADMIN_QUOTE_KEYS = [
  "category",
  "currency",
  "id",
  "intakeId",
  "item",
  "policyPending",
  "quantity",
  "requestReference",
  "sealed",
  "status",
  "submittedAt"
];

function seed() {
  const user = (id: string, role: Role) => ({
    id,
    role,
    name: `Synthetic ${id}`,
    email: `${id}@example.test`,
    passwordHash: "hash-not-a-secret-but-never-returned"
  });
  const quote = (id: string, supplierId: string, category: string, unitPrice: string, totalPrice: string) => ({
    id,
    intakeId: DEMO.intakeId,
    supplierId,
    category,
    vendorName: `Vendor ${supplierId}`,
    item: `Offer from ${supplierId}`,
    quantity: 15,
    unitPrice,
    totalPrice,
    commissionPercent: "12.00",
    commissionAmount: "99.00",
    score: 77,
    status: QuoteStatus.RECEIVED,
    isVaultSealed: true,
    createdAt: new Date("2026-10-05T08:00:00Z")
  });

  memory.current.seed({
    user: [
      user("usr_sa", Role.SUPER_ADMIN),
      user("usr_sup_hotel", Role.SUPPLIER),
      user("usr_sup_car", Role.SUPPLIER),
      user("usr_sup_catering", Role.SUPPLIER),
      user("usr_org", Role.ORGANIZER)
    ],
    cityConfig: [
      { id: "city_ryd", code: "riyadh", nameEn: "Riyadh", nameAr: "الرياض", timezone: "Asia/Riyadh", currency: "SAR" }
    ],
    event: [
      {
        id: DEMO.eventId,
        name: "MIDYAF Demo Summit (Synthetic)",
        organizerId: "usr_org",
        venue: "Synthetic Palace Venue",
        brief: "secret organizer brief",
        date: new Date("2026-11-02T06:00:00Z"),
        currency: "SAR",
        timezone: "Asia/Riyadh",
        status: "LIVE"
      }
    ],
    activityIntake: [
      {
        id: DEMO.intakeId,
        eventId: DEMO.eventId,
        activityName: "Synthetic Summit Activity",
        activityPlace: "Synthetic Palace Venue",
        visitorCount: 24,
        vipVisitorCount: 6,
        normalVisitorCount: 18,
        ticketType: "MIXED",
        status: ActivityStatus.QUOTING,
        submittedBy: "company@example.test"
      }
    ],
    supplier: [
      {
        id: "sup_hotel",
        userId: "usr_sup_hotel",
        name: "Synthetic Hotel Supplier",
        category: "HOTEL",
        verified: true,
        crNumber: "1010101010",
        commissionPercent: "12.00",
        sponsoredRank: 1,
        cityId: "city_ryd",
        rating: 4.5
      },
      { id: "sup_car", userId: "usr_sup_car", name: "Synthetic Car Supplier", category: "CAR", verified: true, commissionPercent: "12.00", rating: 4 },
      { id: "sup_catering", userId: "usr_sup_catering", name: "Synthetic Catering", category: "CATERING", verified: false, commissionPercent: "12.00", rating: 4 },
      { id: "sup_free", userId: null, name: "Unlinked Hotel", category: "HOTEL", verified: false, commissionPercent: "12.00", rating: 4 }
    ],
    service: [
      {
        id: "svc_hotel",
        supplierId: "sup_hotel",
        name: "Executive suite",
        description: "Synthetic suite",
        unit: "night",
        available: true,
        price: "950.00",
        metadata: { note: "Hidden metadata" }
      }
    ],
    booking: [
      {
        id: "bkg_hotel",
        eventId: DEMO.eventId,
        supplierId: "sup_hotel",
        serviceId: "svc_hotel",
        quantity: 3,
        totalPrice: "2850.00",
        commissionPercent: "12.00",
        commissionAmount: "342.00",
        status: "CONFIRMED"
      },
      {
        // Its service row does not exist: omitted, never filled in.
        id: "bkg_car_orphan",
        eventId: DEMO.eventId,
        supplierId: "sup_car",
        serviceId: "svc_missing",
        quantity: 1,
        totalPrice: "500.00",
        commissionPercent: "12.00",
        commissionAmount: "60.00",
        status: "CONFIRMED"
      }
    ],
    vendorQuote: [
      quote("q_hotel", "sup_hotel", "HOTEL", "1200.00", "18000.00"),
      quote("q_car", "sup_car", "CAR", "777.77", "6999.93")
    ],
    supplierRequestNote: [
      { id: "note_hotel", intakeId: DEMO.intakeId, supplierId: "sup_hotel", authorUserId: "usr_sup_hotel", text: "Hotel recommendation", createdAt: new Date("2026-10-06T08:00:00Z") },
      { id: "note_car", intakeId: DEMO.intakeId, supplierId: "sup_car", authorUserId: "usr_sup_car", text: "Car private note", createdAt: new Date("2026-10-06T09:00:00Z") }
    ]
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

function expectNoLeaks(body: unknown) {
  const text = JSON.stringify(body);
  for (const secret of SECRETS) expect(text).not.toContain(secret);
  expect(text).not.toMatch(
    /commission|score|crNumber|passwordHash|sponsoredRank|unitPrice|taxInclusive|userId|email|phone|rating/i
  );
}

describe("GET /suppliers/admin/workspaces (directory)", () => {
  it("lists every profile by name with truthful link state and nothing else", async () => {
    const { status, body } = await http.get(DIRECTORY, sa);
    expect(status).toBe(200);
    expect(body).toEqual({
      suppliers: [
        { id: "sup_car", name: "Synthetic Car Supplier", category: "CAR", accountLinked: true },
        { id: "sup_catering", name: "Synthetic Catering", category: "CATERING", accountLinked: true },
        { id: "sup_hotel", name: "Synthetic Hotel Supplier", category: "HOTEL", accountLinked: true },
        { id: "sup_free", name: "Unlinked Hotel", category: "HOTEL", accountLinked: false }
      ],
      truncated: false
    });
    expectNoLeaks(body);
  });

  it("is bounded to 100 in deterministic name/id order and says when truncated", async () => {
    const rows = memory.current.rows("supplier");
    for (let index = 0; index < 105; index += 1) {
      rows.push({ id: `sup_bulk_${String(104 - index).padStart(3, "0")}`, userId: null, name: "Bulk", category: "HOTEL" });
    }
    const { status, body } = await http.get(DIRECTORY, sa);
    expect(status).toBe(200);
    expect(body.suppliers).toHaveLength(100);
    expect(body.truncated).toBe(true);
    expect(body.suppliers[0].id).toBe("sup_bulk_000");
    expect(body.suppliers[99].id).toBe("sup_bulk_099");
  });

  it("denies unauthenticated callers and every role except SUPER_ADMIN", async () => {
    expect((await http.get(DIRECTORY)).status).toBe(401);
    for (const role of NON_SUPER_ADMIN_ROLES) {
      const response = await http.get(DIRECTORY, { id: `usr_${role.toLowerCase()}`, role });
      expect(response.status, role).toBe(403);
      expect(JSON.stringify(response.body)).not.toContain("Synthetic Hotel Supplier");
    }
    expect((await http.get(DIRECTORY, hotel)).status).toBe(403);
  });

  it("rejects any query parameter, including caller-supplied ids", async () => {
    expect((await http.get(`${DIRECTORY}?userId=usr_sup_hotel`, sa)).status).toBe(400);
    expect((await http.get(`${DIRECTORY}?limit=5`, sa)).status).toBe(400);
  });
});

describe("GET /suppliers/admin/workspaces/:supplierId", () => {
  it("returns the selected supplier's safe workspace with sealed quote metadata only", async () => {
    const { status, body } = await http.get(workspaceUrl("sup_hotel"), sa);
    expect(status).toBe(200);
    expect(body.accountLinked).toBe(true);
    expect(body.policyPending).toBe(true);
    expect(body.profile).toEqual({
      id: "sup_hotel",
      name: "Synthetic Hotel Supplier",
      category: "HOTEL",
      verified: true,
      city: { code: "riyadh", nameEn: "Riyadh", nameAr: "الرياض" }
    });
    expect(body.services).toEqual([
      { id: "svc_hotel", name: "Executive suite", description: "Synthetic suite", unit: "night", available: true, listedPrice: "950.00" }
    ]);
    expect(body.bookings).toEqual([
      {
        id: "bkg_hotel",
        serviceName: "Executive suite",
        serviceUnit: "night",
        quantity: 3,
        totalPrice: "2850.00",
        status: "CONFIRMED",
        event: { reference: "DEMO-SUMMIT-01", date: "2026-11-02T06:00:00.000Z", currency: "SAR", timezone: "Asia/Riyadh" }
      }
    ]);

    const sealed = {
      id: "q_hotel",
      requestReference: expect.stringMatching(/^REQ-[0-9A-F]{8}$/),
      intakeId: DEMO.intakeId,
      category: "HOTEL",
      item: "Offer from sup_hotel",
      quantity: 15,
      currency: "SAR",
      status: "RECEIVED",
      sealed: true,
      policyPending: true,
      submittedAt: "2026-10-05T08:00:00.000Z"
    };
    expect(body.requests).toHaveLength(1);
    expect(body.requests[0]).toMatchObject({
      intakeId: DEMO.intakeId,
      eventCode: "DEMO-SUMMIT-01",
      category: "HOTEL",
      scope: "HOTEL_ROOMS",
      estimatedQuantity: 15,
      unit: "ROOM",
      isEstimate: true,
      status: "QUOTING",
      currency: "SAR",
      quote: sealed
    });
    expect(body.requests[0]).not.toHaveProperty("ownQuote");
    expect(body.requests[0].notes).toEqual([
      { id: "note_hotel", text: "Hotel recommendation", createdAt: "2026-10-06T08:00:00.000Z" }
    ]);
    expect(body.quotes).toEqual([sealed]);
    expect(Object.keys(body.quotes[0]).sort()).toEqual(ADMIN_QUOTE_KEYS);
    expect(Object.keys(body.requests[0].quote).sort()).toEqual(ADMIN_QUOTE_KEYS);

    expectNoLeaks(body);
    expect(JSON.stringify(body)).not.toContain("Car private note");
    expect(JSON.stringify(body)).not.toContain("q_car");
  });

  it("never selects quote prices, commission or score from the database", async () => {
    await http.get(workspaceUrl("sup_hotel"), sa);
    const quoteReads = memory.current.calls.filter((call) => call.model === "vendorQuote");
    expect(quoteReads.length).toBeGreaterThan(0);
    for (const call of quoteReads) {
      expect(Object.keys(call.args.select).sort()).toEqual(
        ["category", "createdAt", "id", "intakeId", "item", "quantity", "status"]
      );
      expect(call.args.where.supplierId).toBe("sup_hotel");
    }
  });

  it("isolates each supplier by its stored id and category", async () => {
    const car = await http.get(workspaceUrl("sup_car"), sa);
    expect(car.status).toBe(200);
    expect(car.body.requests.map((r: any) => [r.category, r.estimatedQuantity])).toEqual([["CAR", 9]]);
    expect(car.body.quotes.map((q: any) => q.id)).toEqual(["q_car"]);
    expect(car.body.requests[0].notes.map((n: any) => n.id)).toEqual(["note_car"]);
    // A booking whose service row is missing is omitted, not fabricated.
    expect(car.body.bookings).toEqual([]);
    expect(JSON.stringify(car.body)).not.toContain("Hotel recommendation");
    expectNoLeaks(car.body);

    const catering = await http.get(workspaceUrl("sup_catering"), sa);
    expect(catering.body.requests).toEqual([]);
    expect(catering.body.quotes).toEqual([]);
  });

  it("shows an unlinked profile truthfully", async () => {
    const { status, body } = await http.get(workspaceUrl("sup_free"), sa);
    expect(status).toBe(200);
    expect(body.accountLinked).toBe(false);
    expect(body.profile).toEqual({ id: "sup_free", name: "Unlinked Hotel", category: "HOTEL", verified: false, city: null });
    expect(body.services).toEqual([]);
    expect(body.bookings).toEqual([]);
    expect(body.requests).toHaveLength(1);
    expect(body.requests[0].quote).toBeNull();
    expect(body.requests[0].notes).toEqual([]);
    expect(body.quotes).toEqual([]);
  });

  it("hides the demo request once it stops collecting quotations", async () => {
    memory.current.rows("activityIntake").find((i) => i.id === DEMO.intakeId)!.status =
      ActivityStatus.CONTRACTING;
    const { body } = await http.get(workspaceUrl("sup_hotel"), sa);
    expect(body.requests).toEqual([]);
    // The supplier's own sealed quote record still lists, without a price.
    expect(body.quotes.map((q: any) => q.id)).toEqual(["q_hotel"]);
  });

  it("answers 404 for unknown or malformed ids and 400 for query parameters", async () => {
    const missing = await http.get(workspaceUrl("sup_missing"), sa);
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ error: { message: "Supplier not found" } });
    expect((await http.get(workspaceUrl("bad%20id!"), sa)).status).toBe(404);
    expect((await http.get(workspaceUrl("x".repeat(65)), sa)).status).toBe(404);
    expect((await http.get(`${workspaceUrl("sup_hotel")}?category=CAR`, sa)).status).toBe(400);
  });

  it("denies unauthenticated callers and every role except SUPER_ADMIN, including the supplier itself", async () => {
    expect((await http.get(workspaceUrl("sup_hotel"))).status).toBe(401);
    for (const role of NON_SUPER_ADMIN_ROLES) {
      const response = await http.get(workspaceUrl("sup_hotel"), { id: `usr_${role.toLowerCase()}`, role });
      expect(response.status, role).toBe(403);
    }
    expect((await http.get(workspaceUrl("sup_hotel"), hotel)).status).toBe(403);
  });
});

describe("read-only and preservation", () => {
  it("never writes, audits or unseals on any admin read", async () => {
    await http.get(DIRECTORY, sa);
    for (const id of ["sup_hotel", "sup_car", "sup_free", "sup_catering", "sup_missing"]) {
      await http.get(workspaceUrl(id), sa);
    }
    expect(memory.current.mutations()).toEqual([]);
    expect(memory.current.rows("auditLog")).toHaveLength(0);
    expect(memory.current.rows("vaultSession")).toHaveLength(0);
    expect(memory.current.rows("vendorQuote").every((q) => q.isVaultSealed === true)).toBe(true);
  });

  it("keeps approval failing closed for a supplier quote after admin views (D-011)", async () => {
    await http.get(workspaceUrl("sup_hotel"), sa);
    expect((await http.put("/api/vendor-quotes/q_hotel/approve", sa)).status).toBe(409);
    expect(memory.current.rows("vendorQuote").find((q) => q.id === "q_hotel")!.status).toBe(QuoteStatus.RECEIVED);
    expect(memory.current.rows("vendorContract")).toHaveLength(0);
  });

  it("does not open the supplier's own /me endpoints to SUPER_ADMIN", async () => {
    expect((await http.get("/api/suppliers/me/dashboard", sa)).status).toBe(403);
    expect((await http.get("/api/suppliers/me/requests", sa)).status).toBe(403);
    expect((await http.get("/api/suppliers/me/quotes", sa)).status).toBe(403);
    const quote = await http.post(`/api/suppliers/me/requests/${DEMO.intakeId}/quotes`, sa, {
      item: "Admin acting as supplier",
      quantity: 1,
      unitPrice: 1
    });
    expect(quote.status).toBe(403);
    const note = await http.post(`/api/suppliers/me/requests/${DEMO.intakeId}/notes`, sa, { text: "x" });
    expect(note.status).toBe(403);
    expect(memory.current.rows("vendorQuote")).toHaveLength(2);
    expect(memory.current.rows("supplierRequestNote")).toHaveLength(2);
  });

  it("still shows the supplier its own quoted price in its own workspace", async () => {
    const { status, body } = await http.get("/api/suppliers/me/requests", hotel);
    expect(status).toBe(200);
    expect(body.requests[0].ownQuote).toMatchObject({
      id: "q_hotel",
      unitPrice: "1200.00",
      totalPrice: "18000.00",
      taxInclusive: true,
      sealed: true
    });
    expect(JSON.stringify(body)).not.toContain("777.77");
  });
});
