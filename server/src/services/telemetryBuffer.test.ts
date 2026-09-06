import { beforeEach, describe, expect, it } from "vitest";
import { telemetryBuffer } from "./telemetryBuffer.js";

describe("TelemetryBufferService", () => {
  beforeEach(() => {
    telemetryBuffer.clear();
  });

  it("ingests packed telemetry and manages buffer state", () => {
    const rawPacked = "T1|drv-101|24.713600|46.675300|65|90|||1741223456789|EN_ROUTE|evt-1|95";
    const res = telemetryBuffer.ingest(rawPacked);

    expect(res).not.toBeNull();
    expect(res?.frame.driverId).toBe("drv-101");
    expect(res?.shouldBroadcast).toBe(true);
    expect(res?.frame.speed).toBe(65);

    const cached = telemetryBuffer.getDriver("drv-101");
    expect(cached).not.toBeNull();
    expect(cached?.lat).toBe(24.7136);
    expect(cached?.dirty).toBe(true);
  });

  it("filters stationary jitter without redundant broadcast", () => {
    // 1st ping: new driver -> broadcast
    const ping1 = "T1|drv-202|24.700000|46.700000|0|0|||1000000|AVAILABLE|evt-1|100";
    const res1 = telemetryBuffer.ingest(ping1);
    expect(res1?.shouldBroadcast).toBe(true);

    // 2nd ping 1 second later with 0.1m difference -> deadband should suppress broadcast
    const ping2 = "T1|drv-202|24.700001|46.700000|0|0|||1001000|AVAILABLE|evt-1|100";
    const res2 = telemetryBuffer.ingest(ping2);
    expect(res2?.shouldBroadcast).toBe(false);
    expect(res2?.isHeartbeat).toBe(true);
  });

  it("accurately performs in-memory proximity searches", () => {
    // KAFD center: 24.7642, 46.6406
    // Near driver (approx 300m away): 24.7660, 46.6410
    // Far driver in Diriyah (approx 12km away): 24.7333, 46.5744
    telemetryBuffer.ingest("T1|drv-near|24.766000|46.641000|20|180|||1000000|AVAILABLE|evt-kafd|90");
    telemetryBuffer.ingest("T1|drv-far|24.733300|46.574400|50|270|||1000000|AVAILABLE|evt-kafd|80");

    // Search 2km radius around KAFD
    const nearby = telemetryBuffer.findDriversWithinRadius(24.7642, 46.6406, 2000);
    expect(nearby.length).toBe(1);
    expect(nearby[0].driver.driverId).toBe("drv-near");
    expect(nearby[0].distanceMeters).toBeLessThan(500);

    // Search 15km radius -> both found, sorted nearest first
    const all = telemetryBuffer.findDriversWithinRadius(24.7642, 46.6406, 15000);
    expect(all.length).toBe(2);
    expect(all[0].driver.driverId).toBe("drv-near");
    expect(all[1].driver.driverId).toBe("drv-far");
  });

  it("reports buffer operational statistics", () => {
    telemetryBuffer.ingest("T1|drv-a|24.700000|46.700000|0|0|||1000000|AVAILABLE|evt-1|100");
    telemetryBuffer.ingest("T1|drv-b|24.710000|46.710000|0|0|||1000000|AVAILABLE|evt-1|100");

    const stats = telemetryBuffer.getStats();
    expect(stats.activeDriversCount).toBe(2);
    expect(stats.totalIngestedFrames).toBe(2);
    expect(stats.totalEmittedFrames).toBe(2);
    expect(stats.dirtyCount).toBe(2);
    expect(stats.mode).toBe("IN_MEMORY");
  });
});
