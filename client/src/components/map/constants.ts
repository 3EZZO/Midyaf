/**
 * Tile providers. The owner allows exactly two base maps, both Esri ArcGIS
 * Online keyless tile services (SILA-INTAKE-002):
 *
 * - satellite → Esri World_Imagery (the default)
 * - dark      → Tactical: Esri Dark Gray Canvas (+ its reference labels)
 *
 * If the tactical base fails while online, the map falls back to the same
 * World_Imagery layer and the UI says so. There is no street map, and no
 * OpenStreetMap volunteer tile server is requested anywhere, including the
 * fallback and the service-worker cache.
 *
 * Every host here is also listed in client/vite.config.ts `runtimeCaching`.
 *
 * Rejected: CARTO basemaps now watermark "API KEY REQUIRED" without a key,
 * and the OSM volunteer servers refuse application traffic. Neither may be
 * re-added as a "reliable" provider.
 */
export type MapMode = "satellite" | "dark";

/** Display order of the map-style choices: Satellite, then Tactical. */
export const MAP_MODES: readonly MapMode[] = ["satellite", "dark"];

export const DEFAULT_MAP_MODE: MapMode = "satellite";

/** Any unknown value, including the retired street mode, resolves to the default. */
export function toMapMode(value: unknown): MapMode {
  return MAP_MODES.includes(value as MapMode) ? (value as MapMode) : DEFAULT_MAP_MODE;
}

export type TileConfig = {
  url: string;
  attribution: string;
  subdomains: string;
  maxZoom: number;
  /** Highest zoom the provider serves; Leaflet upscales beyond it. */
  maxNativeZoom?: number;
  /** Optional transparent label overlay drawn above the base. */
  labelsUrl?: string;
  /** CSS class applied to the tile layer (see map.css). */
  className?: string;
};

/** Esri basemaps include OpenStreetMap-derived data; the credit stays, the label does not. */
const ESRI_ATTRIBUTION =
  'Tiles &copy; <a href="https://www.esri.com/">Esri</a> &mdash; Esri, HERE, Garmin, USGS, NGA, OpenStreetMap contributors, and the GIS User Community';
const ESRI_IMAGERY_ATTRIBUTION =
  'Tiles &copy; <a href="https://www.esri.com/">Esri</a> &mdash; Esri, Maxar, Earthstar Geographics, and the GIS User Community';

export const TILE_LAYERS: Record<MapMode, TileConfig> = {
  dark: {
    url: "https://services.arcgisonline.com/arcgis/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    labelsUrl:
      "https://services.arcgisonline.com/arcgis/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
    attribution: ESRI_ATTRIBUTION,
    subdomains: "",
    maxNativeZoom: 16,
    maxZoom: 18,
    className: "map-tiles map-tiles--dark"
  },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: ESRI_IMAGERY_ATTRIBUTION,
    subdomains: "",
    maxNativeZoom: 18,
    maxZoom: 18,
    className: "map-tiles"
  }
};

/** Per-mode fallback: tactical falls back to the satellite imagery; satellite has none. */
export const TILE_FALLBACKS: Partial<Record<MapMode, TileConfig>> = {
  dark: TILE_LAYERS.satellite
};

/** Consecutive tile failures (while online) before falling back or warning. */
export const TILE_FALLBACK_THRESHOLD = 4;

/** Plain Leaflet tile-layer options for a config (no Leaflet import needed). */
export function tileLayerOptions(cfg: TileConfig) {
  return {
    maxZoom: cfg.maxZoom,
    maxNativeZoom: cfg.maxNativeZoom,
    attribution: cfg.attribution,
    subdomains: cfg.subdomains,
    crossOrigin: true,
    className: cfg.className ?? "map-tiles"
  };
}

export type TileHealthVerdict = "fallback" | "degraded" | null;

/**
 * Counts consecutive tile errors for one mode. After the threshold (and only
 * while online, so a warmed cache keeps serving offline) it answers once:
 * "fallback" when the mode has a fallback, otherwise "degraded" so the UI can
 * tell the operator honestly that some tiles are missing.
 */
