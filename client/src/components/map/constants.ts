/**
 * Tile providers. All keyless. Esri Dark Gray Canvas is the tactical base
 * (plus its reference layer for road labels); if it fails while online the
 * map falls back to OSM standard tiles with a CSS dark filter (`map.css`).
 * Every host here is also listed in client/vite.config.ts `runtimeCaching`
 * so a rehearsal pre-warms the demo zoom levels for offline playback.
 *
 * CARTO `dark_all` was evaluated and rejected: as of 2026 its basemaps
 * watermark "API KEY REQUIRED" without a paid key. Open-source-only rule.
 */
export type MapMode = "dark" | "satellite" | "standard";

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

const ESRI_ATTRIBUTION = '&copy; <a href="https://www.esri.com/">Esri</a>, HERE, Garmin, OpenStreetMap contributors';
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

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
    attribution: '&copy; <a href="https://www.esri.com/">Esri</a> World Imagery',
    subdomains: "",
    maxZoom: 18,
    className: "map-tiles"
  },
  standard: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: OSM_ATTRIBUTION,
    subdomains: "abc",
    maxZoom: 19,
    className: "map-tiles"
  }
};

/** Keyless fallback for the dark base: OSM tiles inverted to Obsidian by CSS. */
export const DARK_FALLBACK_TILES: TileConfig = {
  url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution: OSM_ATTRIBUTION,
  subdomains: "abc",
  maxZoom: 19,
  className: "map-tiles map-tiles--inverted"
};

/** Consecutive tile failures (while online) before the dark base falls back. */
export const TILE_FALLBACK_THRESHOLD = 4;

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
