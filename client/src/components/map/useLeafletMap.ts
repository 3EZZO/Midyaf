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
