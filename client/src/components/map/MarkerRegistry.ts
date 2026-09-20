import L from "leaflet";
import { SIM_TICK_MS, TRAIL_POINTS } from "./constants";
import { bearing, distanceMeters, easeInOut, lerpAngle, lerpLatLng, samePoint, type LatLngTuple } from "./geometry";
import { markerIcon, popupHtml, type MarkerTone } from "./icons";

/**
 * Owns every point marker on the map, outside React.
 *
 * `sync(specs)` diffs by id: new ids are created in place, missing ids are
 * removed, and an id whose position changed is put in flight. One
 * requestAnimationFrame loop lerps every in-flight marker from where it
 * currently is to its new fix over `durationMs` (ease-in-out), turning the
 * heading chevron toward the bearing of travel. When the tab is hidden the
 * loop pauses; on return elapsed time ≥ duration, so markers settle at their
 * latest fix instead of rubber-banding through stale positions.
 */

export type MarkerSpec = {
  id: string;
  tone: MarkerTone;
  position: LatLngTuple;
  label: string;
  subtitle?: string;
  onClick?: () => void;
  /** Keep a short breadcrumb polyline behind the marker (convoys). */
  trail?: boolean;
};

export type MarkerTelemetry = {
  /** Derived from distance/time between the last two fixes; 0 until two fixes exist. */
  speedKmh: number;
  /** Degrees clockwise from north. */
  heading: number;
  moving: boolean;
};

type Entry = {
  marker: L.Marker;
  tone: MarkerTone;
  label: string;
  subtitle?: string;
  onClick?: () => void;
  from: LatLngTuple;
  to: LatLngTuple;
  /** null when settled at `to`. */
  startedAt: number | null;
  duration: number;
  heading: number;
  targetHeading: number;
  headingEl: HTMLElement | null;
  /** Wall-clock time of the last fix, for speed. */
  lastFixAt: number;
  speedKmh: number;
  trail: L.Polyline | null;
  trailPoints: LatLngTuple[];
};

const MIN_MOVE_METERS = 3;
/** Above this a fix pair is a data jump (coarse demo waypoints, GPS glitch), not a speed. */
const MAX_PLAUSIBLE_KMH = 220;
const Z_OFFSET: Record<MarkerTone, number> = { driver: 1000, delay: 900, venue: 500, task: 100, dropoff: 100 };

export class MarkerRegistry {
  private readonly entries = new Map<string, Entry>();
  private readonly layer: L.LayerGroup;
  private readonly trailLayer: L.LayerGroup;
  private raf: number | null = null;
  private destroyed = false;
  private readonly reducedMotion: boolean;

  constructor(
    map: L.Map,
    private readonly durationMs: number = SIM_TICK_MS
  ) {
    this.trailLayer = L.layerGroup().addTo(map);
    this.layer = L.layerGroup().addTo(map);
    this.reducedMotion =
      typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  }

  /** Reconcile the marker set with `specs`. Returns the bounds of every target position. */
  sync(specs: MarkerSpec[]): L.LatLngBounds {
    if (this.destroyed) return L.latLngBounds([]);
    const now = performance.now();
    const seen = new Set<string>();
    const bounds = L.latLngBounds([]);

    for (const spec of specs) {
      seen.add(spec.id);
      bounds.extend(spec.position);
      const existing = this.entries.get(spec.id);
      if (!existing) {
        this.create(spec, now);
        continue;
      }
      existing.onClick = spec.onClick;
      if (existing.tone !== spec.tone) {
        existing.tone = spec.tone;
        existing.marker.setIcon(markerIcon(spec.tone));
        existing.marker.setZIndexOffset(Z_OFFSET[spec.tone]);
        existing.headingEl = null;
      }
      if (existing.label !== spec.label || existing.subtitle !== spec.subtitle) {
        existing.label = spec.label;
        existing.subtitle = spec.subtitle;
        existing.marker.getPopup()?.setContent(popupHtml(spec.label, spec.subtitle));
      }
      if (spec.trail && !existing.trail) existing.trail = this.makeTrail();
      if (!spec.trail && existing.trail) {
        this.trailLayer.removeLayer(existing.trail);
        existing.trail = null;
        existing.trailPoints = [];
      }
      if (!samePoint(existing.to, spec.position)) this.animateTo(existing, spec.position, now);
    }

    for (const [id, entry] of this.entries) {
      if (seen.has(id)) continue;
      this.layer.removeLayer(entry.marker);
      if (entry.trail) this.trailLayer.removeLayer(entry.trail);
      this.entries.delete(id);
    }

    return bounds;
  }

  /** One-shot acknowledgement ring on a marker (live event, selection). */
  pulse(id: string) {
    const root = this.entries.get(id)?.marker.getElement()?.querySelector<HTMLElement>(".map-marker");
    if (!root) return;
    root.classList.remove("is-pulsing");
    // Restart the animation even if the previous pulse is still running.
    void root.offsetWidth;
    root.classList.add("is-pulsing");
    root.addEventListener("animationend", () => root.classList.remove("is-pulsing"), { once: true });
  }

  setSelected(id: string | null) {
    for (const [key, entry] of this.entries) {
      entry.marker.getElement()?.classList.toggle("is-selected", key === id);
    }
  }

