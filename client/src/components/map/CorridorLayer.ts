import L from "leaflet";
import { SUMMIT_CORRIDORS, type CorridorCode, type CorridorState } from "@shared/constants";

/**
 * The three sovereign corridors: a soft glow underlay plus a dashed core
 * line. `setState()` re-styles a corridor in place for the Act 4 sandstorm
 * beat (`closed` → danger, `reroute` → warn) without redrawing.
 */

const STATE_STYLE: Record<CorridorState, (base: string) => { glow: L.PolylineOptions; core: L.PolylineOptions }> = {
  normal: (color) => ({
    glow: { color, weight: 8, opacity: 0.22 },
    core: { color, weight: 2.5, opacity: 0.85, dashArray: "6 8" }
  }),
  closed: () => ({
    glow: { color: "#FB7185", weight: 10, opacity: 0.18 },
    core: { color: "#FB7185", weight: 3, opacity: 0.9, dashArray: "2 6" }
  }),
  reroute: () => ({
    glow: { color: "#FBBF24", weight: 10, opacity: 0.28 },
    core: { color: "#FBBF24", weight: 3, opacity: 0.95, dashArray: "10 6" }
  })
};

type Entry = { glow: L.Polyline; core: L.Polyline; state: CorridorState; color: string };

export class CorridorLayer {
  private readonly layer = L.layerGroup();
  private readonly entries = new Map<CorridorCode, Entry>();
  private isArabic: boolean;

  constructor(map: L.Map, isArabic: boolean) {
    this.isArabic = isArabic;
    for (const corridor of SUMMIT_CORRIDORS) {
      const style = STATE_STYLE.normal(corridor.color);
      const glow = L.polyline(corridor.points, { ...style.glow, interactive: false, className: "corridor corridor-glow" });
      const core = L.polyline(corridor.points, { ...style.core, className: "corridor corridor-core" });
      core.bindTooltip(isArabic ? corridor.nameAr : corridor.nameEn, { direction: "center", className: "map-tooltip" });
      glow.addTo(this.layer);
      core.addTo(this.layer);
      this.entries.set(corridor.code, { glow, core, state: "normal", color: corridor.color });
    }
    this.layer.addTo(map);
  }

  setState(code: CorridorCode, state: CorridorState) {
    const entry = this.entries.get(code);
    if (!entry || entry.state === state) return;
    entry.state = state;
    const style = STATE_STYLE[state](entry.color);
    entry.glow.setStyle(style.glow);
    entry.core.setStyle(style.core);
    const el = entry.core.getElement() as SVGElement | null | undefined;
    el?.setAttribute("data-state", state);
    if (state !== "normal") entry.core.bringToFront();
  }

  getState(code: CorridorCode): CorridorState {
    return this.entries.get(code)?.state ?? "normal";
  }

  bounds(code: CorridorCode): L.LatLngBounds | undefined {
    return this.entries.get(code)?.core.getBounds();
  }

  allBounds(): L.LatLngBounds {
    const bounds = L.latLngBounds([]);
    for (const entry of this.entries.values()) bounds.extend(entry.core.getBounds());
    return bounds;
  }

  setLanguage(isArabic: boolean) {
    if (this.isArabic === isArabic) return;
    this.isArabic = isArabic;
    for (const corridor of SUMMIT_CORRIDORS) {
      this.entries.get(corridor.code)?.core.setTooltipContent(isArabic ? corridor.nameAr : corridor.nameEn);
    }
  }

  destroy() {
    this.layer.clearLayers();
    this.layer.remove();
    this.entries.clear();
  }
}
