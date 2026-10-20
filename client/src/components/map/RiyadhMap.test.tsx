import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Driver } from "@shared/domain";

const i18nState = vi.hoisted(() => ({ language: "en" }));

// Translation is not initialised in tests; the language is switched per case.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: i18nState })
}));

// Leaflet needs a DOM; react-dom/server never runs effects, so no map is created.
vi.mock("leaflet", () => ({ default: {} }));

vi.mock("motion/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("motion/react")>()),
  useReducedMotion: () => false
}));

import { RiyadhMap, TrackingHud, mapShellClassName } from "./RiyadhMap";

/**
 * FULL-OVERHAUL-M1: the radar chrome and tracking HUD render outside
 * Leaflet's canvas, in their own layers, and before the map exists. No DOM
 * test environment exists here, so markup is rendered with react-dom/server
 * (the pre-map "loading" frame). Real zoom/fullscreen behaviour is left to
 * the browser check.
 */

const driver = {
  id: "drv_1",
  status: "EN_ROUTE",
  currentLat: 24.75,
  currentLng: 46.65,
  user: { id: "usr_drv_1", name: "Synthetic Captain" }
} as unknown as Driver;

function render(props: Partial<Parameters<typeof RiyadhMap>[0]> = {}) {
  return renderToStaticMarkup(<RiyadhMap drivers={[driver]} tasks={[]} {...props} />);
}

function groupClass(html: string, label: string) {
  const match = html.match(new RegExp(`<div role="group" aria-label="${label}" class="([^"]*)"`));
  if (!match) throw new Error(`missing group ${label}`);
  return match[1].split(/\s+/);
}

afterEach(() => {
  i18nState.language = "en";
});

describe("RiyadhMap radar chrome", () => {
  it("keeps the chrome as its own layer ahead of the map stage", () => {
    const html = render();
    expect(html).toContain("map-shell");
    const chrome = html.indexOf("map-chrome");
    const stage = html.indexOf("map-stage");
    expect(chrome).toBeGreaterThan(-1);
    expect(stage).toBeGreaterThan(chrome);
    // The zone filter used to be `hidden md:flex` and vanished under browser zoom.
    expect(html).not.toMatch(/class="[^"]*\bhidden md:flex/);
  });

  it("renders the zone filter at every viewport width (browser zoom)", () => {
    const html = render();
    const classes = groupClass(html, "Filter by zone");
    expect(classes).not.toContain("hidden");
    expect(classes).toContain("flex");
    expect(classes).toContain("flex-wrap");
    for (const zone of ["All Corridors", "North / KKIA", "KAFD Plenary", "Diriyah / DQ"]) {
      expect(html).toContain(zone);
    }
  });

  it("keeps the map style options named even when labels collapse to icons", () => {
    const html = render({ defaultMode: "satellite" });
    expect(groupClass(html, "Map style")).not.toContain("hidden");
    expect(html).toMatch(/aria-pressed="false" aria-label="Tactical"/);
    expect(html).toMatch(/aria-pressed="true" aria-label="Satellite"/);
    expect(html).toMatch(/aria-pressed="false" aria-label="Standard"/);
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("Geofences");
    expect(html).toContain("Fullscreen");
  });

  it("shows the tracking HUD for the selected convoy, disabled until the map is live", () => {
    const html = render({ selectedDriverId: "drv_1" });
    expect(html).toContain('data-map-hud="tracking"');
    expect(html).toContain("Synthetic Captain");
    expect(html).toMatch(/class="map-hud [^"]*\bright-3\b/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-label="Re-center on convoy"/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-label="Stop tracking and show all"/);
  });

  it("omits the tracking HUD when nothing is tracked", () => {
    expect(render()).not.toContain('data-map-hud="tracking"');
    expect(render({ selectedDriverId: "drv_missing" })).not.toContain('data-map-hud="tracking"');
  });

  it("mirrors the chrome and HUD for Arabic (zoom control moves to the right)", () => {
    i18nState.language = "ar";
    const html = render({ selectedDriverId: "drv_1" });
    expect(groupClass(html, "تصفية حسب المنطقة")).not.toContain("hidden");
    expect(groupClass(html, "نمط الخريطة")).not.toContain("hidden");
    expect(html).toContain("كافة المسارات");
    expect(html).toMatch(/class="map-hud [^"]*\bleft-3\b/);
    expect(html).not.toMatch(/class="map-hud [^"]*\bright-3\b/);
    expect(html).toContain('aria-label="إعادة التمركز على القافلة"');
  });
});

describe("mapShellClassName", () => {
  it("scopes Leaflet's layers in both normal and fullscreen", () => {
    const normal = mapShellClassName(false, "flex-1").split(/\s+/);
    const full = mapShellClassName(true, "flex-1").split(/\s+/);
    for (const classes of [normal, full]) {
      expect(classes).toContain("map-shell");
      expect(classes).toContain("overflow-hidden");
    }
    expect(normal).toContain("flex-1");
    expect(normal).not.toContain("fixed");
    expect(full).toEqual(expect.arrayContaining(["fixed", "inset-0", "z-map-full"]));
    expect(full).not.toContain("flex-1");
  });
});

describe("TrackingHud", () => {
  it("enables re-center and release once the map is live", () => {
    const html = renderToStaticMarkup(
      <TrackingHud
        driver={driver}
        isArabic={false}
        ready
        l={(value) => String(value ?? "")}
        onRecenter={() => {}}
        onRelease={() => {}}
      />
    );
    expect(html).toContain('role="status"');
    expect(html).not.toContain('disabled=""');
    expect(html).toContain('aria-label="Re-center on convoy"');
  });
});
