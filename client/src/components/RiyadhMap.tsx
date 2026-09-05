import { useEffect, useRef, useState } from "react";
import L, { type LayerGroup, type Map as LeafletMap, type TileLayer } from "leaflet";
import "leaflet/dist/leaflet.css";
import { RadioTower, Satellite, Moon, Map as MapIcon, Compass } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Driver, Event, Task } from "@shared/domain";
import { RIYADH } from "@shared/constants";
import { Badge } from "./Badge";
import { isArabicLanguage, localizeText } from "../lib/localize";
import { tacticalAudio } from "../lib/tacticalAudio";

const TILE_LAYERS = {
  dark: {
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution: '&copy; <a href="https://carto.com/">CARTO</a> Dark Tactical',
    subdomains: "abcd",
    maxZoom: 19
  },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: '&copy; <a href="https://www.esri.com/">Esri</a> Satellite',
    subdomains: "abc",
    maxZoom: 18
  },
  standard: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/">OSM</a>',
    subdomains: "abc",
    maxZoom: 19
  }
};

export function RiyadhMap({
  event,
  drivers,
  tasks,
  className = "",
  height = "h-[400px]",
  defaultMode = "dark",
  onSelectDriver
}: {
  event?: Event;
  drivers: Driver[];
  tasks: Task[];
  className?: string;
  height?: string;
  defaultMode?: "dark" | "satellite" | "standard";
  onSelectDriver?: (driver: Driver) => void;
}) {
  const { t, i18n } = useTranslation();
  const isArabic = isArabicLanguage(i18n.language);
  const l = (value: string | number | null | undefined) => localizeText(value, isArabic);

  const [mapMode, setMapMode] = useState<"dark" | "satellite" | "standard">(defaultMode);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);
  const tileLayerRef = useRef<TileLayer | null>(null);

  // Initialize Map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [RIYADH.centerLat, RIYADH.centerLng],
      zoom: RIYADH.defaultZoom,
      zoomControl: true,
      attributionControl: false
    });

    const initialCfg = TILE_LAYERS[defaultMode];
    const tileLayer = L.tileLayer(initialCfg.url, {
      maxZoom: initialCfg.maxZoom,
      attribution: initialCfg.attribution,
      subdomains: initialCfg.subdomains
    }).addTo(map);

    tileLayerRef.current = tileLayer;
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      tileLayerRef.current = null;
    };
  }, [defaultMode]);

  // Handle Map Mode switch
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    const cfg = TILE_LAYERS[mapMode];
    const newLayer = L.tileLayer(cfg.url, {
      maxZoom: cfg.maxZoom,
      attribution: cfg.attribution,
      subdomains: cfg.subdomains
    }).addTo(map);

    tileLayerRef.current = newLayer;
  }, [mapMode]);

  // Update Markers and Routes
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();
    const bounds = L.latLngBounds([]);

    // 1. Venue Marker (Royal Gold)
    const venuePoint = coordinates(event?.venueLat, event?.venueLng);
    if (venuePoint) {
      addCustomMarker({
        layer,
        bounds,
        lat: venuePoint.lat,
        lng: venuePoint.lng,
        label: l(event?.venue ?? "Riyadh Summit Main Venue"),
        subtitle: l("VIP Delegation Base · Plenary Hall"),
        tone: "venue"
      });
    }

    // 2. Tasks & Glowing Waypoint Paths
    for (const task of tasks) {
      const pickupPoint = coordinates(task.pickupLat, task.pickupLng);
      const dropoffPoint = coordinates(task.dropoffLat, task.dropoffLng);

      if (pickupPoint) {
        addCustomMarker({
          layer,
          bounds,
          lat: pickupPoint.lat,
          lng: pickupPoint.lng,
          label: `${l(task.pickupLocation)}`,
          subtitle: `${l("Status")}: ${l(task.status)}`,
          tone: task.status === "DELAYED" ? "delay" : "task"
        });
      }

      if (dropoffPoint) {
        addCustomMarker({
          layer,
          bounds,
          lat: dropoffPoint.lat,
          lng: dropoffPoint.lng,
          label: l(task.dropoffLocation),
          subtitle: l("Destination Corridor"),
          tone: "dropoff"
        });
      }

      if (pickupPoint && dropoffPoint) {
        // Outer glow polyline
        L.polyline(
          [
            [pickupPoint.lat, pickupPoint.lng],
            [dropoffPoint.lat, dropoffPoint.lng]
          ],
          {
            color: task.status === "DELAYED" ? "#EF4444" : "#C9A84C",
            weight: 6,
            opacity: 0.35
          }
        ).addTo(layer);

        // Inner glowing dashed vector line
        L.polyline(
          [
            [pickupPoint.lat, pickupPoint.lng],
            [dropoffPoint.lat, dropoffPoint.lng]
          ],
          {
            color: task.status === "DELAYED" ? "#DC2626" : "#10B981",
            weight: 2.5,
            opacity: 0.95,
            dashArray: task.status === "COMPLETED" ? undefined : "6, 8"
          }
        ).addTo(layer);
      }
    }

    // 3. Drivers with Real-time GPS & Heading Telemetry
    for (const driver of drivers) {
      const driverPoint = coordinates(driver.currentLat, driver.currentLng);
      if (driverPoint) {
        const vehicleName = (driver as any).vehicleModel ?? "VIP Motorcade";
        const plate = (driver as any).plateNumber ?? "2027 KSA";
        const speed = (driver as any).speed ?? 78;

        addCustomMarker({
          layer,
          bounds,
          lat: driverPoint.lat,
          lng: driverPoint.lng,
          label: `${l(driver.user.name)}`,
          subtitle: `${l(vehicleName)} · ${plate} · ${speed} km/h`,
          tone: "driver",
          onClick: () => {
            tacticalAudio.playTacticalPing();
            onSelectDriver?.(driver);
          }
        });
      }
    }

    if (bounds.isValid()) {
      map.fitBounds(bounds.pad(0.15), {
        maxZoom: 13,
        animate: false
      });
    } else {
      map.setView([RIYADH.centerLat, RIYADH.centerLng], RIYADH.defaultZoom);
    }
  }, [drivers, event, i18n.language, l, mapMode, onSelectDriver, tasks]);

  return (
    <div className={`overflow-hidden rounded-2xl glass-tactical shadow-2xl transition-all ${className}`}>
      {/* Top Map Control Bar */}
      <div className="flex flex-wrap items-center justify-between border-b border-midyaf-gold/20 bg-slate-950/90 px-4 py-3 text-white backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="relative flex size-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex size-3 rounded-full bg-emerald-500" />
          </div>
          <div>
            <p className="text-sm font-black tracking-tight text-midyaf-gold">
              {l("Sovereign Dark Tactical")} · {l("Riyadh")}
            </p>
            <p className="text-[11px] text-slate-400">
              {RIYADH.centerLat.toFixed(4)}° N, {RIYADH.centerLng.toFixed(4)}° E · {drivers.length} {l("Active Fleets")}
            </p>
          </div>
        </div>

        {/* Tactical Cartography Switcher */}
        <div className="flex items-center gap-1.5 rounded-xl bg-white/5 p-1 ring-1 ring-white/10">
          <button
            type="button"
            onClick={() => {
              tacticalAudio.playTacticalPing();
              setMapMode("dark");
            }}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition ${
              mapMode === "dark"
                ? "bg-gradient-to-r from-midyaf-purple to-slate-900 text-midyaf-gold shadow-sm ring-1 ring-midyaf-gold/50"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Moon size={12} />
            {l("Tactical")}
          </button>
          <button
            type="button"
            onClick={() => {
              tacticalAudio.playTacticalPing();
              setMapMode("satellite");
            }}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition ${
              mapMode === "satellite"
                ? "bg-gradient-to-r from-midyaf-purple to-slate-900 text-midyaf-gold shadow-sm ring-1 ring-midyaf-gold/50"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Satellite size={12} />
            {l("Satellite")}
          </button>
          <button
            type="button"
            onClick={() => {
              tacticalAudio.playTacticalPing();
              setMapMode("standard");
            }}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition ${
              mapMode === "standard"
                ? "bg-gradient-to-r from-midyaf-purple to-slate-900 text-midyaf-gold shadow-sm ring-1 ring-midyaf-gold/50"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <MapIcon size={12} />
            {l("Standard")}
          </button>
        </div>
      </div>

      {/* Map Surface */}
      <div className={`relative ${height} w-full overflow-hidden bg-slate-950`}>
        <div ref={containerRef} className="h-full w-full" />

        {/* Tactical HUD Overlay Floating Badge */}
        <div className="absolute bottom-3 start-3 z-[500] flex items-center gap-3 rounded-xl bg-slate-950/85 px-3.5 py-2 text-xs text-slate-300 shadow-xl backdrop-blur-md border border-midyaf-gold/25">
          <div className="flex items-center gap-1.5 font-bold text-midyaf-gold">
            <Compass size={13} className="animate-spin text-midyaf-gold" style={{ animationDuration: "10s" }} />
            <span>{l("Live GPS Telemetry")}</span>
          </div>
          <span className="text-slate-500">|</span>
          <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-semibold">
            <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
            {drivers.length} {l("Chauffeurs Active")}
          </span>
          <span className="text-slate-500">|</span>
          <span className="text-[11px] text-slate-400">
            {tasks.length} {l("Active Missions")}
          </span>
        </div>
      </div>
    </div>
  );
}

function addCustomMarker({
  layer,
  bounds,
  lat,
  lng,
  label,
  subtitle,
  tone,
  onClick
}: {
  layer: LayerGroup;
  bounds: L.LatLngBounds;
  lat: number;
  lng: number;
  label: string;
  subtitle?: string;
  tone: "venue" | "task" | "dropoff" | "driver" | "delay";
  onClick?: () => void;
}) {
  const point = L.latLng(lat, lng);
  bounds.extend(point);

  let iconHtml = "";

  if (tone === "driver") {
    iconHtml = `
      <div class="relative flex items-center justify-center cursor-pointer group">
        <span class="absolute inline-flex size-9 animate-ping rounded-full bg-emerald-400 opacity-60"></span>
        <div class="relative z-10 flex items-center justify-center size-8 rounded-full bg-slate-950 border-2 border-emerald-400 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.8)] text-xs font-black transition-transform hover:scale-110">
          🏎️
        </div>
      </div>
    `;
  } else if (tone === "venue") {
    iconHtml = `
      <div class="relative flex items-center justify-center">
        <span class="absolute inline-flex size-10 animate-ping rounded-full bg-amber-400 opacity-50"></span>
        <div class="relative z-10 flex items-center justify-center size-9 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 text-white shadow-[0_0_20px_rgba(201,168,76,0.9)] border border-amber-300 text-sm">
          👑
        </div>
      </div>
    `;
  } else if (tone === "delay") {
    iconHtml = `
      <div class="relative flex items-center justify-center">
        <span class="absolute inline-flex size-8 animate-ping rounded-full bg-red-400 opacity-75"></span>
        <div class="relative z-10 flex items-center justify-center size-7 rounded-full bg-red-600 text-white shadow-[0_0_15px_rgba(220,38,38,0.8)] border border-red-300 text-xs font-black">
          !
        </div>
      </div>
    `;
  } else {
    iconHtml = `
      <div class="flex items-center justify-center size-6 rounded-full bg-midyaf-purple border border-midyaf-gold text-white shadow-md text-[11px] font-bold">
        ${tone === "dropoff" ? "↓" : "↑"}
      </div>
    `;
  }

  const marker = L.marker(point, {
    icon: L.divIcon({
      className: "",
      html: iconHtml,
      iconSize: [34, 34],
      iconAnchor: [17, 17]
    })
  });

  const popupContent = `
    <div style="font-family: system-ui, -apple-system, sans-serif; min-width: 170px; padding: 4px;">
      <p style="margin: 0; font-weight: 800; font-size: 13px; color: #1E1B4B;">${escapeHtml(label)}</p>
      ${subtitle ? `<p style="margin: 3px 0 0; font-size: 11px; color: #64748B;">${escapeHtml(subtitle)}</p>` : ""}
    </div>
  `;

  marker.bindPopup(popupContent);

  if (onClick) {
    marker.on("click", onClick);
  }

  marker.addTo(layer);
}

function coordinates(
  lat: number | null | undefined,
  lng: number | null | undefined
): { lat: number; lng: number } | null {
  return typeof lat === "number" && typeof lng === "number" ? { lat, lng } : null;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
