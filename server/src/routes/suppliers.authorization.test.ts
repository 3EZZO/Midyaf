import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ActivityStatus, Role } from "@prisma/client";
import type { MemoryPrisma } from "../testing/memoryPrisma.js";
import type { Harness } from "../testing/httpHarness.js";

/**
 * SUPPLIER-001 HTTP checks for the supplier workspace and every alternate
 * path a SUPPLIER token could use (supplier directory, bookings, events,
 * tasks, both bootstrap aliases). Real routers and JWT middleware run over
 * an in-memory Prisma double; all records are synthetic.
 */

const memory = vi.hoisted(() => ({ current: undefined as unknown as MemoryPrisma }));

vi.mock("../db.js", async () => {
  const { createMemoryPrisma } = await import("../testing/memoryPrisma.js");
  memory.current = createMemoryPrisma();
  return { prisma: memory.current.prisma };
});

const { startHarness } = await import("../testing/httpHarness.js");
const suppliersRouter = (await import("./suppliers.js")).default;
const bookingsRouter = (await import("./bookings.js")).default;
const eventsRouter = (await import("./events.js")).default;
const tasksRouter = (await import("./tasks.js")).default;
const bootstrapRouter = (await import("./bootstrap.js")).default;
const { SUPPLIER_DEMO_REQUESTS } = await import("../utils/supplierPortal.js");

const DEMO = SUPPLIER_DEMO_REQUESTS[0];

const actors = {
  hotel: { id: "usr_sup_hotel", role: Role.SUPPLIER },
  car: { id: "usr_sup_car", role: Role.SUPPLIER },
  catering: { id: "usr_sup_catering", role: Role.SUPPLIER },
  unlinked: { id: "usr_sup_unlinked", role: Role.SUPPLIER },
  lm: { id: "usr_lm", role: Role.LOGISTICS_MANAGER },
  org: { id: "usr_org", role: Role.ORGANIZER },
  guest: { id: "usr_guest", role: Role.GUEST },
  company: { id: "usr_company", role: Role.COMPANY_ORGANIZER }
};

const SECRETS = [
  "1010101010", // CR number
  "secret organizer brief",
  "Synthetic Palace Venue",
  "organizer@example.test",
  "+966500000001",
  "Synthetic Summit Activity",
  "Hidden metadata",
  "Other Supplier Booking"
];

function seed() {
  const user = (id: string, role: Role, extra: Record<string, unknown> = {}) => ({
    id,
    role,
    name: `Synthetic ${id}`,
    email: `${id}@example.test`,
    phone: `+9665${id.length}0000`,
    passwordHash: "hash-not-a-secret-but-never-returned",
    language: "en",
    avatar: null,
    ...extra
  });
  memory.current.seed({
    user: [
      user("usr_sup_hotel", Role.SUPPLIER),
      user("usr_sup_car", Role.SUPPLIER),
      user("usr_sup_catering", Role.SUPPLIER),
      user("usr_sup_unlinked", Role.SUPPLIER),
      user("usr_lm", Role.LOGISTICS_MANAGER),
      user("usr_org", Role.ORGANIZER, { email: "organizer@example.test", phone: "+966500000001" }),
      user("usr_guest", Role.GUEST),
      user("usr_company", Role.COMPANY_ORGANIZER)
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
      },
      {
        id: "evt_other",
        name: "Other",
        organizerId: "usr_org2",
        venue: "Elsewhere",
        date: new Date("2026-12-01T06:00:00Z"),
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
        submittedBy: "usr_company@example.test"
      },
      {
        id: "int_other",
        eventId: "evt_other",
        activityName: "Other",
        activityPlace: "Elsewhere",
        visitorCount: 40,
        vipVisitorCount: 10,
        normalVisitorCount: 30,
        ticketType: "MIXED",
        status: ActivityStatus.QUOTING,
        submittedBy: "someone"
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
        id: "bkg_car_other",
        eventId: DEMO.eventId,
        supplierId: "sup_car",
        serviceId: "svc_car",
        quantity: 1,
        totalPrice: "500.00",
        commissionPercent: "12.00",
        commissionAmount: "60.00",
        status: "CONFIRMED"
      }
    ],
    task: [
      { id: "tsk_1", eventId: DEMO.eventId, guestId: null, driverId: null, type: "AIRPORT_PICKUP", status: "PENDING", pickupLocation: "Other Supplier Booking", dropoffLocation: "Hotel", scheduledAt: new Date() }
    ]
  });
}

