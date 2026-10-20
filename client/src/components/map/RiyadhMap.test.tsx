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

import fs from "node:fs";
import path from "node:path";
import { RiyadhMap, TrackingHud, filterDrivers, mapShellClassName, tileNoticeText } from "./RiyadhMap";

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

function mapStyleGroup(html: string) {
  const match = html.match(/<div role="group" aria-label="Map style"[^>]*>([\s\S]*?)<\/div>/);
  if (!match) throw new Error("missing map style group");
  return match[1];
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
    const html = render();
    expect(groupClass(html, "Map style")).not.toContain("hidden");
    expect(html).toMatch(/aria-pressed="false" aria-label="Tactical"/);
    expect(html).toMatch(/aria-pressed="true" aria-label="Satellite"/);
    expect(html).not.toContain("OpenStreetMap");
    expect(html).toContain("Geofences");
    expect(html).toContain("Fullscreen");
  });

  // SILA-INTAKE-002: Satellite by default, and only Satellite / Tactical.
  it("defaults to Satellite and offers exactly Satellite then Tactical", () => {
    const html = render();
    const labels = [...mapStyleGroup(html).matchAll(/aria-label="([^"]+)"/g)].map((m) => m[1]);
    expect(labels).toEqual(["Satellite", "Tactical"]);
    expect(html).not.toMatch(/aria-label="Street"/);
    expect(render({ defaultMode: "dark" })).toMatch(/aria-pressed="true" aria-label="Tactical"/);
  });

  it("never resurrects the retired street mode from a stale value", () => {
    const html = render({ defaultMode: "standard" as unknown as "satellite" });
    expect(html).toMatch(/aria-pressed="true" aria-label="Satellite"/);
    expect(mapStyleGroup(html).match(/<button/g)).toHaveLength(2);
  });

  it("shows no tile notice while tiles load normally", () => {
    expect(render()).not.toContain("data-map-tile-notice");
  });

  it("puts vehicle status, map style, tracking focus, recenter and fullscreen in the chrome, ahead of the stage", () => {
    const html = render({ selectedDriverId: "drv_1" });
    const stage = html.indexOf("map-stage");
    for (const marker of [
      'aria-label="Vehicle status"',
      'aria-label="Map style"',
      'aria-label="Tracking focus"',
      'aria-label="Recenter"',
      "Fullscreen",
      'data-map-hud="tracking"'
    ]) {
      const at = html.indexOf(marker);
      expect(at, marker).toBeGreaterThan(-1);
      expect(at, marker).toBeLessThan(stage);
    }
    // The tracked convoy is preselected in the focus control.
    expect(html).toMatch(/<option value="drv_1" selected="">Synthetic Captain<\/option>/);
  });

  it("shows the tracking HUD for the selected convoy, disabled until the map is live", () => {
    const html = render({ selectedDriverId: "drv_1" });
    expect(html).toContain('data-map-hud="tracking"');
    expect(html).toContain("Synthetic Captain");
    expect(html).not.toMatch(/class="map-hud [^"]*\babsolute\b/);
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
    expect(html).toMatch(/aria-pressed="true" aria-label="قمر صناعي"/);
    expect(html).toContain('aria-label="تكتيكي"');
    expect(html).not.toContain("خريطة الشوارع");
    expect(html).toMatch(/data-map-hud="tracking" dir="rtl"/);
    expect(html).toContain('aria-label="إعادة التمركز على القافلة"');
    expect(html).toContain('aria-label="تركيز التتبع"');
    expect(html).toContain('aria-label="حالة المركبات"');
  });
});

describe("tileNoticeText", () => {
  it("says honestly that tactical fell back to satellite imagery", () => {
    expect(tileNoticeText("fallback", false)).toBe("Tactical tiles are unavailable; showing satellite imagery instead");
    expect(tileNoticeText("fallback", true)).toContain("صور القمر الصناعي");
    expect(tileNoticeText("degraded", false)).toContain("Some tiles are unavailable");
    expect(tileNoticeText(null, false)).toBeNull();
    for (const text of [tileNoticeText("fallback", false), tileNoticeText("fallback", true)]) {
      expect(text).not.toMatch(/street|الشوارع/i);
    }
  });
});

describe("War Room map", () => {
  it("no longer forces the Tactical style over the Satellite default", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "client/src/components/warroom/SovereignCommandBridge.tsx"),
      "utf8"
    );
    expect(source).toContain("<RiyadhMap");
    expect(source).not.toMatch(/defaultMode=/);
  });
});

describe("filterDrivers", () => {
  const at = (id: string, status: Driver["status"], lat: number, lng: number, zone = "") =>
    ({ ...driver, id, status, currentLat: lat, currentLng: lng, zone }) as unknown as Driver;
  const fleet = [
    at("north", "AVAILABLE", 24.9, 46.7),
    at("central", "EN_ROUTE", 24.75, 46.7),
    at("west", "OFFLINE", 24.6, 46.5, "DIRIYAH")
  ];

  it("combines the zone and vehicle-status filters", () => {
    expect(filterDrivers(fleet, "ALL", "ALL").map((d) => d.id)).toEqual(["north", "central", "west"]);
    expect(filterDrivers(fleet, "ALL", "EN_ROUTE").map((d) => d.id)).toEqual(["central"]);
    expect(filterDrivers(fleet, "NORTH", "ALL").map((d) => d.id)).toEqual(["north"]);
    expect(filterDrivers(fleet, "WEST", "OFFLINE").map((d) => d.id)).toEqual(["west"]);
    expect(filterDrivers(fleet, "NORTH", "OFFLINE")).toEqual([]);
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
