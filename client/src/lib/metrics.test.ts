import { describe, expect, it } from "vitest";
import type { Driver, Guest, GuestJourney, Task } from "@shared/domain";
import {
  cumulativeByDay,
  deriveSeries,
  fleetUtilisation,
  guestFunnel,
  haversineMeters,
  ringOccupancy,
  slaSample,
  taskStatusByZone,
  windowDelta
} from "./metrics";

const now = new Date("2026-09-20T12:00:00Z");

describe("deriveSeries", () => {
  it("is deterministic, monotone and ends exactly at the target", () => {
    const a = deriveSeries("commission", 285400, 30, now);
    const b = deriveSeries("commission", 285400, 30, now);
    expect(a.points).toEqual(b.points);
    expect(a.points.at(-1)).toBe(285400);
    expect(a.source).toBe("derived");
    for (let i = 1; i < a.points.length; i++) expect(a.points[i]).toBeGreaterThanOrEqual(a.points[i - 1]);
    expect(a.dates[0]).toBe("2026-08-22");
    expect(a.dates.at(-1)).toBe("2026-09-20");
  });

  it("differs per key", () => {
    expect(deriveSeries("a", 100, 10, now).points).not.toEqual(deriveSeries("b", 100, 10, now).points);
  });
});

describe("cumulativeByDay / windowDelta", () => {
  it("accumulates dated amounts and carries earlier ones in", () => {
    const s = cumulativeByDay(
      [
        { date: "2026-08-01", amount: 10 },
        { date: "2026-09-19", amount: 5 },
        { date: "2026-09-20", amount: 7 }
      ],
      3,
      now
    );
    expect(s.points).toEqual([10, 15, 22]);
    expect(s.source).toBe("live");
  });

  it("computes a window delta from increments", () => {
    const points = [0, 1, 2, 3, 4, 5, 6, 7, 9, 11, 13, 15, 17, 19, 21];
    const s = { points, dates: points.map(() => ""), source: "live" as const };
    // last 7 increments = 14, previous 7 = 7 → +100%
    expect(windowDelta(s, 7)).toBe(100);
    expect(windowDelta({ ...s, points: points.slice(0, 5) }, 7)).toBeUndefined();
  });
});

const driver = (id: string, status: Driver["status"], lat?: number, lng?: number): Driver =>
  ({ id, userId: id, licenseNo: "x", zone: "CENTRAL_ZONE", status, currentLat: lat, currentLng: lng, user: { id, name: id, email: "", role: "DRIVER" } }) as unknown as Driver;

describe("fleetUtilisation", () => {
  it("counts active vs on-shift", () => {
    const f = fleetUtilisation([driver("a", "EN_ROUTE"), driver("b", "BUSY"), driver("c", "AVAILABLE"), driver("d", "OFFLINE")]);
    expect(f).toEqual({ total: 4, active: 2, idle: 1, offline: 1, percent: 66.7 });
    expect(fleetUtilisation([]).percent).toBe(0);
  });
});

describe("guestFunnel", () => {
  it("builds nested stage counts", () => {
    const guests = [
      { id: "g1", rsvpStatus: "INVITED" },
      { id: "g2", rsvpStatus: "CONFIRMED" },
      { id: "g3", rsvpStatus: "CONFIRMED" },
      { id: "g4", rsvpStatus: "ARRIVED" }
    ] as unknown as Guest[];
    const journeys = [
      { guestId: "g3", arrivalStatus: "LUGGAGE" },
      { guestId: "g2", arrivalStatus: "PRE_ARRIVAL" }
    ] as unknown as GuestJourney[];
    const f = guestFunnel(guests, journeys);
    expect(f.map((s) => s.count)).toEqual([4, 3, 2, 1, 1]);
    expect(f.every((s) => /[؀-ۿ]/.test(s.ar))).toBe(true);
  });
});

describe("tasks", () => {
  const tasks = [
    { id: "t1", driverId: "a", status: "COMPLETED" },
    { id: "t2", driverId: "a", status: "DELAYED" },
    { id: "t3", driverId: "b", status: "EN_ROUTE" },
    { id: "t4", driverId: null, status: "PENDING" }
  ] as unknown as Task[];
  const drivers = [driver("a", "BUSY"), { ...driver("b", "EN_ROUTE"), zone: "NORTH_ZONE" }];

  it("groups status counts by driver zone", () => {
    const rows = taskStatusByZone(tasks, drivers as Driver[]);
    expect(rows.map((r) => [r.zone, r.total])).toEqual([
      ["CENTRAL_ZONE", 2],
      ["NORTH_ZONE", 1],
      ["UNASSIGNED", 1]
    ]);
    expect(rows[0].COMPLETED).toBe(1);
    expect(rows[0].DELAYED).toBe(1);
  });

  it("measures SLA on terminal/delayed tasks only", () => {
    expect(slaSample(tasks)).toEqual({ total: 4, completed: 1, delayed: 1, onTimePercent: 50 });
    expect(slaSample([]).onTimePercent).toBe(100);
  });
});

describe("ringOccupancy", () => {
  it("places a driver in the innermost ring that contains it", () => {
    // KKIA royal terminal centre from CONCENTRIC_GEOFENCES
    const centre = { lat: 24.9576, lng: 46.6988 };
    const at = (m: number) => ({ lat: centre.lat + m / 111_320, lng: centre.lng });
    const near = at(100);
    const mid = at(1000);
    const far = at(20_000);
    expect(Math.round(haversineMeters(centre.lat, centre.lng, near.lat, near.lng))).toBe(100);
    const occ = ringOccupancy([
      driver("n", "EN_ROUTE", near.lat, near.lng),
      driver("m", "EN_ROUTE", mid.lat, mid.lng),
      driver("f", "EN_ROUTE", far.lat, far.lng),
      driver("x", "OFFLINE")
    ]);
    const kkia = occ.find((s) => s.siteId === "geo-kkia-royal")!;
    const byType = Object.fromEntries(kkia.rings.map((r) => [r.type, r.count]));
    expect(byType.CURBSIDE_GATE).toBe(1);
    expect(byType.STAGING_HOLD).toBe(1);
    expect(kkia.outside).toBe(1);
  });
});