  telemetry(id: string): MarkerTelemetry | undefined {
    const entry = this.entries.get(id);
    if (!entry) return undefined;
    return { speedKmh: entry.speedKmh, heading: entry.heading, moving: entry.startedAt !== null };
  }

  /** Current on-screen position (interpolated while in flight). */
  position(id: string): LatLngTuple | undefined {
    const entry = this.entries.get(id);
    if (!entry) return undefined;
    const ll = entry.marker.getLatLng();
    return [ll.lat, ll.lng];
  }

  has(id: string) {
    return this.entries.has(id);
  }

  bounds(): L.LatLngBounds {
    const bounds = L.latLngBounds([]);
    for (const entry of this.entries.values()) bounds.extend(entry.to);
    return bounds;
  }

  destroy() {
    this.destroyed = true;
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.raf = null;
    this.layer.clearLayers();
    this.trailLayer.clearLayers();
    this.layer.remove();
    this.trailLayer.remove();
    this.entries.clear();
  }

  private create(spec: MarkerSpec, now: number) {
    const marker = L.marker(spec.position, {
      icon: markerIcon(spec.tone),
      zIndexOffset: Z_OFFSET[spec.tone],
      keyboard: false
    });
    marker.bindPopup(popupHtml(spec.label, spec.subtitle));
    const entry: Entry = {
      marker,
      tone: spec.tone,
      label: spec.label,
      subtitle: spec.subtitle,
      onClick: spec.onClick,
      from: spec.position,
      to: spec.position,
      startedAt: null,
      duration: this.durationMs,
      heading: 0,
      targetHeading: 0,
      headingEl: null,
      lastFixAt: now,
      speedKmh: 0,
      trail: spec.trail ? this.makeTrail() : null,
      trailPoints: []
    };
    marker.on("click", () => entry.onClick?.());
    marker.addTo(this.layer);
    this.entries.set(spec.id, entry);
  }

  private makeTrail() {
    return L.polyline([], {
      className: "map-trail",
      color: "#34D399",
      weight: 2,
      opacity: 0.45,
      interactive: false,
      lineCap: "round",
      lineJoin: "round"
    }).addTo(this.trailLayer);
  }

  private animateTo(entry: Entry, to: LatLngTuple, now: number) {
    const current = this.currentPosition(entry, now);
    const dist = distanceMeters(current, to);
    if (dist >= MIN_MOVE_METERS) {
      entry.targetHeading = bearing(current, to);
      const seconds = Math.max(0.25, (now - entry.lastFixAt) / 1000);
      const kmh = Math.round((dist / seconds) * 3.6);
      entry.speedKmh = kmh <= MAX_PLAUSIBLE_KMH ? kmh : 0;
    }
    entry.lastFixAt = now;

    if (entry.trail) {
      entry.trailPoints.push(current);
      if (entry.trailPoints.length > TRAIL_POINTS) entry.trailPoints.splice(0, entry.trailPoints.length - TRAIL_POINTS);
    }

    entry.from = current;
    entry.to = to;

    if (this.reducedMotion || dist < MIN_MOVE_METERS) {
      entry.startedAt = null;
      entry.heading = entry.targetHeading;
      entry.marker.setLatLng(to);
      this.applyHeading(entry);
      this.applyTrail(entry, to);
      return;
    }

    entry.startedAt = now;
    entry.duration = this.durationMs;
    this.ensureLoop();
  }

  private currentPosition(entry: Entry, now: number): LatLngTuple {
    if (entry.startedAt === null) return entry.to;
    const t = Math.min(1, (now - entry.startedAt) / entry.duration);
    return lerpLatLng(entry.from, entry.to, easeInOut(t));
  }

  private ensureLoop() {
    if (this.raf !== null || this.destroyed) return;
    this.raf = requestAnimationFrame(this.frame);
  }

  private readonly frame = () => {
    this.raf = null;
    if (this.destroyed) return;
    const now = performance.now();
    let inFlight = false;

    for (const entry of this.entries.values()) {
      if (entry.startedAt === null) continue;
      const t = Math.min(1, (now - entry.startedAt) / entry.duration);
      const position = lerpLatLng(entry.from, entry.to, easeInOut(t));
      entry.marker.setLatLng(position);
      // Turn the chevron over the first third of the glide.
      entry.heading = lerpAngle(entry.heading, entry.targetHeading, Math.min(1, t * 3));
      this.applyHeading(entry);
      this.applyTrail(entry, position);
      if (t >= 1) {
        entry.startedAt = null;
        entry.heading = entry.targetHeading;
        this.applyHeading(entry);
      } else {
        inFlight = true;
      }
    }

    if (inFlight) this.raf = requestAnimationFrame(this.frame);
  };

  private applyHeading(entry: Entry) {
    if (!entry.headingEl) {
      entry.headingEl = entry.marker.getElement()?.querySelector<HTMLElement>(".map-marker__heading") ?? null;
      if (!entry.headingEl) return;
    }
    entry.headingEl.style.transform = `rotate(${entry.heading.toFixed(1)}deg)`;
  }

  private applyTrail(entry: Entry, head: LatLngTuple) {
    if (!entry.trail) return;
    entry.trail.setLatLngs([...entry.trailPoints, head]);
  }
}
