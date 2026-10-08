import { beforeEach, describe, expect, it, vi } from "vitest";
import { Role } from "@prisma/client";
import { encodeTelemetryFrame } from "../utils/telemetryCodec.js";

/**
 * T-09 unit tests for the realtime authorization rules. Prisma is mocked with
 * a tiny in-memory model: event evt_1 owned by usr_org; guest usr_guest
 * invited; driver drv_1 (user usr_captain) with a task carrying usr_guest;
 * supplier usr_supplier with a booking; company usr_company with an intake.
 */

const db = vi.hoisted(() => {
  const event = { id: "evt_1", organizerId: "usr_org" };
  const matches = (where: Record<string, any> | undefined, row: Record<string, any>) =>
    Object.entries(where ?? {}).every(([key, value]) =>
      typeof value === "object" && value !== null ? true : row[key] === value
    );

  return {
    event: {
      findUnique: vi.fn(async ({ where }: any) => (where.id === event.id ? event : null)),
      findFirst: vi.fn(async ({ where }: any) => (matches(where, event) ? event : null))
    },
    guest: {
      findFirst: vi.fn(async ({ where }: any) =>
        where.eventId === "evt_1" && where.userId === "usr_guest" ? { id: "gst_1" } : null
      )
    },
    task: {
      findFirst: vi.fn(async ({ where }: any) => {
        const driverMatches =
          where.driverId === "drv_1" || where.driver?.userId === "usr_captain";
        return where.eventId === "evt_1" && driverMatches ? { id: "tsk_1" } : null;
      }),
      findMany: vi.fn(async ({ where }: any) =>
        where.driverId === "drv_1" && where.eventId === "evt_1"
          ? [{ guest: { userId: "usr_guest" } }, { guest: { userId: "usr_guest" } }, { guest: null }]
          : []
      )
    },
    driver: {
      findUnique: vi.fn(async ({ where }: any) =>
        where.userId === "usr_captain" ? { id: "drv_1" } : null
      )
    },
    booking: {
      findFirst: vi.fn(async ({ where }: any) =>
        where.eventId === "evt_1" && where.supplier?.userId === "usr_supplier"
          ? { id: "bkg_1" }
          : null
      )
    },
    activityIntake: {
      findFirst: vi.fn(async ({ where }: any) =>
        where.eventId === "evt_1" &&
        where.submittedBy?.in?.includes("usr_company@example.test")
          ? { id: "int_1" }
          : null
      )
    },
    user: { findUnique: vi.fn(async () => ({ name: "Client Company" })) }
  };
});

vi.mock("../db.js", () => ({ prisma: db }));

const {
  ORGANIZER_ROOM_ROLES,
  TELEMETRY_MAX_AGE_MS,
  assignedGuestUserIds,
  authorizeDriverTelemetry,
  canJoinRoom,
  isEventOperator,
  resolveOwnDriverId,
  sanitizeUserLocation
} = await import("./socketAuthorization.js");

