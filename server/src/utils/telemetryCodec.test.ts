import { describe, expect, it } from "vitest";
import {
  encodeTelemetryFrame,
  decodeTelemetryFrame,
  isPackedFrame,
  calculateDistanceMeters,
  shouldEmitTelemetry,
  type TelemetryFrame
} from "./telemetryCodec.js";

describe("Compact Telemetry Codec", () => {
  const sampleFrame: TelemetryFrame = {
    driverId: "drv-vip-001",
    lat: 24.957612,
    lng: 46.698834,
    speed: 85.4,
    heading: 182,
    altitude: 612,
    accuracy: 3,
    timestamp: 1741223456789,
    status: "EN_ROUTE",
    eventId: "evt-fii-2027",
    batteryLevel: 94
  };

  it("encodes and decodes a packed frame with high fidelity", () => {
    const encoded = encodeTelemetryFrame(sampleFrame);
    expect(isPackedFrame(encoded)).toBe(true);
    expect(encoded.startsWith("T1|drv-vip-001|24.957612|46.698834|85.4|182")).toBe(true);

    const decoded = decodeTelemetryFrame(encoded);
    expect(decoded).not.toBeNull();
    expect(decoded?.driverId).toBe(sampleFrame.driverId);
    expect(decoded?.lat).toBeCloseTo(sampleFrame.lat, 5);
    expect(decoded?.lng).toBeCloseTo(sampleFrame.lng, 5);
    expect(decoded?.speed).toBe(85.4);
    expect(decoded?.heading).toBe(182);
    expect(decoded?.altitude).toBe(612);
    expect(decoded?.accuracy).toBe(3);
    expect(decoded?.timestamp).toBe(sampleFrame.timestamp);
    expect(decoded?.status).toBe("EN_ROUTE");
    expect(decoded?.eventId).toBe("evt-fii-2027");
    expect(decoded?.batteryLevel).toBe(94);
  });

  it("decodes legacy JSON objects transparently", () => {
    const legacyObj = {
      driverId: "drv-888",
      lat: 24.7136,
      lng: 46.6753,
      speed: 40,
      heading: 90,
      timestamp: "2026-09-06T01:00:00.000Z"
    };

    const decoded = decodeTelemetryFrame(legacyObj);
    expect(decoded).not.toBeNull();
    expect(decoded?.driverId).toBe("drv-888");
    expect(decoded?.lat).toBe(24.7136);
    expect(decoded?.lng).toBe(46.6753);
    expect(decoded?.speed).toBe(40);
  });

  it("calculates haversine distance accurately", () => {
    // Distance from KKIA T2 (24.9576, 46.6988) to KAFD (24.7642, 46.6406) is approx 22.3 km
    const dist = calculateDistanceMeters(24.9576, 46.6988, 24.7642, 46.6406);
    expect(dist).toBeGreaterThan(21000);
    expect(dist).toBeLessThan(23000);
  });

  it("applies deadband filtering correctly", () => {
    const base: TelemetryFrame = {
      driverId: "drv-1",
      lat: 24.700000,
      lng: 46.700000,
      speed: 0,
      heading: 0,
      timestamp: 1000000,
      status: "AVAILABLE"
    };

    // Sub-meter shift (stationary jitter) -> should NOT emit
    const tinyShift: TelemetryFrame = {
      ...base,
      lat: 24.700001, // ~0.1 meter
      timestamp: 1001000
    };
    expect(shouldEmitTelemetry(base, tinyShift)).toBe(false);

    // Significant shift (> 10m) -> SHOULD emit
    const bigShift: TelemetryFrame = {
      ...base,
      lat: 24.700200, // ~22 meters
      timestamp: 1002000
    };
    expect(shouldEmitTelemetry(base, bigShift)).toBe(true);

    // Status change -> SHOULD emit immediately
    const statusChange: TelemetryFrame = {
      ...base,
      status: "EN_ROUTE"
    };
    expect(shouldEmitTelemetry(base, statusChange)).toBe(true);

    // Heartbeat timeout (> 6s) -> SHOULD emit periodic state sync
    const heartbeat: TelemetryFrame = {
      ...base,
      timestamp: 1007000 // 7s later
    };
    expect(shouldEmitTelemetry(base, heartbeat)).toBe(true);
  });
});
