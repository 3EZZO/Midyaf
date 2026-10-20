import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Leaflet needs a DOM at import time; these helpers only use it for types.
vi.mock("leaflet", () => ({ default: {} }));

import { createMapController } from "./MapController";
import { focusWithoutScroll, observeContainerSize, pinScrollOrigin } from "./useLeafletMap";

/**
 * FULL-OVERHAUL-M1: the radar chrome (zone filter, map style, geofences,
 * fullscreen) and the tracking HUD must survive zooming. Leaflet focuses its
 * container on mousedown, which scrolled the clipped map wrapper and pushed
 * the chrome out of view; Leaflet's z-index also leaked out of the map.
 */

type Listener = () => void;

function fakeScrollBox() {
  const listeners = new Map<string, Set<Listener>>();
  return {
    scrollTop: 0,
    scrollLeft: 0,
    addEventListener(name: string, fn: Listener) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name)!.add(fn);
    },
    removeEventListener(name: string, fn: Listener) {
      listeners.get(name)?.delete(fn);
    },
    fire(name: string) {
      listeners.get(name)?.forEach((fn) => fn());
    },
    count(name: string) {
      return listeners.get(name)?.size ?? 0;
    }
  };
}

describe("pinScrollOrigin", () => {
  it("snaps a focus-scrolled wrapper back so the chrome stays in view", () => {
    const box = fakeScrollBox();
    const unpin = pinScrollOrigin(box as unknown as HTMLElement);

    box.scrollTop = 54; // what Leaflet's container focus did to the wrapper
    box.scrollLeft = 12;
    box.fire("scroll");
    expect(box.scrollTop).toBe(0);
    expect(box.scrollLeft).toBe(0);

    unpin();
    expect(box.count("scroll")).toBe(0);
    box.scrollTop = 30;
    box.fire("scroll");
    expect(box.scrollTop).toBe(30);
  });
});

describe("focusWithoutScroll", () => {
  it("forces preventScroll on Leaflet's programmatic focus and restores the original", () => {
    const original = vi.fn();
    const el = { focus: original as (options?: FocusOptions) => void };
    const restore = focusWithoutScroll(el);

    el.focus();
    el.focus({ preventScroll: false });
    expect(original).toHaveBeenNthCalledWith(1, { preventScroll: true });
    expect(original).toHaveBeenNthCalledWith(2, { preventScroll: true });

    restore();
    expect(el.focus).toBe(original);
  });
});

describe("observeContainerSize", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is a safe no-op without ResizeObserver", () => {
    vi.stubGlobal("ResizeObserver", undefined);
    const onResize = vi.fn();
    const stop = observeContainerSize({} as Element, onResize);
    expect(onResize).not.toHaveBeenCalled();
    expect(() => stop()).not.toThrow();
  });

  it("re-measures the map when its box changes and disconnects on cleanup", () => {
    const instances: { callback: () => void; observed: unknown[]; disconnect: ReturnType<typeof vi.fn> }[] = [];
    class FakeResizeObserver {
      observed: unknown[] = [];
      disconnect = vi.fn();
      constructor(public callback: () => void) {
        instances.push(this);
      }
      observe(el: unknown) {
        this.observed.push(el);
      }
    }
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    const el = {} as Element;
    const onResize = vi.fn();
    const stop = observeContainerSize(el, onResize);

    expect(instances).toHaveLength(1);
    expect(instances[0].observed).toEqual([el]);
    instances[0].callback();
    expect(onResize).toHaveBeenCalledTimes(1);

    stop();
    expect(instances[0].disconnect).toHaveBeenCalledTimes(1);
  });
});

describe("createMapController tracking focus", () => {
  function setup() {
    const bounds = {
      extend: () => bounds,
      isValid: () => true,
      pad: () => bounds
    };
    const map = { setView: vi.fn(), flyTo: vi.fn(), fitBounds: vi.fn(), flyToBounds: vi.fn() };
    const markers = {
      position: (id: string) => (id === "driver:drv_1" ? ([24.7, 46.6] as [number, number]) : undefined),
      setSelected: vi.fn(),
      bounds: () => bounds
    };
    const corridors = { allBounds: () => bounds };
    const onFocusChange = vi.fn();
    const controller = createMapController({
      map: map as never,
      markers: markers as never,
      geofences: {} as never,
      corridors: corridors as never,
      reducedMotion: true,
      onFocusChange
    });
    return { controller, map, markers, onFocusChange };
  }

  it("reports the tracked convoy when the camera focuses it", () => {
    const { controller, map, markers, onFocusChange } = setup();
    expect(controller.focusConvoy("driver:drv_1")).toBe(true);
    expect(map.setView).toHaveBeenCalledWith([24.7, 46.6], expect.any(Number), { animate: false });
    expect(markers.setSelected).toHaveBeenCalledWith("driver:drv_1");
    expect(onFocusChange).toHaveBeenCalledWith("driver:drv_1");
  });

  it("does not claim tracking for an unknown convoy", () => {
    const { controller, onFocusChange } = setup();
    expect(controller.focusConvoy("driver:missing")).toBe(false);
    expect(onFocusChange).not.toHaveBeenCalled();
  });

  it("clears tracking on overview", () => {
    const { controller, markers, onFocusChange } = setup();
    controller.overview();
    expect(markers.setSelected).toHaveBeenCalledWith(null);
    expect(onFocusChange).toHaveBeenCalledWith(null);
  });
});

describe("map.css layering", () => {
  const css = fs.readFileSync(path.join(process.cwd(), "client/src/components/map/map.css"), "utf8");
  const rule = (selector: string) => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`));
    if (!match) throw new Error(`missing rule ${selector}`);
    return match[1];
  };
  const zIndex = (body: string) => Number(body.match(/z-index:\s*(\d+)/)?.[1]);

  it("scopes Leaflet's z-index to the map shell and stage", () => {
    expect(rule(".map-shell")).toMatch(/isolation:\s*isolate/);
    expect(rule(".map-stage")).toMatch(/isolation:\s*isolate/);
    expect(rule(".map-stage")).toMatch(/position:\s*relative/);
  });

  it("paints the chrome above the stage and keeps it from being squeezed", () => {
    const chrome = rule(".map-chrome");
    expect(chrome).toMatch(/position:\s*relative/);
    expect(chrome).toMatch(/flex-shrink:\s*0/);
    expect(zIndex(chrome)).toBeGreaterThan(zIndex(rule(".map-stage")));
  });

  it("puts the HUD above Leaflet controls (1000) without inflating global z-index", () => {
    expect(zIndex(rule(".map-hud"))).toBeGreaterThan(1000);
    const all = [...css.matchAll(/z-index:\s*(\d+)/g)].map((m) => Number(m[1]));
    expect(Math.max(...all)).toBeLessThanOrEqual(1001);
  });
});
