import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { Role } from "@prisma/client";
import { ZodError } from "zod";

/**
 * T-08: HTTP-level checks for hospitality riders and the seven
 * telemetry/geofence routes in operations.ts. Persistence, the telemetry
 * buffer and the live geofence singleton are mocked; the real routers, JWT
 * middleware and audit writer run. All records are synthetic.
 */

const fake = vi.hoisted(() => {
  type Row = Record<string, any>;

  const seed = (): Record<string, Row[]> => ({
    user: [],
    event: [
      { id: "evt_own", organizerId: "usr_org" },
      { id: "evt_other", organizerId: "usr_org2" }
    ],
    guest: [
      { id: "gst_own", userId: "usr_guest", eventId: "evt_own" },
      { id: "gst_other", userId: "usr_guest2", eventId: "evt_other" }
    ],
    driver: [
      { id: "drv_own", userId: "usr_driver" },
      { id: "drv_other", userId: "usr_driver2" }
    ],
    task: [
      { id: "tsk_own", eventId: "evt_own", driverId: "drv_own", guestId: "gst_own" },
      { id: "tsk_other", eventId: "evt_other", driverId: "drv_other", guestId: "gst_other" }
    ],
    hospitalityRider: [
      {
        id: "rdr_own",
        guestId: "gst_own",
        dietaryNeeds: ["Synthetic dietary rider"],
        roomPreferences: [],
        vehicleRider: [],
        securityNotes: ["Synthetic security note"],
        fulfilled: false,
        fulfilledBy: null
      },
      {
        id: "rdr_other",
        guestId: "gst_other",
        dietaryNeeds: [],
        roomPreferences: [],
        vehicleRider: [],
        securityNotes: [],
        fulfilled: false,
        fulfilledBy: null
      }
    ],
    booking: [],
    supplier: [],
    activityIntake: [],
    auditLog: []
  });

  const relations: Record<string, Record<string, [string, string]>> = {
    guest: { event: ["event", "eventId"] },
    task: {
      guest: ["guest", "guestId"],
      driver: ["driver", "driverId"],
      event: ["event", "eventId"]
    },
    hospitalityRider: { guest: ["guest", "guestId"] },
    booking: { supplier: ["supplier", "supplierId"] }
  };

  let db = seed();
  const calls: Array<{ model: string; method: string; args: Row }> = [];

  function hydrate(model: string, row: Row, depth = 0): Row {
    const out = { ...row };
    if (depth > 2) return out;
    for (const [field, [target, fk]] of Object.entries(relations[model] ?? {})) {
      const related = db[target].find((item) => item.id === row[fk]);
      out[field] = related ? hydrate(target, related, depth + 1) : null;
    }
    return out;
  }

  function matches(row: Row | null | undefined, where: Row = {}): boolean {
    if (!row) return false;
    return Object.entries(where).every(([key, cond]) => {
      const value = row[key];
      if (cond && typeof cond === "object" && !Array.isArray(cond)) {
        if ("not" in cond) return value !== cond.not;
        if ("in" in cond) return (cond.in as unknown[]).includes(value);
        return matches(value, cond);
      }
      return value === cond;
    });
  }

  function model(name: string) {
    const find = (args: Row = {}) =>
      db[name]
        .map((row) => hydrate(name, row))
        .filter((row) => matches(row, args.where));
    return {
      findUnique: async (args: Row) => {
        calls.push({ model: name, method: "findUnique", args });
        return find(args)[0] ?? null;
      },
      findFirst: async (args: Row) => {
        calls.push({ model: name, method: "findFirst", args });
        return find(args)[0] ?? null;
      },
      findMany: async (args: Row = {}) => {
        calls.push({ model: name, method: "findMany", args });
        return find(args);
      },
      update: async (args: Row) => {
        calls.push({ model: name, method: "update", args });
        const index = db[name].findIndex((row) => matches(row, args.where));
        db[name][index] = { ...db[name][index], ...args.data };
        return { ...db[name][index] };
      },
      create: async (args: Row) => {
        calls.push({ model: name, method: "create", args });
        const created = { id: `${name}_new`, ...args.data };
        db[name].push(created);
        return created;
      }
    };
  }

  const prisma = Object.fromEntries(Object.keys(seed()).map((name) => [name, model(name)]));

  return {
    prisma,
    calls,
    db: () => db,
    mutations: () =>
      calls.filter(
        (call) => call.model !== "auditLog" && ["update", "create", "delete"].includes(call.method)
      ),
    audits: () => db.auditLog,
    reset: () => {
      db = seed();
      calls.length = 0;
    }
  };
});

