import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { Role } from "@prisma/client";

/**
 * T-03: HTTP-level checks that responses, audit snapshots and socket payloads
 * never carry password hashes or driver national IDs.
 *
 * The fake Prisma client below applies the `select` / `omit` / `include`
 * arguments each route passes, the way Prisma does. Every fixture row carries
 * synthetic sentinel secrets, so a route that asks for a full `user` or
 * `driver` row leaks the sentinel and fails these tests.
 */

const fake = vi.hoisted(() => {
  const HASH = "$2a$12$T03.SENTINEL.HASH.synthetic.not.a.credential";
  const NATIONAL_ID = "1098765432";

  type Row = { scalars: Record<string, unknown>; relations: Record<string, unknown> };
  type Args = {
    select?: Record<string, unknown>;
    omit?: Record<string, unknown>;
    include?: Record<string, unknown>;
    data?: Record<string, unknown>;
  };

  const row = (
    scalars: Record<string, unknown>,
    relations: Record<string, unknown> = {}
  ): Row => ({ scalars, relations });

  function relationArgs(value: unknown): Args | undefined {
    return value === true ? undefined : (value as Args);
  }

  function projectRelation(target: unknown, value: unknown): unknown {
    if (target === null || target === undefined) {
      return null;
    }
    if (Array.isArray(target)) {
      return target.map((item) => project(item as Row, relationArgs(value)));
    }
    return project(target as Row, relationArgs(value));
  }

  function project(source: Row, args?: Args): Record<string, unknown> {
    if (args?.select) {
      const selected: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(args.select)) {
        if (!value) continue;
        if (key in source.scalars) selected[key] = source.scalars[key];
        else if (key in source.relations) {
          selected[key] = projectRelation(source.relations[key], value);
        }
      }
      return selected;
    }

    const result: Record<string, unknown> = { ...source.scalars };
    for (const [key, value] of Object.entries(args?.omit ?? {})) {
      if (value) delete result[key];
    }
    for (const [key, value] of Object.entries(args?.include ?? {})) {
      if (!value) continue;
      if (key === "_count") result._count = {};
      else if (key in source.relations) {
        result[key] = projectRelation(source.relations[key], value);
      }
    }
    return result;
  }

  const createdAt = new Date("2026-10-01T09:00:00Z");
  const user = (id: string, name: string, role: string) =>
    row({
      id,
      name,
      email: `${id}@example.test`,
      phone: "+966500000000",
      role,
      language: "ar",
      avatar: null,
      passwordHash: HASH,
      createdAt,
      updatedAt: createdAt
    });

  const organizerUser = user("usr_org", "Organizer Test", "ORGANIZER");
  const guestUser = user("usr_guest", "Guest Test", "GUEST");
  const captainUser = user("usr_captain", "Captain Test", "DRIVER");

  const driverScalars = {
    id: "drv_1",
    userId: "usr_captain",
    licenseNo: "LIC-T03",
    nationalIdIqama: NATIONAL_ID,
    currentLat: 24.71,
    currentLng: 46.67,
    zone: "CENTRAL_RIYADH",
    status: "AVAILABLE",
    shiftStart: null,
    shiftEnd: null,
    earnings: "0",
    lastLocationAt: null,
    captainType: "VIP_CAPTAIN",
    visitsCompleted: 0,
    overtimeAvailable: false,
    active: true,
    createdAt,
    updatedAt: createdAt
  };
  const eventScalars = {
    id: "evt_1",
    name: "Showcase Summit",
    organizerId: "usr_org",
    date: createdAt,
    venue: "Riyadh Venue",
    venueLat: 24.7,
    venueLng: 46.6,
    createdAt,
    updatedAt: createdAt
  };
  const guestScalars = {
    id: "gst_1",
    userId: "usr_guest",
    eventId: "evt_1",
    rsvpStatus: "INVITED",
    isVIP: true,
    qrCode: "QR-T03",
    tier: "VIP",
    createdAt,
    updatedAt: createdAt
  };
  const taskScalars = {
    id: "tsk_1",
    eventId: "evt_1",
    driverId: "drv_1",
    guestId: "gst_1",
    type: "AIRPORT_PICKUP",
    status: "ASSIGNED",
    ownerName: "Arrival desk",
    pickupLocation: "KKIA",
    dropoffLocation: "Venue",
    pickupLat: 24.95,
    pickupLng: 46.69,
    scheduledAt: createdAt,
    deadlineAt: null,
    completedAt: null,
    createdAt,
    updatedAt: createdAt
  };

  const driver = row(driverScalars, { user: captainUser, tasks: [row(taskScalars)] });
  const guest = row(guestScalars, {
    user: guestUser,
    event: row(eventScalars),
    hospitalityRider: null
  });
  const task = row(taskScalars, { event: row(eventScalars), driver, guest });
  const event = row(eventScalars, {
    city: null,
    organizer: organizerUser,
    guests: [guest],
    tasks: [task],
    bookings: []
  });
  const legacyAudit = row(
    {
      id: "aud_1",
      actorUserId: "usr_org",
      actorRole: "ORGANIZER",
      action: "driver.create",
      entityType: "DRIVER",
      entityId: "drv_1",
      eventId: null,
      beforeData: null,
      afterData: {
        id: "drv_1",
        licenseNo: "LIC-T03",
        nationalIdIqama: NATIONAL_ID,
        user: { id: "usr_captain", name: "Captain Test", passwordHash: HASH }
      },
      metadata: { method: "POST", path: "/drivers" },
      ipAddress: null,
      userAgent: null,
      createdAt
    },
    { actor: organizerUser }
  );
  // Secrets nested inside objects and arrays in all three JSON columns.
  const legacyTaskAudit = row(
    {
      id: "aud_2",
      actorUserId: "usr_org",
      actorRole: "ORGANIZER",
      action: "task.assign",
      entityType: "TASK",
      entityId: "tsk_1",
      eventId: "evt_1",
      beforeData: {
        id: "tsk_1",
        status: "PENDING",
        driver: {
          id: "drv_1",
          nationalIdIqama: NATIONAL_ID,
          user: { id: "usr_captain", passwordHash: HASH }
        }
      },
      afterData: {
        id: "tsk_1",
        status: "ASSIGNED",
        candidates: [
          { id: "drv_1", nationalIdIqama: NATIONAL_ID, user: { name: "Captain Test", passwordHash: HASH } },
          { id: "drv_2", licenseNo: "LIC-OTHER" }
        ]
      },
      metadata: {
        method: "PUT",
        guests: [{ id: "gst_1", user: { name: "Guest Test", passwordHash: HASH } }],
        passwordHash: HASH
      },
      ipAddress: "127.0.0.1",
      userAgent: "vitest",
      createdAt
    },
    { actor: organizerUser }
  );

  const fixtures: Record<string, Row[]> = {
    user: [organizerUser, guestUser, captainUser],
    driver: [driver],
    guest: [guest],
    task: [task],
    event: [event],
    auditLog: [legacyAudit, legacyTaskAudit]
  };

  const writes: Array<{ model: string; method: string; args: Args }> = [];
  const reads: Array<{ model: string; method: string; args: Record<string, unknown> }> = [];

  function modelClient(model: string) {
    return new Proxy(
      {},
      {
        get: (_target, method: string) => async (args: Args = {}) => {
          const rows = fixtures[model] ?? [];
          switch (method) {
            case "findMany":
              reads.push({ model, method, args: args as Record<string, unknown> });
              return rows.map((item) => project(item, args));
            case "findUnique":
            case "findFirst":
              return rows[0] ? project(rows[0], args) : null;
            case "create":
            case "update":
            case "upsert":
              writes.push({ model, method, args });
              return rows[0] ? project(rows[0], args) : { id: `${model}_new`, ...args.data };
            case "count":
              return 0;
            default:
              return { count: 0 };
          }
        }
      }
    );
  }

  const prisma = new Proxy(
    {},
    {
      get: (_target, key: string) =>
        key.startsWith("$") ? async () => [] : modelClient(key)
    }
  );

  return { prisma, writes, reads, HASH, NATIONAL_ID };
});

