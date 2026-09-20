import { describe, expect, it } from "vitest";
import { bearing, distanceMeters, easeInOut, lerpAngle, lerpLatLng, samePoint } from "./geometry";

const KKIA: [number, number] = [24.9576, 46.6988];
const RITZ: [number, number] = [24.6661, 46.6302];

describe("map geometry", () => {
  it("measures KKIA → Ritz-Carlton at roughly 33 km", () => {
    const d = distanceMeters(KKIA, RITZ);
    expect(d).toBeGreaterThan(32_000);
    expect(d).toBeLessThan(34_000);
  });

  it("bearing points north/east/south/west on the compass", () => {
    const o: [number, number] = [24.7, 46.7];
    expect(bearing(o, [24.8, 46.7])).toBeCloseTo(0, 0);
    expect(bearing(o, [24.7, 46.8])).toBeCloseTo(90, 0);
    expect(bearing(o, [24.6, 46.7])).toBeCloseTo(180, 0);
    expect(bearing(o, [24.7, 46.6])).toBeCloseTo(270, 0);
  });

  it("a southbound convoy from the airport heads roughly SSW", () => {
    const b = bearing(KKIA, RITZ);
    expect(b).toBeGreaterThan(185);
    expect(b).toBeLessThan(200);
  });

  it("lerp is exact at the endpoints and midway", () => {
    expect(lerpLatLng(KKIA, RITZ, 0)).toEqual(KKIA);
    expect(lerpLatLng(KKIA, RITZ, 1)).toEqual(RITZ);
    const mid = lerpLatLng(KKIA, RITZ, 0.5);
    expect(mid[0]).toBeCloseTo((KKIA[0] + RITZ[0]) / 2, 8);
    expect(mid[1]).toBeCloseTo((KKIA[1] + RITZ[1]) / 2, 8);
  });

  it("easeInOut is monotonic and symmetric", () => {
    let prev = -1;
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const v = easeInOut(t);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 8);
  });

  it("lerpAngle turns the short way across north", () => {
    // 350° → 10° should pass through 0°, not 180°.
    expect(lerpAngle(350, 10, 0.5)).toBeCloseTo(0, 6);
    expect(lerpAngle(10, 350, 0.5)).toBeCloseTo(0, 6);
    expect(lerpAngle(90, 270, 1)).toBeCloseTo(270, 6);
  });

  it("samePoint tolerates sub-centimetre noise only", () => {
    expect(samePoint(KKIA, [KKIA[0] + 1e-9, KKIA[1]])).toBe(true);
    expect(samePoint(KKIA, [KKIA[0] + 1e-4, KKIA[1]])).toBe(false);
  });
});