const actor = (id: string, role: Role) => ({ id, email: `${id}@example.test`, role });
const LM = actor("usr_lm", Role.LOGISTICS_MANAGER);
const SA = actor("usr_sa", Role.SUPER_ADMIN);
const ORG = actor("usr_org", Role.ORGANIZER);
const OTHER_ORG = actor("usr_org_2", Role.ORGANIZER);
const COORD = actor("usr_coord", Role.COORDINATOR);
const GUEST = actor("usr_guest", Role.GUEST);
const OTHER_GUEST = actor("usr_guest_2", Role.GUEST);
const CAPTAIN = actor("usr_captain", Role.DRIVER);
const COMPANY = actor("usr_company", Role.COMPANY_ORGANIZER);
const OTHER_COMPANY = actor("usr_company_2", Role.COMPANY_ORGANIZER);
const SUPPLIER = actor("usr_supplier", Role.SUPPLIER);
const OTHER_SUPPLIER = actor("usr_supplier_2", Role.SUPPLIER);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("canJoinRoom", () => {
  it("allows only the actor's own user room", async () => {
    await expect(canJoinRoom(GUEST, { kind: "user", id: "usr_guest" })).resolves.toBe(true);
    await expect(canJoinRoom(GUEST, { kind: "user", id: "usr_lm" })).resolves.toBe(false);
    await expect(canJoinRoom(LM, { kind: "user", id: "usr_guest" })).resolves.toBe(false);
  });

  it("allows a driver room only to the driver who owns it", async () => {
    await expect(canJoinRoom(CAPTAIN, { kind: "driver", id: "drv_1" })).resolves.toBe(true);
    await expect(canJoinRoom(CAPTAIN, { kind: "driver", id: "drv_2" })).resolves.toBe(false);
    await expect(canJoinRoom(LM, { kind: "driver", id: "drv_1" })).resolves.toBe(false);
    await expect(canJoinRoom(GUEST, { kind: "driver", id: "drv_1" })).resolves.toBe(false);
  });

  it("uses the T-08 event read policy for event rooms", async () => {
    const room = { kind: "event", id: "evt_1" } as const;
    for (const user of [LM, SA, ORG, GUEST, CAPTAIN, COMPANY, SUPPLIER]) {
      await expect(canJoinRoom(user, room)).resolves.toBe(true);
    }
    for (const user of [OTHER_ORG, OTHER_GUEST, OTHER_COMPANY, OTHER_SUPPLIER, COORD]) {
      await expect(canJoinRoom(user, room)).resolves.toBe(false);
    }
    await expect(canJoinRoom(LM, { kind: "event", id: "evt_missing" })).resolves.toBe(false);
  });

  it("limits the global organizers room to legacy operators", async () => {
    expect(ORGANIZER_ROOM_ROLES).toEqual([Role.LOGISTICS_MANAGER, Role.SUPER_ADMIN]);
    await expect(canJoinRoom(LM, { kind: "organizers" })).resolves.toBe(true);
    await expect(canJoinRoom(SA, { kind: "organizers" })).resolves.toBe(true);
    for (const user of [ORG, COORD, GUEST, CAPTAIN, COMPANY, SUPPLIER]) {
      await expect(canJoinRoom(user, { kind: "organizers" })).resolves.toBe(false);
    }
  });

  it("rejects malformed room ids without querying the database", async () => {
    for (const id of [undefined, null, 42, "", { id: "evt_1" }, "x".repeat(129)]) {
      await expect(canJoinRoom(LM, { kind: "event", id })).resolves.toBe(false);
      await expect(canJoinRoom(LM, { kind: "user", id })).resolves.toBe(false);
    }
    expect(db.event.findUnique).not.toHaveBeenCalled();
  });

  it("surfaces a failed lookup to the caller, which denies the join", async () => {
    db.event.findUnique.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(canJoinRoom(LM, { kind: "event", id: "evt_1" })).rejects.toThrow(
      "database unavailable"
    );
  });
});

describe("isEventOperator (telemetry audience)", () => {
  it("admits LM/SA and the owning organizer only", async () => {
    for (const user of [LM, SA, ORG]) {
      await expect(isEventOperator(user, "evt_1")).resolves.toBe(true);
    }
    for (const user of [OTHER_ORG, COMPANY, SUPPLIER, GUEST, CAPTAIN, COORD]) {
      await expect(isEventOperator(user, "evt_1")).resolves.toBe(false);
    }
    await expect(isEventOperator(LM, "evt_missing")).resolves.toBe(false);
  });
});

describe("assignedGuestUserIds", () => {
  it("returns each assigned guest user once and skips tasks without a guest", async () => {
    await expect(assignedGuestUserIds("drv_1", "evt_1")).resolves.toEqual(["usr_guest"]);
    await expect(assignedGuestUserIds("drv_1", "evt_2")).resolves.toEqual([]);
    expect(db.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: { notIn: ["COMPLETED", "CANCELLED"] } })
      })
    );
  });
});