const telemetry = vi.hoisted(() => {
  const now = Date.now();
  const frame = (driverId: string, eventId: string | undefined, lat: number, lng: number) => ({
    driverId,
    eventId,
    lat,
    lng,
    speed: 0,
    heading: 0,
    timestamp: now,
    dirty: false,
    firstSeenAt: now,
    lastUpdated: now
  });
  const frames = [
    frame("drv_own", "evt_own", 24.7, 46.6),
    frame("drv_other", "evt_other", 24.7001, 46.6001),
    frame("drv_unassigned", undefined, 24.7002, 46.6002),
    frame("drv_other", "evt_own", 24.7003, 46.6003)
  ];
  // Mirrors the real buffer's own (permissive) eventId filter.
  const byEvent = (eventId?: string) =>
    frames.filter((f) => !eventId || !f.eventId || f.eventId === eventId);
  return {
    getSnapshot: vi.fn((eventId?: string) => byEvent(eventId).map((f) => ({ ...f }))),
    getStats: vi.fn(() => ({ activeDriversCount: frames.length })),
    findDriversWithinRadius: vi.fn(
      (_lat: number, _lng: number, _radius: number, eventId?: string) =>
        byEvent(eventId).map((f) => ({ driver: { ...f }, distanceMeters: 10 }))
    )
  };
});

const geo = vi.hoisted(() => {
  const transition = (id: string, driverId: string) => ({
    id,
    driverId,
    geofenceId: "geo_a",
    geofenceCode: "SYN_A",
    currentRing: "DOCKED_BAY",
    previousRing: "CURBSIDE_GATE"
  });
  return {
    getGeofences: vi.fn(() => [
      {
        id: "geo_a",
        code: "SYN_A",
        activeVehiclesCount: 7,
        ringCounts: { OUTER_APPROACH: 5, STAGING_HOLD: 0, CURBSIDE_GATE: 0, DOCKED_BAY: 2 }
      }
    ]),
    getRecentEvents: vi.fn((limit = 50) =>
      [
        transition("t1", "drv_other"),
        transition("t2", "drv_other"),
        transition("t3", "drv_own"),
        transition("t4", "drv_other"),
        transition("t5", "drv_own"),
        transition("t6", "drv_own")
      ].slice(0, limit)
    ),
    getDriverState: vi.fn((driverId: string) =>
      driverId === "drv_own"
        ? [{ driverId, geofenceId: "geo_a", currentRing: "DOCKED_BAY" }]
        : driverId === "drv_other"
          ? [{ driverId, geofenceId: "geo_a", currentRing: "OUTER_APPROACH" }]
          : []
    ),
    simulateHandshakeSequence: vi.fn(),
    evaluateTelemetry: vi.fn(),
    actual: { singleton: null as null | { getRecentEvents: (n?: number) => unknown[] } }
  };
});

vi.mock("../db.js", () => ({ prisma: fake.prisma }));
vi.mock("../services/telemetryBuffer.js", () => ({ telemetryBuffer: telemetry }));
vi.mock("../services/geofenceEngine.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/geofenceEngine.js")>();
  geo.actual.singleton = actual.geofenceEngine;
  return { GeofenceEngine: actual.GeofenceEngine, geofenceEngine: geo };
});

const { signTokens } = await import("../middleware/auth.js");
const ridersRouter = (await import("./riders.js")).default;
const operationsRouter = (await import("./operations.js")).default;