vi.mock("../db.js", () => ({ prisma: fake.prisma }));

const { signTokens } = await import("../middleware/auth.js");
const { findSensitiveFieldPaths } = await import("../utils/safeResponse.js");
const auditLogsRouter = (await import("./auditLogs.js")).default;
const bootstrapRouter = (await import("./bootstrap.js")).default;
const driversRouter = (await import("./drivers.js")).default;
const eventsRouter = (await import("./events.js")).default;
const operationsRouter = (await import("./operations.js")).default;
const tasksRouter = (await import("./tasks.js")).default;

type Emitted = { room: string | null; event: string; payload: unknown };
const emitted: Emitted[] = [];
const io = {
  emit: (event: string, payload: unknown) => {
    emitted.push({ room: null, event, payload });
  },
  to: (room: string) => ({
    emit: (event: string, payload: unknown) => {
      emitted.push({ room, event, payload });
    }
  })
};

function expectNoSensitiveData(value: unknown) {
  expect(findSensitiveFieldPaths(value)).toEqual([]);
  const serialized = JSON.stringify(value);
  expect(serialized).not.toContain(fake.HASH);
  expect(serialized).not.toContain(fake.NATIONAL_ID);
}

let server: Server;
let base = "";

function tokenFor(role: Role, id = `usr_${role.toLowerCase()}`) {
  return signTokens({ id, email: `${id}@example.test`, role }).accessToken;
}

