import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Leaflet needs a DOM; the registry only needs setLatLng/getLatLng, layer
 * groups and polylines, so a tiny stub stands in. The rAF clock is driven
 * manually so we can observe positions mid-glide.
 */
vi.mock("leaflet", () => {
  class LatLng {
    constructor(
      public lat: number,
      public lng: number
    ) {}
  }
  class Bounds {
    points: [number, number][] = [];
    extend(p: [number, number] | LatLng) {
      this.points.push(p instanceof LatLng ? [p.lat, p.lng] : p);
      return this;
    }
    isValid() {
      return this.points.length > 0;
    }
  }
  class Marker {
    private ll: LatLng;
    handlers: Record<string, () => void> = {};
    constructor(pos: [number, number]) {
      this.ll = new LatLng(pos[0], pos[1]);
    }
    setLatLng(p: [number, number]) {
      this.ll = new LatLng(p[0], p[1]);
      return this;
    }
    getLatLng() {
      return this.ll;
    }
    bindPopup() {
      return this;
    }
    getPopup() {
      return { setContent: () => undefined };
    }
    setIcon() {
      return this;
    }
    setZIndexOffset() {
      return this;
    }
    getElement() {
      return null;
    }
    on(name: string, fn: () => void) {
      this.handlers[name] = fn;
      return this;
    }
    addTo() {
      return this;
    }
  }
  class Polyline {
    latlngs: [number, number][] = [];
    setLatLngs(p: [number, number][]) {
      this.latlngs = p;
      return this;
    }
    addTo() {
      return this;
    }
  }
  class LayerGroup {
    addTo() {
      return this;
    }
    removeLayer() {
      return this;
    }
    clearLayers() {
      return this;
    }
    remove() {
      return this;
    }
  }
  return {
    default: {
      latLngBounds: () => new Bounds(),
      latLng: (a: number, b: number) => new LatLng(a, b),
      marker: (pos: [number, number]) => new Marker(pos),
      polyline: () => new Polyline(),
      layerGroup: () => new LayerGroup(),
      divIcon: (o: unknown) => o
    }
  };
});

import { MarkerRegistry } from "./MarkerRegistry";

const A: [number, number] = [24.9, 46.7];
const B: [number, number] = [24.8, 46.6];

let now = 0;
let queued: FrameRequestCallback[] = [];
const runFrames = (ms: number, step = 100) => {
  for (let t = 0; t < ms; t += step) {
    now += step;
    const batch = queued;
    queued = [];
    batch.forEach((cb) => cb(now));
  }
};

beforeEach(() => {
  now = 0;
  queued = [];
  vi.stubGlobal("performance", { now: () => now });
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    queued.push(cb);
    return queued.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
  vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
});

afterEach(() => vi.unstubAllGlobals());

const spec = (position: [number, number]) => [{ id: "driver:1", tone: "driver" as const, position, label: "Sultan", trail: true }];

describe("MarkerRegistry", () => {
  it("creates a marker in place on first sync (no glide from nowhere)", () => {
    const reg = new MarkerRegistry({} as never, 1000);
    reg.sync(spec(A));
    expect(reg.position("driver:1")).toEqual(A);
    expect(reg.telemetry("driver:1")?.moving).toBe(false);
  });

  it("glides between fixes and settles exactly on the target", () => {
    const reg = new MarkerRegistry({} as never, 1000);
    reg.sync(spec(A));
    now = 5000;
    reg.sync(spec(B));
    expect(reg.telemetry("driver:1")?.moving).toBe(true);

    runFrames(500);
    const mid = reg.position("driver:1")!;
    expect(mid[0]).toBeLessThan(A[0]);
    expect(mid[0]).toBeGreaterThan(B[0]);
    expect(mid[0]).toBeCloseTo((A[0] + B[0]) / 2, 3);

    runFrames(600);
    expect(reg.position("driver:1")).toEqual(B);
    expect(reg.telemetry("driver:1")?.moving).toBe(false);
    expect(queued.length).toBe(0); // loop stops when nothing is in flight
  });

  it("derives heading and speed from consecutive fixes", () => {
    const reg = new MarkerRegistry({} as never, 1000);
    reg.sync(spec(A));
    now = 600_000; // ~15 km in 10 min ≈ 90 km/h
    reg.sync(spec(B));
    runFrames(1100);
    const t = reg.telemetry("driver:1")!;
    expect(t.heading).toBeGreaterThan(200); // south-west
    expect(t.heading).toBeLessThan(230);
    expect(t.speedKmh).toBeGreaterThan(80);
    expect(t.speedKmh).toBeLessThan(100);
  });

  it("treats an implausible jump as unknown speed rather than a number", () => {
    const reg = new MarkerRegistry({} as never, 1000);
    reg.sync(spec(A));
    now = 2500; // ~15 km in 2.5 s: coarse demo waypoint, not a convoy
    reg.sync(spec(B));
    expect(reg.telemetry("driver:1")?.speedKmh).toBe(0);
  });

  it("retargets mid-flight from the interpolated position, not from the old fix", () => {
    const reg = new MarkerRegistry({} as never, 1000);
    reg.sync(spec(A));
    now = 1000;
    reg.sync(spec(B));
    runFrames(500);
    const mid = reg.position("driver:1")!;
    reg.sync(spec(A)); // turn around
    runFrames(100);
    const after = reg.position("driver:1")!;
    // Moved back toward A from the midpoint — no jump back to B first.
    expect(after[0]).toBeGreaterThan(mid[0]);
    expect(after[0]).toBeLessThan(A[0]);
  });

  it("settles at the latest fix after a hidden-tab gap instead of rubber-banding", () => {
    const reg = new MarkerRegistry({} as never, 1000);
    reg.sync(spec(A));
    now = 1000;
    reg.sync(spec(B));
    now += 60_000; // tab hidden for a minute; no frames ran
    runFrames(100);
    expect(reg.position("driver:1")).toEqual(B);
  });

  it("removes markers whose ids disappear and keeps the rest", () => {
    const reg = new MarkerRegistry({} as never, 1000);
    reg.sync([...spec(A), { id: "driver:2", tone: "driver", position: B, label: "Fahad" }]);
    expect(reg.has("driver:2")).toBe(true);
    reg.sync(spec(A));
    expect(reg.has("driver:2")).toBe(false);
    expect(reg.has("driver:1")).toBe(true);
  });
});