type Emitted = { rooms: string[]; event: string; payload: unknown };
const emitted: Emitted[] = [];
const io = {
  emit: (event: string, payload: unknown) => {
    emitted.push({ rooms: ["*global*"], event, payload });
  },
  to(room: string) {
    const rooms = [room];
    const target = {
      to(next: string) {
        rooms.push(next);
        return target;
      },
      emit(event: string, payload: unknown) {
        emitted.push({ rooms, event, payload });
      }
    };
    return target;
  }
};

const actors: Record<string, { id: string; role: Role }> = {
  SA: { id: "usr_sa", role: Role.SUPER_ADMIN },
  LM: { id: "usr_lm", role: Role.LOGISTICS_MANAGER },
  ORG: { id: "usr_org", role: Role.ORGANIZER },
  ORG2: { id: "usr_org2", role: Role.ORGANIZER },
  GUEST: { id: "usr_guest", role: Role.GUEST },
  GUEST2: { id: "usr_guest2", role: Role.GUEST },
  DRIVER: { id: "usr_driver", role: Role.DRIVER },
  SUPPLIER: { id: "usr_supplier", role: Role.SUPPLIER },
  COMPANY: { id: "usr_company", role: Role.COMPANY_ORGANIZER },
  COORDINATOR: { id: "usr_coord", role: Role.COORDINATOR }
};
type Actor = keyof typeof actors;

let server: Server;
let base = "";

async function call(
  method: string,
  path: string,
  actor: Actor,
  body?: unknown
): Promise<{ status: number; json: Record<string, any> }> {
  const { id, role } = actors[actor];
  const token = signTokens({ id, email: `${id}@example.test`, role }).accessToken;
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: res.status, json: (await res.json()) as Record<string, any> };
}

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.set("io", io);
  app.use("/api/riders", ridersRouter);
  app.use("/api", operationsRouter);
  app.use((error: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
    res.status(error instanceof ZodError ? 400 : (error.status ?? 500)).json({ error: error.message });
  });
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  fake.reset();
  emitted.length = 0;
  vi.clearAllMocks();
});

describe("GET /api/riders/:guestId", () => {
  it.each(["SA", "LM"] as Actor[])("lets %s read any existing guest's rider", async (actor) => {
    const res = await call("GET", "/api/riders/gst_other", actor);
    expect(res.status).toBe(200);
    expect(res.json.rider.id).toBe("rdr_other");
  });

  it("lets an organizer read a rider for its own event's guest", async () => {
    const res = await call("GET", "/api/riders/gst_own", "ORG");
    expect(res.status).toBe(200);
    expect(res.json.rider.id).toBe("rdr_own");
  });

  it("denies an organizer a guest from another organizer's event", async () => {
    const res = await call("GET", "/api/riders/gst_other", "ORG");
    expect(res.status).toBe(403);
    expect(fake.calls.some((c) => c.model === "hospitalityRider")).toBe(false);
  });

  it("lets a guest read its own rider", async () => {
    const res = await call("GET", "/api/riders/gst_own", "GUEST");
    expect(res.status).toBe(200);
    expect(res.json.rider.id).toBe("rdr_own");
  });

  it("returns null for an authorized guest without a rider", async () => {
    fake.db().hospitalityRider = fake.db().hospitalityRider.filter((r) => r.guestId !== "gst_own");
    const res = await call("GET", "/api/riders/gst_own", "GUEST");
    expect(res.status).toBe(200);
    expect(res.json.rider).toBeNull();
  });

  it("denies a guest another guest's rider before reading rider contents", async () => {
    const res = await call("GET", "/api/riders/gst_other", "GUEST");
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.json)).not.toContain("Synthetic");
    expect(fake.calls.some((c) => c.model === "hospitalityRider")).toBe(false);
  });

  it("hides whether an unknown guest exists from non-operators", async () => {
    expect((await call("GET", "/api/riders/gst_missing", "GUEST")).status).toBe(403);
    expect((await call("GET", "/api/riders/gst_missing", "LM")).status).toBe(404);
  });

  it.each(["DRIVER", "SUPPLIER", "COMPANY", "COORDINATOR"] as Actor[])(
    "denies %s before any lookup",
    async (actor) => {
      const res = await call("GET", "/api/riders/gst_own", actor);
      expect(res.status).toBe(403);
      expect(fake.calls).toHaveLength(0);
    }
  );
});