let http: Harness;

beforeAll(async () => {
  http = await startHarness([
    ["/api/suppliers", suppliersRouter],
    ["/suppliers", suppliersRouter],
    ["/api/bookings", bookingsRouter],
    ["/api/events", eventsRouter],
    ["/api/tasks", tasksRouter],
    ["/api", bootstrapRouter],
    ["/", bootstrapRouter]
  ]);
});

afterAll(async () => {
  await http.close();
});

beforeEach(() => {
  seed();
});

function expectNoSecrets(body: unknown) {
  const text = JSON.stringify(body);
  for (const secret of SECRETS) expect(text).not.toContain(secret);
  expect(text).not.toMatch(/commissionPercent|commissionAmount|crNumber|passwordHash|sponsoredRank/i);
}

describe("GET /suppliers/me/dashboard", () => {
  it("returns only the supplier's own sanitized profile, services and bookings", async () => {
    const { status, body } = await http.get("/api/suppliers/me/dashboard", actors.hotel);
    expect(status).toBe(200);
    expect(body.linked).toBe(true);
    expect(body.profile).toEqual({
      id: "sup_hotel",
      name: "Synthetic Hotel Supplier",
      category: "HOTEL",
      verified: true,
      city: { code: "riyadh", nameEn: "Riyadh", nameAr: "الرياض" }
    });
    expect(body.services).toEqual([
      {
        id: "svc_hotel",
        name: "Executive suite",
        description: "Synthetic suite",
        unit: "night",
        available: true,
        listedPrice: "950.00"
      }
    ]);
    expect(body.bookings).toHaveLength(1);
    expect(body.bookings[0]).toEqual({
      id: "bkg_hotel",
      serviceName: "Executive suite",
      serviceUnit: "night",
      quantity: 3,
      totalPrice: "2850.00",
      status: "CONFIRMED",
      event: {
        reference: "DEMO-SUMMIT-01",
        date: "2026-11-02T06:00:00.000Z",
        currency: "SAR",
        timezone: "Asia/Riyadh"
      }
    });
    expectNoSecrets(body);
  });

  it("is truthful for a supplier account without a linked profile", async () => {
    const { status, body } = await http.get("/api/suppliers/me/dashboard", actors.unlinked);
    expect(status).toBe(200);
    expect(body).toEqual({ linked: false, profile: null, services: [], bookings: [] });
  });

  it("is reachable through the root alias and refused to every other role", async () => {
    expect((await http.get("/suppliers/me/dashboard", actors.hotel)).status).toBe(200);
    for (const actor of [actors.lm, actors.org, actors.guest, actors.company]) {
      expect((await http.get("/api/suppliers/me/dashboard", actor)).status).toBe(403);
    }
    expect((await http.get("/api/suppliers/me/dashboard")).status).toBe(401);
  });
});

