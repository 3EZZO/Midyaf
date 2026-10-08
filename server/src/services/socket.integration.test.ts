import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import jwt from "jsonwebtoken";
import { Role } from "@prisma/client";
import { Server } from "socket.io";
import { io as connectClient, type Socket as ClientSocket } from "socket.io-client";

/**
 * T-09 integration: an isolated Socket.IO server running the real
 * `configureRealtime` with synthetic tokens and a mocked database. It never
 * touches the application boot path or a real database.
 *
 * Model: evt_1 (owner usr_org) has guests usr_guest (assigned to drv_1) and
 * usr_guest_3 (not assigned), supplier usr_supplier (booking); evt_2 belongs
 * to usr_org_2. Driver drv_1 belongs to usr_captain and has a task in evt_1.
 */

const db = vi.hoisted(() => {
  const events = new Map([
    ["evt_1", { id: "evt_1", organizerId: "usr_org" }],
    ["evt_2", { id: "evt_2", organizerId: "usr_org_2" }]
  ]);
  const invited = new Set(["usr_guest", "usr_guest_3"]);

  return {
    event: {
      findUnique: vi.fn(async ({ where }: any) => events.get(where.id) ?? null),
      findFirst: vi.fn(async ({ where }: any) => {
        const event = events.get(where.id);
        return event && (!where.organizerId || event.organizerId === where.organizerId)
          ? event
          : null;
      })
    },
    guest: {
      findFirst: vi.fn(async ({ where }: any) =>
        where.eventId === "evt_1" && invited.has(where.userId) ? { id: `gst_${where.userId}` } : null
      )
    },
    task: {
      findFirst: vi.fn(async ({ where }: any) => {
        const driverMatches = where.driverId === "drv_1" || where.driver?.userId === "usr_captain";
        return where.eventId === "evt_1" && driverMatches ? { id: "tsk_1" } : null;
      }),
      findMany: vi.fn(async ({ where }: any) =>
        where.driverId === "drv_1" && where.eventId === "evt_1"
          ? [{ guest: { userId: "usr_guest" } }]
          : []
      )
    },
    driver: {
      findUnique: vi.fn(async ({ where }: any) =>
        where.userId === "usr_captain" ? { id: "drv_1" } : null
      ),
      update: vi.fn(async () => ({}))
    },
    booking: {
      findFirst: vi.fn(async ({ where }: any) =>
        where.eventId === "evt_1" && where.supplier?.userId === "usr_supplier" ? { id: "bkg_1" } : null
      )
    },
    activityIntake: { findFirst: vi.fn(async () => null) },
    user: { findUnique: vi.fn(async () => null) },
    $transaction: vi.fn(async (operations: unknown[]) => operations)
  };
});

vi.mock("../db.js", () => ({ prisma: db }));

const { signTokens } = await import("../middleware/auth.js");
const { env } = await import("../env.js");
const { configureRealtime } = await import("./socketAuthorization.js");
const { telemetryBuffer } = await import("./telemetryBuffer.js");
const { decodeTelemetryFrame } = await import("../utils/telemetryCodec.js");

let httpServer: http.Server;
let io: Server;
let url = "";
const clients: ClientSocket[] = [];

function tokenFor(id: string, role: Role) {
  return signTokens({ id, email: `${id}@example.test`, role }).accessToken;
}

/** Same handshake shape as the client's buildSocketOptions. */
function open(token: string | (() => string)) {
  const getToken = typeof token === "function" ? token : () => token;
  const socket = connectClient(url, {
    transports: ["websocket"],
    forceNew: true,
    reconnection: false,
    auth: (callback: (data: object) => void) => callback({ token: getToken() })
  });
  clients.push(socket);
  return socket;
}

function connected(socket: ClientSocket) {
  return new Promise<void>((resolve, reject) => {
    socket.once("connect", () => resolve());
    socket.once("connect_error", reject);
  });
}

function rejected(socket: ClientSocket) {
  return new Promise<Error>((resolve, reject) => {
    socket.once("connect", () => reject(new Error("unexpectedly connected")));
    socket.once("connect_error", resolve);
  });
}

async function connectAs(id: string, role: Role) {
  const socket = open(tokenFor(id, role));
  await connected(socket);
  return socket;
}

function join(socket: ClientSocket, event: string, id?: string) {
  return new Promise<{ ok: boolean }>((resolve) => {
    if (id === undefined) socket.emit(event, undefined, resolve);
    else socket.emit(event, id, resolve);
  });
}

/** Collects events of one name for a short window. */
function collect(socket: ClientSocket, event: string, ms = 250) {
  const received: unknown[] = [];
  socket.on(event, (payload: unknown) => received.push(payload));
  return new Promise<unknown[]>((resolve) => setTimeout(() => resolve(received), ms));
}