describe("PUT /api/riders/:id", () => {
  it.each(["SA", "LM"] as Actor[])("lets %s update a rider with a safe audit and scoped emission", async (actor) => {
    const res = await call("PUT", "/api/riders/rdr_other", actor, { fulfilled: true });
    expect(res.status).toBe(200);
    expect(res.json.rider.fulfilled).toBe(true);

    const audit = fake.audits();
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      actorUserId: actors[actor].id,
      action: "hospitality_rider.update",
      entityType: "GUEST",
      entityId: "gst_other",
      eventId: "evt_other",
      beforeData: { riderId: "rdr_other", fulfilled: false },
      afterData: { riderId: "rdr_other", fulfilled: true }
    });
    expect(audit[0].metadata).toMatchObject({ riderId: "rdr_other", changedFields: ["fulfilled"] });

    expect(emitted).toHaveLength(1);
    expect(emitted[0].event).toBe("rider:update");
    expect(emitted[0].rooms).toEqual(["event:evt_other", "user:usr_guest2"]);
    expect(emitted[0].payload).toEqual({
      rider: { id: "rdr_other", guestId: "gst_other", fulfilled: true }
    });
  });

  it("keeps rider contents out of the audit trail and broadcast", async () => {
    const res = await call("PUT", "/api/riders/rdr_own", "ORG", {
      securityNotes: ["Synthetic updated note"]
    });
    expect(res.status).toBe(200);
    const evidence = JSON.stringify({ audits: fake.audits(), emitted });
    expect(evidence).not.toContain("Synthetic updated note");
    expect(evidence).not.toContain("Synthetic dietary rider");
    expect(fake.audits()[0].metadata).toMatchObject({ changedFields: ["securityNotes"] });
  });

  it("denies an organizer another organizer's rider without mutation, audit or broadcast", async () => {
    const res = await call("PUT", "/api/riders/rdr_other", "ORG", { fulfilled: true });
    expect(res.status).toBe(403);
    expect(fake.mutations()).toHaveLength(0);
    expect(fake.audits()).toHaveLength(0);
    expect(emitted).toHaveLength(0);
  });

  it.each(["GUEST", "DRIVER", "SUPPLIER", "COMPANY", "COORDINATOR"] as Actor[])(
    "denies %s before any lookup, mutation or broadcast",
    async (actor) => {
      const res = await call("PUT", "/api/riders/rdr_own", actor, { fulfilled: true });
      expect(res.status).toBe(403);
      expect(fake.calls).toHaveLength(0);
      expect(emitted).toHaveLength(0);
    }
  );

  it("returns 404 for an unknown rider", async () => {
    const res = await call("PUT", "/api/riders/rdr_missing", "LM", { fulfilled: true });
    expect(res.status).toBe(404);
    expect(fake.mutations()).toHaveLength(0);
  });
});

