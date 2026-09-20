import L from "leaflet";
import { CONCENTRIC_GEOFENCES, GEOFENCE_RING_META, GEOFENCE_RING_ORDER } from "@shared/constants";
import type { GeofenceRingType } from "@shared/domain";
import type { LatLngTuple } from "./geometry";

/**
 * Concentric rings for every site in `CONCENTRIC_GEOFENCES`, drawn once.
 * `pulseRing()` acknowledges a `geofence:transition` with a one-shot CSS
 * animation on the ring the convoy just entered.
 */

const PULSE_CLASS = "geo-ring--pulse";

const ringKey = (siteRef: string, ring: GeofenceRingType) => `${siteRef}:${ring}`;

export class GeofenceLayer {
  private readonly layer = L.layerGroup();
  private readonly rings = new Map<string, L.Circle>();
  private readonly centers = new Map<string, LatLngTuple>();
  private isArabic: boolean;

  constructor(
    private readonly map: L.Map,
    isArabic: boolean,
    visible = true
  ) {
    this.isArabic = isArabic;
    for (const site of CONCENTRIC_GEOFENCES) {
      const center: LatLngTuple = [site.centerLat, site.centerLng];
      this.centers.set(site.id, center);
      this.centers.set(site.code, center);
      // Outermost first so inner rings paint on top and stay clickable.
      const rings = [...site.rings].sort(
        (a, b) => GEOFENCE_RING_META[a.ring].order - GEOFENCE_RING_META[b.ring].order
      );
      for (const ring of rings) {
        const meta = GEOFENCE_RING_META[ring.ring];
        const circle = L.circle(center, {
          radius: ring.radiusMeters,
          color: meta.color,
          fillColor: meta.color,
          fillOpacity: meta.fillOpacity,
          weight: meta.weight,
          dashArray: meta.dashArray ?? undefined,
          className: `geo-ring geo-ring--${ring.ring.toLowerCase()}`
        });
        circle.bindTooltip(this.tooltipFor(site, ring), { direction: "top", className: "map-tooltip" });
        circle.addTo(this.layer);
        this.rings.set(ringKey(site.id, ring.ring), circle);
        this.rings.set(ringKey(site.code, ring.ring), circle);
      }
    }
    if (visible) this.layer.addTo(map);
  }

  setVisible(visible: boolean) {
    if (visible && !this.map.hasLayer(this.layer)) this.layer.addTo(this.map);
    if (!visible && this.map.hasLayer(this.layer)) this.map.removeLayer(this.layer);
  }

  setLanguage(isArabic: boolean) {
    if (this.isArabic === isArabic) return;
    this.isArabic = isArabic;
    for (const site of CONCENTRIC_GEOFENCES) {
      for (const ring of site.rings) {
        this.rings.get(ringKey(site.id, ring.ring))?.setTooltipContent(this.tooltipFor(site, ring));
      }
    }
  }

  /** `siteRef` is a geofence id or code (both are accepted from socket payloads). */
  pulseRing(siteRef: string, ring: GeofenceRingType | "OUTSIDE") {
    if (ring === "OUTSIDE") return;
    const circle = this.rings.get(ringKey(siteRef, ring));
    const el = circle?.getElement() as SVGElement | null | undefined;
    if (!circle || !el) return;
    circle.bringToFront();
    el.classList.remove(PULSE_CLASS);
    // Force a style flush so a second pulse on the same ring restarts.
    void (el as unknown as HTMLElement).getBoundingClientRect();
    el.classList.add(PULSE_CLASS);
    el.addEventListener("animationend", () => el.classList.remove(PULSE_CLASS), { once: true });
  }

  siteCenter(siteRef: string): LatLngTuple | undefined {
    return this.centers.get(siteRef);
  }

  /** Bounds of the outermost ring of a site — for framing the camera. */
  siteBounds(siteRef: string): L.LatLngBounds | undefined {
    const outer = GEOFENCE_RING_ORDER[0];
    return this.rings.get(ringKey(siteRef, outer))?.getBounds();
  }

  destroy() {
    this.layer.clearLayers();
    this.layer.remove();
    this.rings.clear();
    this.centers.clear();
  }

  private tooltipFor(
    site: (typeof CONCENTRIC_GEOFENCES)[number],
    ring: (typeof CONCENTRIC_GEOFENCES)[number]["rings"][number]
  ) {
    return this.isArabic
      ? `${site.nameAr} · ${ring.labelAr} (${ring.radiusMeters}م)`
      : `${site.nameEn} · ${ring.labelEn} (${ring.radiusMeters}m)`;
  }
}
