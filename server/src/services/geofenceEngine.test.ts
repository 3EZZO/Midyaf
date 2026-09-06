import { describe, it, expect, beforeEach } from "vitest";
import { GeofenceEngine } from "./geofenceEngine.js";
import type { ConcentricGeofence } from "../../../shared/domain.js";

const TEST_GEOFENCE: ConcentricGeofence = {
  id: "test-kkia-royal",
  code: "KKIA_ROYAL_T5",
  nameEn: "KKIA Royal Terminal",
  nameAr: "الصالة الملكية بمطار الملك خالد",
  category: "AIRPORT",
  centerLat: 24.9576,
  centerLng: 46.6988,
  rings: [
    {
      ring: "OUTER_APPROACH",
      radiusMeters: 5000,
      labelEn: "Outer Approach",
      labelAr: "الممر الخارجي",
      autoAction: "PRE_STAGING_ALERT"
    },
    {
      ring: "STAGING_HOLD",
      radiusMeters: 1500,
      labelEn: "Staging Depot",
      labelAr: "منطقة الاصطفاف",
      autoAction: "DISPATCH_STAGING_ORDER"
    },
    {
      ring: "CURBSIDE_GATE",
      radiusMeters: 300,
      labelEn: "Curbside Gate",
      labelAr: "رصيف الاستقبال",
      autoAction: "VIP_CURBSIDE_ALERT"
    },
    {
      ring: "DOCKED_BAY",
      radiusMeters: 50,
      labelEn: "Docked Bay",
      labelAr: "موقف المراسم",
      autoAction: "AUTO_ARRIVE_TASK"
    }
  ]
};

describe("GeofenceEngine", () => {
  let engine: GeofenceEngine;

  beforeEach(() => {
    engine = new GeofenceEngine([TEST_GEOFENCE]);
  });

  it("should classify rings correctly based on distance", () => {
    const rings = TEST_GEOFENCE.rings;

    expect(engine.classifyRing(25, "OUTSIDE", rings)).toBe("DOCKED_BAY");
    expect(engine.classifyRing(200, "OUTSIDE", rings)).toBe("CURBSIDE_GATE");
    expect(engine.classifyRing(1000, "OUTSIDE", rings)).toBe("STAGING_HOLD");
    expect(engine.classifyRing(4000, "OUTSIDE", rings)).toBe("OUTER_APPROACH");
    expect(engine.classifyRing(6000, "OUTSIDE", rings)).toBe("OUTSIDE");
  });

  it("should enforce hysteresis on outward transitions to prevent edge flapping", () => {
    const rings = TEST_GEOFENCE.rings;

    // Driver is inside CURBSIDE_GATE (radius 300m)
    // Distance moves to 310m (within 15m hysteresis buffer: 300 + 15 = 315m)
    // Should remain CURBSIDE_GATE
    expect(engine.classifyRing(310, "CURBSIDE_GATE", rings)).toBe("CURBSIDE_GATE");

    // Distance moves to 316m (exceeds 300 + 15m)
    // Should now transition out to STAGING_HOLD
    expect(engine.classifyRing(316, "CURBSIDE_GATE", rings)).toBe("STAGING_HOLD");
  });

  it("should evaluate telemetry and emit transition events when crossing rings", () => {
    const driverId = "driver-sultan";

    // Step 1: Telemetry far outside (8km away)
    let events = engine.evaluateTelemetry({
      driverId,
      lat: 24.9576 + 0.08,
      lng: 46.6988,
      driverName: "Capt. Sultan"
    });
    expect(events.length).toBe(0);

    // Step 2: Telemetry enters OUTER_APPROACH (~4km away)
    events = engine.evaluateTelemetry({
      driverId,
      lat: 24.9576 + 0.035,
      lng: 46.6988,
      driverName: "Capt. Sultan"
    });
    expect(events.length).toBe(1);
    expect(events[0].currentRing).toBe("OUTER_APPROACH");
    expect(events[0].previousRing).toBe("OUTSIDE");
    expect(events[0].direction).toBe("APPROACHING");
    expect(events[0].automatedActionsTaken).toContain("PRE_STAGING_ALERT");

    // Step 3: Telemetry enters CURBSIDE_GATE (~200m away)
    events = engine.evaluateTelemetry({
      driverId,
      lat: 24.9576 + 0.0018,
      lng: 46.6988,
      driverName: "Capt. Sultan"
    });
    expect(events.length).toBe(1);
    expect(events[0].currentRing).toBe("CURBSIDE_GATE");
    expect(events[0].automatedActionsTaken).toContain("VIP_CURBSIDE_ALERT");
    expect(events[0].automatedActionsTaken).toContain("VIP_GUEST_CURBSIDE_NOTIFIED");

    // Step 4: Telemetry docks at bay (~20m away)
    events = engine.evaluateTelemetry({
      driverId,
      lat: 24.9576 + 0.0001,
      lng: 46.6988,
      driverName: "Capt. Sultan"
    });
    expect(events.length).toBe(1);
    expect(events[0].currentRing).toBe("DOCKED_BAY");
    expect(events[0].automatedActionsTaken).toContain("AUTO_ARRIVE_TASK");
    expect(events[0].automatedActionsTaken).toContain("ZERO_TOUCH_HANDSHAKE_CONFIRMED");
  });

  it("should report active vehicle counts per ring and per geofence", () => {
    // Driver 1 in Curbside Gate
    engine.evaluateTelemetry({
      driverId: "driver-1",
      lat: 24.9576 + 0.0015,
      lng: 46.6988
    });

    // Driver 2 in Staging Hold
    engine.evaluateTelemetry({
      driverId: "driver-2",
      lat: 24.9576 + 0.008,
      lng: 46.6988
    });

    const geofences = engine.getGeofences();
    expect(geofences.length).toBe(1);
    expect(geofences[0].activeVehiclesCount).toBe(2);
    expect(geofences[0].ringCounts.CURBSIDE_GATE).toBe(1);
    expect(geofences[0].ringCounts.STAGING_HOLD).toBe(1);
    expect(geofences[0].ringCounts.DOCKED_BAY).toBe(0);
  });

  it("should simulate a full handshake sequence for verification", () => {
    const events = engine.simulateHandshakeSequence("driver-test", "KKIA_ROYAL_T5");
    expect(events.length).toBe(4);
    expect(events[0].currentRing).toBe("OUTER_APPROACH");
    expect(events[1].currentRing).toBe("STAGING_HOLD");
    expect(events[2].currentRing).toBe("CURBSIDE_GATE");
    expect(events[3].currentRing).toBe("DOCKED_BAY");
  });
});