describe("GET /api/operations/telemetry/snapshot", () => {
  it("keeps the legacy global view for LM without an eventId", async () => {
    const res = await call("GET", "/api/operations/telemetry/snapshot", "LM");
    expect(res.status).toBe(200);
    expect(res.json.count).toBe(4);
    expect(res.json).toHaveProperty("timestamp");
  });

  it("scopes an organizer to its event and that event's assigned drivers", async () => {
    const res = await call("GET", "/api/operations/telemetry/snapshot?eventId=evt_own", "ORG");
    expect(res.status).toBe(200);
    expect(res.json.snapshot.map((f: { driverId: string }) => f.driverId)).toEqual(["drv_own"]);
    expect(res.json.count).toBe(1);
  });

  it("requires an explicit eventId from an organizer before the cache is read", async () => {
    const res = await call("GET", "/api/operations/telemetry/snapshot", "ORG");
    expect(res.status).toBe(400);
    expect(telemetry.getSnapshot).not.toHaveBeenCalled();
  });

  it("denies an organizer another organizer's event before the cache is read", async () => {
    const res = await call("GET", "/api/operations/telemetry/snapshot?eventId=evt_other", "ORG");
    expect(res.status).toBe(403);
    expect(telemetry.getSnapshot).not.toHaveBeenCalled();
  });

  it("returns 404 for an LM-supplied unknown event", async () => {
    const res = await call("GET", "/api/operations/telemetry/snapshot?eventId=evt_missing", "LM");
    expect(res.status).toBe(404);
    expect(telemetry.getSnapshot).not.toHaveBeenCalled();
  });

  it.each(["GUEST", "DRIVER", "SUPPLIER", "COMPANY", "COORDINATOR"] as Actor[])(
    "denies %s",
    async (actor) => {
      const res = await call("GET", "/api/operations/telemetry/snapshot?eventId=evt_own", actor);
      expect(res.status).toBe(403);
      expect(telemetry.getSnapshot).not.toHaveBeenCalled();
      expect(fake.calls).toHaveLength(0);
    }
  );
});

describe("GET /api/operations/telemetry/buffer-stats", () => {
  it.each(["SA", "LM"] as Actor[])("allows %s", async (actor) => {
    const res = await call("GET", "/api/operations/telemetry/buffer-stats", actor);
    expect(res.status).toBe(200);
    expect(res.json.stats).toBeDefined();
  });

  it.each(["ORG", "GUEST", "DRIVER", "COORDINATOR"] as Actor[])(
    "denies %s the global counters",
    async (actor) => {
      const res = await call("GET", "/api/operations/telemetry/buffer-stats", actor);
      expect(res.status).toBe(403);
      expect(telemetry.getStats).not.toHaveBeenCalled();
    }
  );
});

describe("GET /api/operations/telemetry/nearby", () => {
  it("scopes organizer matches to assigned drivers of its event", async () => {
    const res = await call(
      "GET",
      "/api/operations/telemetry/nearby?lat=24.7&lng=46.6&radius=1000&eventId=evt_own",
      "ORG"
    );
    expect(res.status).toBe(200);
    expect(res.json.matches.map((m: { driver: { driverId: string } }) => m.driver.driverId)).toEqual([
      "drv_own"
    ]);
    expect(res.json).toMatchObject({ origin: { lat: 24.7, lng: 46.6 }, radiusMeters: 1000, matchesCount: 1 });
  });

  it("defaults the radius for LM and keeps the global view", async () => {
    const res = await call("GET", "/api/operations/telemetry/nearby?lat=24.7&lng=46.6", "LM");
    expect(res.status).toBe(200);
    expect(res.json.radiusMeters).toBe(5000);
    expect(res.json.matchesCount).toBe(4);
  });

  it.each([
    "lat=abc&lng=46.6",
    "lat=91&lng=46.6",
    "lat=24.7&lng=181",
    "lat=24.7&lng=46.6&radius=0",
    "lat=24.7&lng=46.6&radius=-5",
    "lat=24.7&lng=46.6&radius=Infinity",
    "lat=24.7&lng=46.6&radius=1000000"
  ])("rejects invalid coordinates or radius (%s)", async (query) => {
    const res = await call("GET", `/api/operations/telemetry/nearby?${query}`, "LM");
    expect(res.status).toBe(400);
    expect(telemetry.findDriversWithinRadius).not.toHaveBeenCalled();
  });

  it("denies another organizer's event and personal roles", async () => {
    expect(
      (await call("GET", "/api/operations/telemetry/nearby?lat=24.7&lng=46.6&eventId=evt_other", "ORG")).status
    ).toBe(403);
    expect(
      (await call("GET", "/api/operations/telemetry/nearby?lat=24.7&lng=46.6&eventId=evt_own", "GUEST")).status
    ).toBe(403);
    expect(telemetry.findDriversWithinRadius).not.toHaveBeenCalled();
  });
});