let latitude = 24.7;
/** A fresh position far enough from the last to pass the telemetry deadband. */
function nextFrame(overrides: Record<string, unknown> = {}) {
  latitude += 0.01;
  return {
    driverId: "drv_1",
    lat: latitude,
    lng: 46.67,
    speed: 40,
    heading: 90,
    timestamp: new Date().toISOString(),
    eventId: "evt_1",
    ...overrides
  };
}

beforeAll(async () => {
  httpServer = http.createServer();
  io = new Server(httpServer);
  configureRealtime(io);
  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
});

afterEach(() => {
  vi.restoreAllMocks();
  while (clients.length) clients.pop()?.disconnect();
});

afterAll(async () => {
  await telemetryBuffer.stop();
  await new Promise<void>((resolve) => io.close(() => resolve()));
});

describe("handshake authentication", () => {
  it("rejects anonymous, invalid, expired, refresh and claim-less tokens", async () => {
    const expired = jwt.sign(
      { sub: "usr_lm", email: "usr_lm@example.test", role: Role.LOGISTICS_MANAGER },
      env.JWT_ACCESS_SECRET,
      { expiresIn: -10 }
    );
    const refresh = signTokens({
      id: "usr_lm",
      email: "usr_lm@example.test",
      role: Role.LOGISTICS_MANAGER
    }).refreshToken;
    const missingRole = jwt.sign({ sub: "usr_lm", email: "usr_lm@example.test" }, env.JWT_ACCESS_SECRET);

    for (const token of ["", "not-a-jwt", expired, refresh, missingRole]) {
      const error = await rejected(open(token));
      expect(error.message).toBe("unauthorized");
    }
  });

  it("accepts a valid access token", async () => {
    const socket = await connectAs("usr_lm", Role.LOGISTICS_MANAGER);
    expect(socket.connected).toBe(true);
  });

  it("reconnects with the latest token after a refresh", async () => {
    let token = "stale-token";
    const socket = open(() => token);
    expect((await rejected(socket)).message).toBe("unauthorized");

    token = tokenFor("usr_lm", Role.LOGISTICS_MANAGER);
    const reconnected = connected(socket);
    socket.connect();
    await reconnected;
    expect(socket.connected).toBe(true);
  });
});

describe("room authorization", () => {
  it("auto-joins only the actor's own user room", async () => {
    const guest = await connectAs("usr_guest", Role.GUEST);
    const other = await connectAs("usr_guest_2", Role.GUEST);

    expect(await join(guest, "user:join", "usr_guest")).toEqual({ ok: true });
    expect(await join(other, "user:join", "usr_guest")).toEqual({ ok: false });

    const forGuest = collect(guest, "task:assigned");
    const forOther = collect(other, "task:assigned");
    io.to("user:usr_guest").emit("task:assigned", { id: "tsk_1" });
    expect(await forGuest).toHaveLength(1);
    expect(await forOther).toHaveLength(0);
  });

  it("admits event rooms by the read policy and keeps others out", async () => {
    const lm = await connectAs("usr_lm", Role.LOGISTICS_MANAGER);
    const owner = await connectAs("usr_org", Role.ORGANIZER);
    const outsider = await connectAs("usr_org_2", Role.ORGANIZER);
    const coordinator = await connectAs("usr_coord", Role.COORDINATOR);
    const supplier = await connectAs("usr_supplier", Role.SUPPLIER);

    expect(await join(lm, "event:join", "evt_1")).toEqual({ ok: true });
    expect(await join(owner, "event:join", "evt_1")).toEqual({ ok: true });
    expect(await join(supplier, "event:join", "evt_1")).toEqual({ ok: true });
    expect(await join(outsider, "event:join", "evt_1")).toEqual({ ok: false });
    expect(await join(coordinator, "event:join", "evt_1")).toEqual({ ok: false });

    const inside = collect(owner, "task:status_change");
    const outside = collect(outsider, "task:status_change");
    io.to("event:evt_1").emit("task:status_change", { taskId: "tsk_1", status: "EN_ROUTE" });
    expect(await inside).toHaveLength(1);
    expect(await outside).toHaveLength(0);
  });

  it("limits the organizers room and driver rooms", async () => {
    const lm = await connectAs("usr_lm", Role.LOGISTICS_MANAGER);
    const coordinator = await connectAs("usr_coord", Role.COORDINATOR);
    const captain = await connectAs("usr_captain", Role.DRIVER);

    expect(await join(lm, "organizer:join")).toEqual({ ok: true });
    expect(await join(coordinator, "organizer:join")).toEqual({ ok: false });
    expect(await join(captain, "driver:join", "drv_1")).toEqual({ ok: true });
    expect(await join(captain, "driver:join", "drv_2")).toEqual({ ok: false });
    expect(await join(lm, "driver:join", "drv_1")).toEqual({ ok: false });
  });

  it("denies the join when the policy lookup fails", async () => {
    const lm = await connectAs("usr_lm", Role.LOGISTICS_MANAGER);
    db.event.findUnique.mockRejectedValueOnce(new Error("database unavailable"));
    expect(await join(lm, "event:join", "evt_1")).toEqual({ ok: false });
  });
});