describe("authorizeDriverTelemetry", () => {
  const assigned = vi.fn(async (eventId: string) => eventId === "evt_1");
  const frame = {
    driverId: "drv_1",
    lat: 24.71,
    lng: 46.67,
    speed: 40,
    heading: 90,
    timestamp: 1_760_000_000_000,
    eventId: "evt_1"
  };
  const now = frame.timestamp;

  it("resolves the driver profile only for DRIVER actors", async () => {
    await expect(resolveOwnDriverId(CAPTAIN)).resolves.toBe("drv_1");
    await expect(resolveOwnDriverId(LM)).resolves.toBeNull();
    expect(db.driver.findUnique).toHaveBeenCalledTimes(1);
  });

  it("accepts the driver's own packed and object frames", async () => {
    await expect(
      authorizeDriverTelemetry(CAPTAIN, "drv_1", encodeTelemetryFrame(frame), assigned, now)
    ).resolves.toMatchObject({ driverId: "drv_1", eventId: "evt_1" });
    await expect(
      authorizeDriverTelemetry(
        CAPTAIN,
        "drv_1",
        { ...frame, timestamp: new Date().toISOString() },
        assigned
      )
    ).resolves.toMatchObject({ driverId: "drv_1", lat: 24.71 });
  });

  it("rejects spoofed driver ids, non-drivers and drivers without a profile", async () => {
    await expect(
      authorizeDriverTelemetry(CAPTAIN, "drv_1", { ...frame, driverId: "drv_2" }, assigned, now)
    ).resolves.toBeNull();
    await expect(authorizeDriverTelemetry(LM, null, frame, assigned, now)).resolves.toBeNull();
    await expect(authorizeDriverTelemetry(GUEST, null, frame, assigned, now)).resolves.toBeNull();
    await expect(authorizeDriverTelemetry(CAPTAIN, null, frame, assigned, now)).resolves.toBeNull();
  });

  it("rejects malformed and out-of-range coordinates", async () => {
    for (const raw of [null, "garbage", { driverId: "drv_1" }, { ...frame, lat: 95 }, { ...frame, lng: -200 }]) {
      await expect(authorizeDriverTelemetry(CAPTAIN, "drv_1", raw, assigned, now)).resolves.toBeNull();
    }
  });

  it("rejects stale, future, non-finite and out-of-range measurements", async () => {
    const rejected = [
      { ...frame, timestamp: now - TELEMETRY_MAX_AGE_MS - 1 },
      { ...frame, timestamp: now + 2 * 60_000 },
      { ...frame, speed: Number.POSITIVE_INFINITY },
      { ...frame, speed: -5 },
      { ...frame, speed: 401 },
      { ...frame, heading: Number.POSITIVE_INFINITY }
    ];
    for (const raw of rejected) {
      await expect(authorizeDriverTelemetry(CAPTAIN, "drv_1", raw, assigned, now)).resolves.toBeNull();
    }
    const packedInfinity = `T1|drv_1|24.7|46.6|Infinity|0|||${now}||`;
    await expect(
      authorizeDriverTelemetry(CAPTAIN, "drv_1", packedInfinity, assigned, now)
    ).resolves.toBeNull();
  });

  it("normalises heading and drops unknown status and out-of-range battery", async () => {
    const result = await authorizeDriverTelemetry(
      CAPTAIN,
      "drv_1",
      { ...frame, heading: 370, status: "HACKED", batteryLevel: 150 },
      assigned,
      now
    );
    expect(result).toMatchObject({ heading: 10 });
    expect(result?.status).toBeUndefined();
    expect(result?.batteryLevel).toBeUndefined();

    // Supplied but non-finite optional measurements are malformed input.
    for (const invalid of [{ altitude: Number.NaN }, { accuracy: Number.POSITIVE_INFINITY }]) {
      await expect(
        authorizeDriverTelemetry(CAPTAIN, "drv_1", { ...frame, ...invalid }, assigned, now)
      ).resolves.toBeNull();
    }

    await expect(
      authorizeDriverTelemetry(
        CAPTAIN,
        "drv_1",
        { ...frame, status: "EN_ROUTE", batteryLevel: 80, altitude: 612 },
        assigned,
        now
      )
    ).resolves.toMatchObject({ status: "EN_ROUTE", batteryLevel: 80, altitude: 612 });
  });

  it("rejects malformed supplied measurements before the decoder can default them", async () => {
    const malformed = [
      { ...frame, timestamp: "not-a-date" },
      { ...frame, timestamp: {} },
      { ...frame, speed: "fast" },
      { ...frame, heading: "north" },
      { ...frame, lat: "24.7abc" },
      `T1|drv_1|24.7|46.6|40|90|||abc||`,
      `T1|drv_1|24.7|46.6|fast|90|||${now}||`,
      `T1|drv_1|24.7|46.6|40|north|||${now}||`,
      `T1|drv_1|24.7|46.6|40|90|||${now}||evt_1|full`
    ];
    for (const raw of malformed) {
      await expect(authorizeDriverTelemetry(CAPTAIN, "drv_1", raw, assigned, now)).resolves.toBeNull();
    }
  });

  it("checks an explicitly supplied packed timestamp instead of the decoder's default", async () => {
    // The decoder maps a falsy packed timestamp ("0") to Date.now().
    await expect(
      authorizeDriverTelemetry(CAPTAIN, "drv_1", `T1|drv_1|24.7|46.6|40|90|||0||`, assigned)
    ).resolves.toBeNull();
    await expect(
      authorizeDriverTelemetry(CAPTAIN, "drv_1", `T1|drv_1|24.7|46.6|40|90|||${now}||`, assigned, now)
    ).resolves.toMatchObject({ timestamp: now });
    await expect(
      authorizeDriverTelemetry(CAPTAIN, "drv_1", { ...frame, timestamp: 0 }, assigned, now)
    ).resolves.toBeNull();
  });

  it("applies the same checks to JSON-wrapped input and rejects deeper nesting", async () => {
    const zeroPacked = `T1|drv_1|24.7|46.6|40|90|||0||`;
    const freshPacked = `T1|drv_1|24.7|46.6|40|90|||${now}||`;

    // One JSON layer around a packed frame: still checked as supplied.
    await expect(
      authorizeDriverTelemetry(CAPTAIN, "drv_1", JSON.stringify(zeroPacked), assigned)
    ).resolves.toBeNull();
    await expect(
      authorizeDriverTelemetry(CAPTAIN, "drv_1", JSON.stringify(freshPacked), assigned, now)
    ).resolves.toMatchObject({ driverId: "drv_1", timestamp: now });

    // Deeper nesting and non-object JSON are rejected outright.
    for (const raw of [
      JSON.stringify(JSON.stringify(freshPacked)),
      JSON.stringify(JSON.stringify(frame)),
      JSON.stringify([frame]),
      JSON.stringify(42)
    ]) {
      await expect(authorizeDriverTelemetry(CAPTAIN, "drv_1", raw, assigned, now)).resolves.toBeNull();
    }
  });

  it("keeps the decoder defaults for omitted fields", async () => {
    const before = Date.now();
    const result = await authorizeDriverTelemetry(
      CAPTAIN,
      "drv_1",
      { driverId: "drv_1", lat: 24.71, lng: 46.67 },
      assigned
    );
    expect(result).toMatchObject({ driverId: "drv_1", speed: 0, heading: 0 });
    expect(result?.timestamp).toBeGreaterThanOrEqual(before);

    await expect(
      authorizeDriverTelemetry(CAPTAIN, "drv_1", `T1|drv_1|24.7|46.6|||||||`, assigned)
    ).resolves.toMatchObject({ speed: 0, heading: 0 });
  });

  it("accepts numeric strings and JSON-encoded frames the decoder supports", async () => {
    await expect(
      authorizeDriverTelemetry(CAPTAIN, "drv_1", { ...frame, speed: "40.5", lat: "24.71" }, assigned, now)
    ).resolves.toMatchObject({ speed: 40.5, lat: 24.71 });
    await expect(
      authorizeDriverTelemetry(CAPTAIN, "drv_1", JSON.stringify(frame), assigned, now)
    ).resolves.toMatchObject({ driverId: "drv_1" });
    await expect(
      authorizeDriverTelemetry(CAPTAIN, "drv_1", JSON.stringify({ ...frame, speed: "fast" }), assigned, now)
    ).resolves.toBeNull();
  });

  it("removes an eventId the driver is not assigned to", async () => {
    const result = await authorizeDriverTelemetry(
      CAPTAIN,
      "drv_1",
      { ...frame, eventId: "evt_other" },
      assigned,
      now
    );
    expect(result).toMatchObject({ driverId: "drv_1" });
    expect(result?.eventId).toBeUndefined();
  });

  it("propagates a failed assignment lookup so the caller drops the frame", async () => {
    const failing = vi.fn(async () => {
      throw new Error("database unavailable");
    });
    await expect(
      authorizeDriverTelemetry(CAPTAIN, "drv_1", frame, failing, now)
    ).rejects.toThrow("database unavailable");
  });
});

describe("sanitizeUserLocation", () => {
  it("rebuilds the payload from the verified actor and drops client ids", () => {
    const location = sanitizeUserLocation(GUEST, {
      userId: "usr_lm",
      driverId: "drv_1",
      eventId: "evt_1",
      lat: 24.7,
      lng: 46.6
    });
    expect(location).toMatchObject({ userId: "usr_guest", lat: 24.7, lng: 46.6 });
    expect(location).not.toHaveProperty("driverId");
    expect(location).not.toHaveProperty("eventId");
  });

  it("rejects invalid coordinates", () => {
    expect(sanitizeUserLocation(GUEST, { lat: "24", lng: 46 })).toBeNull();
    expect(sanitizeUserLocation(GUEST, { lat: Number.NaN, lng: 46 })).toBeNull();
    expect(sanitizeUserLocation(GUEST, null)).toBeNull();
  });
});