describe("GET /api/operations/geofences", () => {
  it("returns global counts to LM", async () => {
    const res = await call("GET", "/api/operations/geofences", "LM");
    expect(res.status).toBe(200);
    expect(res.json.geofences[0]).toMatchObject({ activeVehiclesCount: 7 });
  });

  it("recomputes organizer counts from its assigned drivers only", async () => {
    const res = await call("GET", "/api/operations/geofences?eventId=evt_own", "ORG");
    expect(res.status).toBe(200);
    expect(res.json.count).toBe(1);
    expect(res.json.geofences[0]).toMatchObject({
      id: "geo_a",
      activeVehiclesCount: 1,
      ringCounts: { OUTER_APPROACH: 0, STAGING_HOLD: 0, CURBSIDE_GATE: 0, DOCKED_BAY: 1 }
    });
    expect(geo.getDriverState).toHaveBeenCalledWith("drv_own");
    expect(geo.getDriverState).not.toHaveBeenCalledWith("drv_other");
  });

  it("denies another organizer's event, a missing eventId and personal roles", async () => {
    expect((await call("GET", "/api/operations/geofences?eventId=evt_other", "ORG")).status).toBe(403);
    expect((await call("GET", "/api/operations/geofences", "ORG")).status).toBe(400);
    expect((await call("GET", "/api/operations/geofences", "DRIVER")).status).toBe(403);
    expect((await call("GET", "/api/operations/geofences", "COORDINATOR")).status).toBe(403);
    expect(geo.getGeofences).not.toHaveBeenCalled();
  });
});

describe("GET /api/operations/geofences/recent-events", () => {
  it("filters organizer history to its assigned drivers before the limit", async () => {
    const res = await call("GET", "/api/operations/geofences/recent-events?eventId=evt_own&limit=2", "ORG");
    expect(res.status).toBe(200);
    expect(res.json.events.map((e: { id: string }) => e.id)).toEqual(["t3", "t5"]);
    expect(res.json.count).toBe(2);
  });

  it("keeps LM's unscoped history and clamps the limit", async () => {
    const res = await call("GET", "/api/operations/geofences/recent-events?limit=3", "LM");
    expect(res.status).toBe(200);
    expect(res.json.count).toBe(3);
    await call("GET", "/api/operations/geofences/recent-events?limit=5000", "LM");
    expect(geo.getRecentEvents).toHaveBeenLastCalledWith(100);
  });

  it("denies other organizers and personal roles before reading history", async () => {
    expect((await call("GET", "/api/operations/geofences/recent-events?eventId=evt_other", "ORG")).status).toBe(403);
    expect((await call("GET", "/api/operations/geofences/recent-events", "GUEST")).status).toBe(403);
    expect(geo.getRecentEvents).not.toHaveBeenCalled();
  });
});

describe("GET /api/operations/geofences/driver/:driverId", () => {
  it("lets LM read an existing driver and 404s an unknown one", async () => {
    expect((await call("GET", "/api/operations/geofences/driver/drv_other", "LM")).status).toBe(200);
    expect((await call("GET", "/api/operations/geofences/driver/drv_missing", "LM")).status).toBe(404);
  });

  it("lets a driver read only its own state", async () => {
    const own = await call("GET", "/api/operations/geofences/driver/drv_own", "DRIVER");
    expect(own.status).toBe(200);
    expect(own.json).toMatchObject({ driverId: "drv_own", states: [{ currentRing: "DOCKED_BAY" }] });

    geo.getDriverState.mockClear();
    const other = await call("GET", "/api/operations/geofences/driver/drv_other", "DRIVER");
    expect(other.status).toBe(403);
    expect(geo.getDriverState).not.toHaveBeenCalled();
  });

  it("lets an organizer read a driver assigned to its own event only", async () => {
    expect((await call("GET", "/api/operations/geofences/driver/drv_own?eventId=evt_own", "ORG")).status).toBe(200);

    geo.getDriverState.mockClear();
    expect((await call("GET", "/api/operations/geofences/driver/drv_other?eventId=evt_own", "ORG")).status).toBe(403);
    expect((await call("GET", "/api/operations/geofences/driver/drv_other?eventId=evt_other", "ORG")).status).toBe(403);
    expect((await call("GET", "/api/operations/geofences/driver/drv_own", "ORG")).status).toBe(400);
    expect(geo.getDriverState).not.toHaveBeenCalled();
  });

  it.each(["GUEST", "SUPPLIER", "COMPANY", "COORDINATOR"] as Actor[])("denies %s", async (actor) => {
    const res = await call("GET", "/api/operations/geofences/driver/drv_own", actor);
    expect(res.status).toBe(403);
    expect(geo.getDriverState).not.toHaveBeenCalled();
  });
});