describe("telemetry audience and client-originated events", () => {
  it("sends a driver's telemetry to event operators and its assigned guests only", async () => {
    const lm = await connectAs("usr_lm", Role.LOGISTICS_MANAGER);
    await join(lm, "event:join", "evt_1");
    const owner = await connectAs("usr_org", Role.ORGANIZER);
    await join(owner, "event:join", "evt_1");
    const assignedGuest = await connectAs("usr_guest", Role.GUEST);
    await join(assignedGuest, "event:join", "evt_1");
    const otherGuest = await connectAs("usr_guest_3", Role.GUEST);
    expect(await join(otherGuest, "event:join", "evt_1")).toEqual({ ok: true });
    const supplier = await connectAs("usr_supplier", Role.SUPPLIER);
    expect(await join(supplier, "event:join", "evt_1")).toEqual({ ok: true });
    const captain = await connectAs("usr_captain", Role.DRIVER);

    const feeds = {
      lm: collect(lm, "driver:location_update"),
      ownerStream: collect(owner, "driver:telemetry_stream"),
      assigned: collect(assignedGuest, "driver:location_update"),
      assignedStream: collect(assignedGuest, "driver:telemetry_stream"),
      other: collect(otherGuest, "driver:location_update"),
      supplier: collect(supplier, "driver:location_update")
    };
    captain.emit("driver:location_update", nextFrame());

    const [forOperator] = (await feeds.lm) as Array<Record<string, unknown>>;
    expect(await feeds.lm).toHaveLength(1);
    // Client contract (ServerEvents["driver:location_update"], App, liveState).
    expect(forOperator).toMatchObject({
      driverId: "drv_1",
      lat: expect.any(Number),
      lng: expect.any(Number),
      updatedAt: expect.any(String)
    });
    expect(Number.isFinite(Date.parse(forOperator.updatedAt as string))).toBe(true);
    expect(await feeds.ownerStream).toHaveLength(1);
    const [forGuest] = (await feeds.assigned) as Array<{ driverId: string }>;
    expect(forGuest).toMatchObject({ driverId: "drv_1" });
    expect(await feeds.assignedStream).toHaveLength(0);
    expect(await feeds.other).toHaveLength(0);
    expect(await feeds.supplier).toHaveLength(0);
  });

  it("drops spoofed driver ids, telemetry from non-drivers and stale frames", async () => {
    const lm = await connectAs("usr_lm", Role.LOGISTICS_MANAGER);
    await join(lm, "organizer:join");
    const captain = await connectAs("usr_captain", Role.DRIVER);
    const guest = await connectAs("usr_guest", Role.GUEST);

    const feed = collect(lm, "driver:telemetry_stream");
    captain.emit("driver:location_update", nextFrame({ driverId: "drv_2" }));
    captain.emit(
      "driver:location_update",
      nextFrame({ timestamp: new Date(Date.now() - 10 * 60_000).toISOString() })
    );
    guest.emit("driver:telemetry_stream", nextFrame());
    lm.emit("driver:location_update", nextFrame());
    expect(await feed).toHaveLength(0);
  });

  it("drops malformed measurements at the socket boundary but keeps omitted-field defaults", async () => {
    const lm = await connectAs("usr_lm", Role.LOGISTICS_MANAGER);
    await join(lm, "organizer:join");
    const captain = await connectAs("usr_captain", Role.DRIVER);

    const rejectedFeed = collect(lm, "driver:telemetry_stream");
    captain.emit("driver:location_update", nextFrame({ timestamp: "not-a-date" }));
    captain.emit("driver:location_update", nextFrame({ speed: "fast" }));
    captain.emit("driver:location_update", nextFrame({ heading: "north" }));
    captain.emit("driver:telemetry_stream", `T1|drv_1|${(latitude += 0.01).toFixed(6)}|46.67|40|90|||abc||`);
    captain.emit("driver:telemetry_stream", `T1|drv_1|${(latitude += 0.01).toFixed(6)}|46.67|40|90|||0||`);
    captain.emit(
      "driver:telemetry_stream",
      JSON.stringify(`T1|drv_1|${(latitude += 0.01).toFixed(6)}|46.67|40|90|||0||`)
    );
    captain.emit(
      "driver:location_update",
      JSON.stringify(JSON.stringify(`T1|drv_1|${(latitude += 0.01).toFixed(6)}|46.67|40|90|||${Date.now()}||`))
    );
    expect(await rejectedFeed).toHaveLength(0);

    const defaultsFeed = collect(lm, "driver:location_update");
    captain.emit("driver:location_update", { driverId: "drv_1", lat: (latitude += 0.01), lng: 46.67 });
    const [update] = (await defaultsFeed) as Array<Record<string, unknown>>;
    expect(update).toMatchObject({ driverId: "drv_1", speed: 0, heading: 0, updatedAt: expect.any(String) });
  });

  it("drops the frame when the assignment lookup fails", async () => {
    const lm = await connectAs("usr_lm", Role.LOGISTICS_MANAGER);
    await join(lm, "organizer:join");
    const captain = await connectAs("usr_captain", Role.DRIVER);

    db.task.findFirst.mockRejectedValueOnce(new Error("database unavailable"));
    const feed = collect(lm, "driver:telemetry_stream");
    captain.emit("driver:location_update", nextFrame());
    expect(await feed).toHaveLength(0);
  });

  it("strips an eventId the driver is not assigned to", async () => {
    const lm = await connectAs("usr_lm", Role.LOGISTICS_MANAGER);
    await join(lm, "organizer:join");
    const otherOwner = await connectAs("usr_org_2", Role.ORGANIZER);
    expect(await join(otherOwner, "event:join", "evt_2")).toEqual({ ok: true });
    const captain = await connectAs("usr_captain", Role.DRIVER);

    const operatorFeed = collect(lm, "driver:telemetry_stream");
    const otherEventFeed = collect(otherOwner, "driver:telemetry_stream");
    captain.emit("driver:telemetry_stream", nextFrame({ eventId: "evt_2" }));

    const packed = (await operatorFeed) as string[];
    expect(packed).toHaveLength(1);
    expect(decodeTelemetryFrame(packed[0])?.eventId).toBeUndefined();
    expect(await otherEventFeed).toHaveLength(0);
  });

  it("re-checks a cached assignment after it expires", async () => {
    const owner = await connectAs("usr_org", Role.ORGANIZER);
    await join(owner, "event:join", "evt_1");
    const captain = await connectAs("usr_captain", Role.DRIVER);

    const first = collect(owner, "driver:telemetry_stream");
    captain.emit("driver:telemetry_stream", nextFrame());
    expect(await first).toHaveLength(1);

    // The driver is unassigned; within the cache window frames still carry evt_1.
    db.task.findFirst.mockResolvedValue(null);
    const cached = collect(owner, "driver:telemetry_stream");
    captain.emit("driver:telemetry_stream", nextFrame());
    expect(await cached).toHaveLength(1);

    const realNow = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(realNow + 61_000);
    const expired = collect(owner, "driver:telemetry_stream");
    captain.emit("driver:telemetry_stream", nextFrame({ timestamp: new Date(realNow + 61_000).toISOString() }));
    expect(await expired).toHaveLength(0);
  });

  it("ignores forged task, arrival and delay broadcasts from clients", async () => {
    const owner = await connectAs("usr_org", Role.ORGANIZER);
    await join(owner, "event:join", "evt_1");
    const guest = await connectAs("usr_guest", Role.GUEST);
    await join(guest, "event:join", "evt_1");

    const forged = Promise.all(
      ["task:status_change", "guest:arrived", "alert:delay"].map((name) => collect(owner, name))
    );
    guest.emit("task:status_change", { eventId: "evt_1", taskId: "tsk_1", status: "COMPLETED" });
    guest.emit("guest:arrived", { eventId: "evt_1", guestId: "gst_1" });
    guest.emit("alert:delay", { eventId: "evt_1", taskId: "tsk_1" });
    expect((await forged).flat()).toHaveLength(0);
  });

  it("rebuilds user locations from the actor and never treats them as driver telemetry", async () => {
    const lm = await connectAs("usr_lm", Role.LOGISTICS_MANAGER);
    await join(lm, "organizer:join");
    const guest = await connectAs("usr_guest", Role.GUEST);

    const locations = collect(lm, "user:location_update");
    const telemetry = collect(lm, "driver:telemetry_stream");
    guest.emit("user:location_update", { userId: "usr_lm", driverId: "drv_1", lat: 24.8, lng: 46.7 });

    const [location] = (await locations) as Array<Record<string, unknown>>;
    expect(location).toMatchObject({ userId: "usr_guest", lat: 24.8, lng: 46.7 });
    expect(location).not.toHaveProperty("driverId");
    expect(await telemetry).toHaveLength(0);
  });
});
