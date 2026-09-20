import L from "leaflet";
import type { CorridorCode, CorridorState } from "@shared/constants";
import type { GeofenceRingType } from "@shared/domain";
import { CAMERA_FLY_SECONDS, FOCUS_ZOOM, OVERVIEW_MAX_ZOOM } from "./constants";
import type { CorridorLayer } from "./CorridorLayer";
import type { GeofenceLayer } from "./GeofenceLayer";
import type { MarkerRegistry } from "./MarkerRegistry";

/**
 * Imperative camera + layer handle consumed by the War Room and the demo
 * director. Every move is a `flyTo`/`flyToBounds` over `CAMERA_FLY_SECONDS`
 * so narration and camera stay in step. Under reduced motion Leaflet's own
 * `animate:false` path is used.
 */
export type MapController = {
  focusConvoy(driverId: string, zoom?: number): boolean;
  focusSite(siteRef: string): boolean;
  frameCorridor(code: CorridorCode): boolean;
  overview(): void;
  setCorridorState(code: CorridorCode, state: CorridorState): void;
  pulseRing(siteRef: string, ring: GeofenceRingType | "OUTSIDE"): void;
  pulseConvoy(driverId: string): void;
  invalidateSize(): void;
  readonly map: L.Map;
};

type Deps = {
  map: L.Map;
  markers: MarkerRegistry;
  geofences: GeofenceLayer;
  corridors: CorridorLayer;
  reducedMotion: boolean;
};

export function createMapController({ map, markers, geofences, corridors, reducedMotion }: Deps): MapController {
  const fly = (center: L.LatLngExpression, zoom: number) => {
    if (reducedMotion) map.setView(center, zoom, { animate: false });
    else map.flyTo(center, zoom, { duration: CAMERA_FLY_SECONDS, easeLinearity: 0.2 });
  };
  const flyBounds = (bounds: L.LatLngBounds, maxZoom: number) => {
    if (!bounds.isValid()) return;
    const padded = bounds.pad(0.15);
    if (reducedMotion) map.fitBounds(padded, { maxZoom, animate: false });
    else map.flyToBounds(padded, { maxZoom, duration: CAMERA_FLY_SECONDS, easeLinearity: 0.2 });
  };

  return {
    map,
    focusConvoy(driverId, zoom = FOCUS_ZOOM) {
      const position = markers.position(driverId);
      if (!position) return false;
      fly(position, zoom);
      markers.setSelected(driverId);
      return true;
    },
    focusSite(siteRef) {
      const bounds = geofences.siteBounds(siteRef);
      if (!bounds) return false;
      flyBounds(bounds, FOCUS_ZOOM);
      return true;
    },
    frameCorridor(code) {
      const bounds = corridors.bounds(code);
      if (!bounds) return false;
      flyBounds(bounds, OVERVIEW_MAX_ZOOM);
      return true;
    },
    overview() {
      const bounds = markers.bounds();
      bounds.extend(corridors.allBounds());
      markers.setSelected(null);
      flyBounds(bounds, OVERVIEW_MAX_ZOOM);
    },
    setCorridorState(code, state) {
      corridors.setState(code, state);
    },
    pulseRing(siteRef, ring) {
      geofences.pulseRing(siteRef, ring);
    },
    pulseConvoy(driverId) {
      markers.pulse(driverId);
    },
    invalidateSize() {
      map.invalidateSize();
    }
  };
}

/**
 * The most recently mounted map registers itself here so the director can
 * drive the camera without prop drilling through the War Room.
 */
let active: MapController | null = null;
const listeners = new Set<(controller: MapController | null) => void>();

export function registerMapController(controller: MapController | null) {
  active = controller;
  listeners.forEach((fn) => fn(controller));
}

export function getMapController(): MapController | null {
  return active;
}

export function onMapController(fn: (controller: MapController | null) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