describe("POST /api/operations/geofences/simulate-handshake", () => {
  it.each(["SA", "LM", "ORG"] as Actor[])(
    "runs a synthetic demo for %s in an isolated engine, audited and emitted to the requester only",
    async (actor) => {
      const res = await call("POST", "/api/operations/geofences/simulate-handshake", actor, { demo: true });
      expect(res.status).toBe(200);
      expect(res.json).toMatchObject({
        success: true,
        demo: true,
        driverId: "demo-driver-synthetic",
        geofenceCode: "KKIA_ROYAL_T5",
        eventsGenerated: 4
      });
      expect(res.json.events.every((e: { driverId: string }) => e.driverId === "demo-driver-synthetic")).toBe(true);

      // The live singleton (mocked here) and the real module's singleton stay untouched.
      expect(geo.simulateHandshakeSequence).not.toHaveBeenCalled();
      expect(geo.evaluateTelemetry).not.toHaveBeenCalled();
      expect(geo.actual.singleton?.getRecentEvents(100)).toEqual([]);

      expect(emitted).toHaveLength(4);
      expect(emitted.every((e) => e.rooms.length === 1 && e.rooms[0] === `user:${actors[actor].id}`)).toBe(true);

      expect(fake.audits()).toHaveLength(1);
      expect(fake.audits()[0]).toMatchObject({
        actorUserId: actors[actor].id,
        action: "geofence.simulate_handshake",
        entityId: "demo-driver-synthetic"
      });
      expect(fake.audits()[0].metadata).toMatchObject({ demo: true, synthetic: true, geofenceCode: "KKIA_ROYAL_T5" });
      expect(fake.mutations()).toHaveLength(0);
    }
  );

  it("accepts a validated built-in geofence", async () => {
    const res = await call("POST", "/api/operations/geofences/simulate-handshake", "LM", {
      demo: true,
      geofenceCode: "KAFD_PLENARY_HALL"
    });
    expect(res.status).toBe(200);
    expect(res.json.geofenceCode).toBe("KAFD_PLENARY_HALL");
  });

  it.each([
    ["no demo flag", {}],
    ["demo false", { demo: false }],
    ["a caller-chosen driver", { demo: true, driverId: "drv_own" }],
    ["a caller-chosen name", { demo: true, driverName: "Real Person" }],
    ["a caller-chosen event", { demo: true, eventId: "evt_own" }],
    ["an unknown geofence", { demo: true, geofenceCode: "NOT_A_SITE" }]
  ])("rejects %s without audit or emission", async (_label, body) => {
    const res = await call("POST", "/api/operations/geofences/simulate-handshake", "LM", body);
    expect(res.status).toBe(400);
    expect(fake.audits()).toHaveLength(0);
    expect(emitted).toHaveLength(0);
  });

  it.each(["GUEST", "DRIVER", "SUPPLIER", "COMPANY", "COORDINATOR"] as Actor[])(
    "denies %s without audit or emission",
    async (actor) => {
      const res = await call("POST", "/api/operations/geofences/simulate-handshake", actor, { demo: true });
      expect(res.status).toBe(403);
      expect(fake.audits()).toHaveLength(0);
      expect(emitted).toHaveLength(0);
    }
  );
});
