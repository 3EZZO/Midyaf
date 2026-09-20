import { useEffect, useState, type RefObject } from "react";
import L from "leaflet";
import { RIYADH } from "@shared/constants";
import { DARK_FALLBACK_TILES, TILE_FALLBACK_THRESHOLD, TILE_LAYERS, type MapMode, type TileConfig } from "./constants";

const LABELS_PANE = "map-labels";

/**
 * Creates one Leaflet map on `containerRef` for the component's lifetime
 * and swaps the tile layer when `mode` changes. Controls follow the reading
 * direction: zoom sits at the inline-start corner, attribution at the
 * inline-end, so they never collide with the HUD overlays.
 *
 * The dark base falls back from Esri Dark Gray to filtered OSM after
 * `TILE_FALLBACK_THRESHOLD` consecutive tile errors — only while online, so
 * a warmed service-worker cache keeps serving the primary tiles offline.
 */
export function useLeafletMap(containerRef: RefObject<HTMLDivElement | null>, mode: MapMode, isRtl: boolean) {
  const [map, setMap] = useState<L.Map | null>(null);
  const [zoomControl, setZoomControl] = useState<L.Control.Zoom | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
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
    setZoomControl(zoom);
    setMap(instance);
    return () => {
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
    let layers = addTileLayers(map, TILE_LAYERS[mode]);
    let consecutiveErrors = 0;
    let fellBack = false;

    const onError = () => {
      consecutiveErrors += 1;
      if (fellBack || mode !== "dark" || consecutiveErrors < TILE_FALLBACK_THRESHOLD) return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      fellBack = true;
      console.info("[map] dark base tiles unavailable — falling back to filtered OSM");
      layers.base.off("tileerror", onError);
      layers.base.off("tileload", onLoad);
      layers.remove();
      layers = addTileLayers(map, DARK_FALLBACK_TILES);
    };
    const onLoad = () => {
      consecutiveErrors = 0;
    };
    layers.base.on("tileerror", onError);
    layers.base.on("tileload", onLoad);

    return () => {
      layers.base.off("tileerror", onError);
      layers.base.off("tileload", onLoad);
      layers.remove();
    };
  }, [map, mode]);

  return map;
}

function addTileLayers(map: L.Map, cfg: TileConfig) {
  const base = L.tileLayer(cfg.url, {
    maxZoom: cfg.maxZoom,
    maxNativeZoom: cfg.maxNativeZoom,
    attribution: cfg.attribution,
    subdomains: cfg.subdomains,
    crossOrigin: true,
    className: cfg.className ?? "map-tiles"
  }).addTo(map);
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