describe("GET /suppliers/me/requests", () => {
  it("shows the HOTEL supplier the deterministic 15-room demo estimate", async () => {
    const { status, body } = await http.get("/api/suppliers/me/requests", actors.hotel);
    expect(status).toBe(200);
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
      ownQuote: null,
      notes: []
    });
    expectNoSecrets(body);
  });

  it("matches the stored category: CAR=9, CATERING none", async () => {
    const car = await http.get("/api/suppliers/me/requests", actors.car);
    expect(car.body.requests.map((r: any) => r.estimatedQuantity)).toEqual([9]);
    const catering = await http.get("/api/suppliers/me/requests", actors.catering);
    expect(catering.body).toEqual({ linked: true, requests: [] });
  });

  it("never lists other quoting intakes, and hides the demo request once it closes", async () => {
    const open = await http.get("/api/suppliers/me/requests", actors.hotel);
    expect(JSON.stringify(open.body)).not.toContain("int_other");

    memory.current.rows("activityIntake").find((i) => i.id === DEMO.intakeId)!.status =
      ActivityStatus.CONTRACTING;
    const closed = await http.get("/api/suppliers/me/requests", actors.hotel);
    expect(closed.body.requests).toEqual([]);
  });

  it("ignores caller-supplied category or ids", async () => {
    const { body } = await http.get(
      "/api/suppliers/me/requests?category=CAR&supplierId=sup_car",
      actors.hotel
    );
    expect(body.requests.map((r: any) => r.category)).toEqual(["HOTEL"]);
  });
});

describe("alternate supplier producers are denied or empty", () => {
  it("denies the raw supplier directory, detail and create paths", async () => {
    expect((await http.get("/api/suppliers", actors.hotel)).status).toBe(403);
    expect((await http.get("/suppliers", actors.hotel)).status).toBe(403);
    expect((await http.get("/api/suppliers/sup_hotel", actors.hotel)).status).toBe(403);
    expect((await http.get("/api/suppliers/sup_car", actors.hotel)).status).toBe(403);
    const created = await http.post("/api/suppliers", actors.hotel, {
      name: "Self made",
      category: "HOTEL"
    });
    expect(created.status).toBe(403);
    expect(memory.current.rows("supplier")).toHaveLength(4);
  });

  it("keeps operations access to the directory unchanged", async () => {
    const { status, body } = await http.get("/api/suppliers", actors.lm);
    expect(status).toBe(200);
    expect(body.suppliers).toHaveLength(4);
  });

  it("denies raw booking reads", async () => {
    expect((await http.get(`/api/bookings/${DEMO.eventId}`, actors.hotel)).status).toBe(403);
  });

  it("returns no events and no event detail", async () => {
    const list = await http.get("/api/events", actors.hotel);
    expect(list.status).toBe(200);
    expect(list.body.events).toEqual([]);
    expect((await http.get(`/api/events/${DEMO.eventId}`, actors.hotel)).status).toBe(404);
  });

  it("returns no tasks", async () => {
    const list = await http.get("/api/tasks", actors.hotel);
    expect(list.status).toBe(200);
    expect(list.body.tasks).toEqual([]);
    expect((await http.get("/api/tasks/tsk_1", actors.hotel)).status).toBe(404);
  });

  it.each(["/api/bootstrap", "/bootstrap"])(
    "%s is the early empty supplier branch with only the supplier's own identity",
    async (path) => {
      const { status, body } = await http.get(path, actors.hotel);
      expect(status).toBe(200);
      for (const key of [
        "events",
        "drivers",
        "suppliers",
        "commission",
        "activityIntakes",
        "aiPlans",
        "vendorQuotes",
        "contracts",
        "guestJourneys",
        "coordinatorRequests",
        "companyReports",
        "fileAssets",
        "notifications",
        "auditLogs",
        "hospitalityRiders"
      ]) {
        expect(body[key]).toEqual([]);
      }
      expect(body.users).toHaveLength(1);
      expect(body.users[0].id).toBe("usr_sup_hotel");
      expect(body.city.code).toBe("riyadh");
      expectNoSecrets(body);
      // Generic collection queries never ran for the supplier.
      const queried = new Set(memory.current.calls.map((call) => call.model));
      for (const model of ["event", "supplier", "vendorQuote", "booking", "activityIntake", "auditLog"]) {
        expect(queried.has(model)).toBe(false);
      }
    }
  );
});