async function call(
  method: string,
  path: string,
  role: Role,
  body?: unknown
): Promise<{ status: number; json: Record<string, any> }> {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tokenFor(role)}`
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: res.status, json: (await res.json()) as Record<string, any> };
}

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.set("io", io);
  app.use("/api/audit-logs", auditLogsRouter);
  app.use("/api", bootstrapRouter);
  app.use("/api", operationsRouter);
  app.use("/api/drivers", driversRouter);
  app.use("/api/events", eventsRouter);
  app.use("/api/tasks", tasksRouter);
  app.use((error: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
    res.status(error.status ?? 500).json({ error: error.message });
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
  fake.writes.length = 0;
  fake.reads.length = 0;
  emitted.length = 0;
});

describe("GET /api/bootstrap", () => {
  it.each([Role.LOGISTICS_MANAGER, Role.GUEST, Role.DRIVER])(
    "returns no hashes or national IDs for %s",
    async (role) => {
      const { status, json } = await call("GET", "/api/bootstrap", role);

      expect(status).toBe(200);
      expectNoSensitiveData(json);
      expect(json.drivers[0]).toMatchObject({
        id: "drv_1",
        licenseNo: "LIC-T03",
        status: "AVAILABLE",
        user: { id: "usr_captain", name: "Captain Test", phone: "+966500000000" }
      });
      expect(json.events[0].guests[0].user.name).toBe("Guest Test");
      expect(json.events[0].tasks[0].driver.user.name).toBe("Captain Test");
      expect(json.events[0].tasks[0].guest.qrCode).toBe("QR-T03");
    }
  );

  it("strips sensitive keys from stored audit snapshots and keeps the rest", async () => {
    const { json } = await call("GET", "/api/bootstrap", Role.LOGISTICS_MANAGER);

    expect(json.auditLogs[0].afterData).toEqual({
      id: "drv_1",
      licenseNo: "LIC-T03",
      user: { id: "usr_captain", name: "Captain Test" }
    });
    expect(json.auditLogs[0].actor.name).toBe("Organizer Test");
  });
});

describe("task responses", () => {
  it("GET /api/tasks/:id keeps operational fields without secrets", async () => {
    const { status, json } = await call("GET", "/api/tasks/tsk_1", Role.LOGISTICS_MANAGER);

    expect(status).toBe(200);
    expectNoSensitiveData(json);
    expect(json.task.driver).toMatchObject({ licenseNo: "LIC-T03", user: { name: "Captain Test" } });
    expect(json.task.guest.user).toMatchObject({ name: "Guest Test", email: "usr_guest@example.test" });
  });

  it("GET /api/tasks returns a clean list", async () => {
    const { status, json } = await call("GET", "/api/tasks", Role.LOGISTICS_MANAGER);

    expect(status).toBe(200);
    expectNoSensitiveData(json);
    expect(json.tasks).toHaveLength(1);
  });

  it("PUT /api/tasks/:id/assignment keeps secrets out of the response, audit and sockets", async () => {
    const { status, json } = await call(
      "PUT",
      "/api/tasks/tsk_1/assignment",
      Role.LOGISTICS_MANAGER,
      { driverId: "drv_1" }
    );

    expect(status).toBe(200);
    expectNoSensitiveData(json);
    const assigned = emitted.find((entry) => entry.event === "task:assigned");
    expect(assigned?.room).toBe("user:usr_captain");
    expectNoSensitiveData(emitted);
    const audit = fake.writes.find((entry) => entry.model === "auditLog");
    expect(audit).toBeDefined();
    expectNoSensitiveData(audit?.args.data);
  });
});

describe("driver responses", () => {
  it("GET /api/drivers omits the national ID", async () => {
    const { status, json } = await call("GET", "/api/drivers", Role.LOGISTICS_MANAGER);

    expect(status).toBe(200);
    expectNoSensitiveData(json);
    expect(json.drivers[0]).toMatchObject({ licenseNo: "LIC-T03", captainType: "VIP_CAPTAIN" });
  });

  it("POST /api/drivers stores the national ID but never returns or audits it", async () => {
    const { status, json } = await call("POST", "/api/drivers", Role.LOGISTICS_MANAGER, {
      name: "New Captain",
      email: "new.captain@example.test",
      phone: "+966500000099",
      licenseNo: "LIC-NEW",
      nationalIdIqama: fake.NATIONAL_ID
    });

    expect(status).toBe(201);
    expectNoSensitiveData(json);
    expect(json.driver.user.name).toBe("Captain Test");
    const create = fake.writes.find(
      (entry) => entry.model === "driver" && entry.method === "create"
    );
    expect(create?.args.data?.nationalIdIqama).toBe(fake.NATIONAL_ID);
    const audit = fake.writes.find((entry) => entry.model === "auditLog");
    expectNoSensitiveData(audit?.args.data);
  });

  it("PUT /api/drivers/:id/location keeps secrets out of the response, audit and sockets", async () => {
    const { status, json } = await call(
      "PUT",
      "/api/drivers/drv_1/location",
      Role.LOGISTICS_MANAGER,
      { lat: 24.72, lng: 46.68, eventId: "evt_1" }
    );

    expect(status).toBe(200);
    expectNoSensitiveData(json);
    expectNoSensitiveData(emitted);
    const audit = fake.writes.find((entry) => entry.model === "auditLog");
    expectNoSensitiveData(audit?.args.data);
  });
});

describe("event responses", () => {
  it("GET /api/events/:id returns clean nested guests and tasks", async () => {
    const { status, json } = await call("GET", "/api/events/evt_1", Role.LOGISTICS_MANAGER);

    expect(status).toBe(200);
    expectNoSensitiveData(json);
    expect(json.event.guests[0].user.name).toBe("Guest Test");
    expect(json.event.tasks[0].driver.licenseNo).toBe("LIC-T03");
  });

  it("GET /api/events/:id/guests returns clean guest users", async () => {
    const { status, json } = await call("GET", "/api/events/evt_1/guests", Role.LOGISTICS_MANAGER);

    expect(status).toBe(200);
    expectNoSensitiveData(json);
    expect(json.guests[0].user.name).toBe("Guest Test");
  });
});

describe("GET /api/audit-logs", () => {
  it.each([Role.LOGISTICS_MANAGER, Role.ORGANIZER, Role.SUPER_ADMIN])(
    "strips nested secrets from stored snapshots for %s",
    async (role) => {
      const { status, json } = await call("GET", "/api/audit-logs", role);

      expect(status).toBe(200);
      expectNoSensitiveData(json);
      expect(json.auditLogs).toHaveLength(2);
      expect(json.auditLogs[0].afterData).toEqual({
        id: "drv_1",
        licenseNo: "LIC-T03",
        user: { id: "usr_captain", name: "Captain Test" }
      });
      expect(json.auditLogs[1].beforeData).toEqual({
        id: "tsk_1",
        status: "PENDING",
        driver: { id: "drv_1", user: { id: "usr_captain" } }
      });
      expect(json.auditLogs[1].afterData).toEqual({
        id: "tsk_1",
        status: "ASSIGNED",
        candidates: [
          { id: "drv_1", user: { name: "Captain Test" } },
          { id: "drv_2", licenseNo: "LIC-OTHER" }
        ]
      });
      expect(json.auditLogs[1].metadata).toEqual({
        method: "PUT",
        guests: [{ id: "gst_1", user: { name: "Guest Test" } }]
      });
    }
  );

  it("keeps the actor projection and normal audit fields", async () => {
    const { json } = await call("GET", "/api/audit-logs", Role.LOGISTICS_MANAGER);

    expect(json.auditLogs[1]).toMatchObject({
      id: "aud_2",
      actorUserId: "usr_org",
      actorRole: "ORGANIZER",
      action: "task.assign",
      entityType: "TASK",
      entityId: "tsk_1",
      eventId: "evt_1",
      ipAddress: "127.0.0.1",
      userAgent: "vitest",
      createdAt: "2026-10-01T09:00:00.000Z"
    });
    expect(json.auditLogs[1].actor).toEqual({
      id: "usr_org",
      name: "Organizer Test",
      email: "usr_org@example.test",
      role: "ORGANIZER"
    });
    expect(json.auditLogs[0].beforeData).toBeNull();
  });

  it("passes filters, ordering and limit to Prisma unchanged", async () => {
    await call(
      "GET",
      "/api/audit-logs?eventId=evt_1&entityType=TASK&action=task.assign&limit=5",
      Role.ORGANIZER
    );

    const read = fake.reads.find((entry) => entry.model === "auditLog");
    expect(read?.args).toEqual({
      where: { eventId: "evt_1", entityType: "TASK", action: "task.assign" },
      include: { actor: { select: { id: true, name: true, email: true, role: true } } },
      orderBy: { createdAt: "desc" },
      take: 5
    });
  });

  it.each([Role.GUEST, Role.DRIVER])("still rejects %s", async (role) => {
    const { status, json } = await call("GET", "/api/audit-logs", role);

    expect(status).toBe(403);
    expect(json.auditLogs).toBeUndefined();
    expect(fake.reads.some((entry) => entry.model === "auditLog")).toBe(false);
  });
});

describe("operations responses", () => {
  it("GET /api/live-command-center flags tasks without secrets", async () => {
    const { status, json } = await call("GET", "/api/live-command-center", Role.LOGISTICS_MANAGER);

    expect(status).toBe(200);
    expectNoSensitiveData(json);
  });
});
