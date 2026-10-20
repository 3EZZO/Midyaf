import { useEffect, useState, type RefObject } from "react";
import L from "leaflet";
import { RIYADH } from "@shared/constants";
import {
  TILE_FALLBACKS,
  TILE_LAYERS,
  createTileHealth,
  focusWithoutScroll,
  observeContainerSize,
  pinScrollOrigin,
  purgeRetiredTileCachesOnce,
  tileLayerOptions,
  type MapMode,
  type TileConfig,
  type TileHealthVerdict
} from "./constants";

// Kept importable from here for existing callers and tests.
export { focusWithoutScroll, observeContainerSize, pinScrollOrigin };

const LABELS_PANE = "map-labels";

/**
 * Creates one Leaflet map on `containerRef` for the component's lifetime
 * and swaps the tile layer when `mode` changes. Controls follow the reading
 * direction: zoom sits at the inline-start corner, attribution at the
 * inline-end, so they never collide with the HUD overlays.
 *
 * The tactical Dark Gray base swaps to the satellite imagery after
 * `TILE_FALLBACK_THRESHOLD` consecutive tile errors — only while online, so
 * a warmed service-worker cache keeps serving the primary tiles offline.
 * `tileStatus` reports that swap ("fallback") or failing tiles without a
 * fallback ("degraded") so the chrome can say so. Every provider is Esri;
 * see constants.ts.
 *
 * Leaflet focuses its container on every mousedown (drag, double-click
 * zoom) and only restores the window scroll afterwards. When the canvas is
 * taller than its clipped wrapper, that focus scrolled the wrapper and
 * pushed the radar chrome (filters, map style) out of view with no way back.
 * The container therefore focuses without scrolling and never keeps a
 * scroll offset of its own; layout-driven size changes re-measure the map.
 */
export function useLeafletMap(containerRef: RefObject<HTMLDivElement | null>, mode: MapMode, isRtl: boolean) {
  const [map, setMap] = useState<L.Map | null>(null);
  const [zoomControl, setZoomControl] = useState<L.Control.Zoom | null>(null);
  const [tileStatus, setTileStatus] = useState<TileHealthVerdict>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    void purgeRetiredTileCachesOnce();
    const instance = L.map(container, {
      center: [RIYADH.centerLat, RIYADH.centerLng],
      zoom: RIYADH.defaultZoom,
      zoomControl: false,
      attributionControl: true,
      zoomSnap: 0.25,
      wheelPxPerZoomLevel: 90
    });
    instance.attributionControl.setPrefix(false);
    // Road labels sit above the base tiles but below rings, corridors and markers.
    const labelsPane = instance.createPane(LABELS_PANE);
    labelsPane.style.zIndex = "250";
    labelsPane.style.pointerEvents = "none";
    const zoom = L.control.zoom({ position: "topleft" }).addTo(instance);
    const restoreFocus = focusWithoutScroll(container);
    const unpin = pinScrollOrigin(container);
    const unobserve = observeContainerSize(container, () => instance.invalidateSize({ animate: false }));
    setZoomControl(zoom);
    setMap(instance);
    return () => {
      unobserve();
      unpin();
      restoreFocus();
      instance.remove();
      setZoomControl(null);
      setMap(null);
    };
  }, [containerRef]);

  useEffect(() => {
    if (!map || !zoomControl) return;
    zoomControl.setPosition(isRtl ? "topright" : "topleft");
    map.attributionControl.setPosition(isRtl ? "bottomleft" : "bottomright");
  }, [map, zoomControl, isRtl]);

  useEffect(() => {
    if (!map) return;
    setTileStatus(null);
    let layers = addTileLayers(map, TILE_LAYERS[mode]);
    const health = createTileHealth(mode);

    const onError = () => {
      const verdict = health.onError();
      const fallback = TILE_FALLBACKS[mode];
      if (verdict === "degraded") setTileStatus("degraded");
      if (verdict !== "fallback" || !fallback) return;
      setTileStatus("fallback");
      detach();
      layers.remove();
      layers = addTileLayers(map, fallback);
    };
    const onLoad = () => health.onLoad();
    const detach = () => {
      layers.base.off("tileerror", onError);
      layers.base.off("tileload", onLoad);
    };
    layers.base.on("tileerror", onError);
    layers.base.on("tileload", onLoad);

    return () => {
      detach();
      layers.remove();
    };
  }, [map, mode]);

  return { map, tileStatus };
}

function addTileLayers(map: L.Map, cfg: TileConfig) {
  const base = L.tileLayer(cfg.url, tileLayerOptions(cfg)).addTo(map);
  const labels = cfg.labelsUrl
    ? L.tileLayer(cfg.labelsUrl, {
        maxZoom: cfg.maxZoom,
        maxNativeZoom: cfg.maxNativeZoom,
        subdomains: cfg.subdomains,
        crossOrigin: true,
        pane: LABELS_PANE,
        className: "map-tiles map-tiles--labels"
      }).addTo(map)
    : null;
  return {
    base,
    remove() {
      map.removeLayer(base);
      if (labels) map.removeLayer(labels);
    }
  };
}