export function createTileHealth(
  mode: MapMode,
  isOnline: () => boolean = () => typeof navigator === "undefined" || navigator.onLine !== false
) {
  let consecutive = 0;
  let settled = false;
  return {
    onLoad() {
      consecutive = 0;
    },
    onError(): TileHealthVerdict {
      consecutive += 1;
      if (settled || consecutive < TILE_FALLBACK_THRESHOLD || !isOnline()) return null;
      settled = true;
      return TILE_FALLBACKS[mode] ? "fallback" : "degraded";
    }
  };
}

/**
 * Runtime caches written by earlier builds. They can hold OSM or Esri street
 * tiles, or opaque (status 0) error responses that a CacheFirst route would
 * replay for 30 days, so they are deleted once per page load. Current names
 * live in client/vite.config.ts and are never listed here.
 */
export const RETIRED_TILE_CACHES = [
  "map-tiles-osm",
  "map-tiles-esri",
  "map-tiles-carto",
  "map-tiles",
  "map-tiles-esri-v2"
] as const;

type CacheStorageLike = Pick<CacheStorage, "delete">;
let purgeStarted: Promise<string[]> | null = null;

export function purgeRetiredTileCaches(storage: CacheStorageLike | undefined = globalThis.caches): Promise<string[]> {
  if (!storage) return Promise.resolve([]);
  return Promise.all(
    RETIRED_TILE_CACHES.map((name) =>
      storage.delete(name).then(
        (deleted) => (deleted ? name : null),
        () => null
      )
    )
  ).then((names) => names.filter((name): name is (typeof RETIRED_TILE_CACHES)[number] => name !== null));
}

/** Once per page load; both radars call it when a map is created. */
export function purgeRetiredTileCachesOnce(): Promise<string[]> {
  purgeStarted ??= purgeRetiredTileCaches();
  return purgeStarted;
}

// ---------------------------------------------------------------------------
// Leaflet-free DOM helpers shared by RiyadhMap and EventRadar
// ---------------------------------------------------------------------------

type ScrollTarget = Pick<HTMLElement, "scrollTop" | "scrollLeft" | "addEventListener" | "removeEventListener">;

/** Snaps a clipped box back to its origin whenever focus or script scrolls it. */
export function pinScrollOrigin(el: ScrollTarget): () => void {
  const reset = () => {
    if (el.scrollTop !== 0) el.scrollTop = 0;
    if (el.scrollLeft !== 0) el.scrollLeft = 0;
  };
  el.addEventListener("scroll", reset, { passive: true });
  return () => el.removeEventListener("scroll", reset);
}

/** Makes programmatic `focus()` on `el` (Leaflet's mousedown focus) never scroll ancestors. */
export function focusWithoutScroll(el: Pick<HTMLElement, "focus">): () => void {
  const original = el.focus;
  el.focus = (options?: FocusOptions) => original.call(el, { ...options, preventScroll: true });
  return () => {
    el.focus = original;
  };
}

/** Calls `onResize` when the element's box changes (wrapping chrome, fullscreen, browser zoom). */
export function observeContainerSize(el: Element, onResize: () => void): () => void {
  if (typeof ResizeObserver === "undefined") return () => undefined;
  const observer = new ResizeObserver(() => onResize());
  observer.observe(el);
  return () => observer.disconnect();
}

/**
 * Duration a marker glides between two positions. Matches the simulation
 * cadence (`--sim-tick` in index.css) so a convoy is always mid-glide when
 * the next fix arrives — never parked, never teleporting.
 */
export const SIM_TICK_MS = 2400;

/** Camera moves for narrator-driven focus/frame/overview. */
export const CAMERA_FLY_SECONDS = 1.8;

/** Trail length per convoy (points). */
export const TRAIL_POINTS = 12;

export const FOCUS_ZOOM = 15;
export const OVERVIEW_MAX_ZOOM = 13;
