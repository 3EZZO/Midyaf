import { useEffect, useRef, useState } from "react";
import L, { type LayerGroup, type Map as LeafletMap, type TileLayer } from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  RadioTower,
  Satellite,
  Moon,
  Map as MapIcon,
  Compass,
  Maximize2,
  Minimize2,
  Car,
  Users,
  ClipboardList,
  Crosshair,
  X
} from "lucide-react";
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

const VIP_GUESTS_ROSTER = [
  {
    name: "H.E. Yasir Al-Rumayyan",
    title: "Governor of PIF",
    location: "Ritz-Carlton Plenary Corridor",
    driver: "Capt. Sultan Al-Otaibi",
    vehicle: "Mercedes-Maybach S680",
    status: "Opening Keynote Ready"
  },
  {
    name: "Jamie Dimon",
    title: "Chairman & CEO, JPMorgan Chase",
    location: "King Fahd Rd / Olaya",
    driver: "Capt. Fahad Al-Qahtani",
    vehicle: "BMW 7-Series VIP",
    status: "En Route to Kingdom Centre"
  },
  {
    name: "Larry Fink",
    title: "Chairman & CEO, BlackRock",
    location: "KKIA T2 VIP Apron",
    driver: "Capt. Rakan Al-Dossary",
    vehicle: "Mercedes-Maybach S680",
    status: "Landed · Fast-Track Escort"
  },
  {
    name: "Ray Dalio",
    title: "Founder, Bridgewater Associates",
    location: "KAFD Diplomatic Hall",
    driver: "Capt. Tariq Al-Ghamdi",
    vehicle: "Lexus LS 500 Executive",
    status: "Plenary Session Active"
  },
  {
    name: "Noura Al Harbi",
    title: "VIP Summit Delegate",
    location: "Bujairi Terrace Diriyah",
    driver: "Capt. Nasser Al-Mutairi",
    vehicle: "Lexus LS 500 Executive",
    status: "Royal Gala Confirmed"
  }
];

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
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenTab, setFullscreenTab] = useState<"drivers" | "guests" | "tasks">("drivers");

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

  // Invalidate map size on fullscreen switch
  useEffect(() => {
    const timer = setTimeout(() => {
      mapRef.current?.invalidateSize();
    }, 250);
    return () => clearTimeout(timer);
  }, [isFullscreen]);

  // Handle Escape key to exit fullscreen
  useEffect(() => {
    if (!isFullscreen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        tacticalAudio.playTacticalPing();
        setIsFullscreen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreen]);

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

  // Center on Driver
  const handleLocateDriver = (driver: Driver) => {
    tacticalAudio.playTacticalPing();
    const lat = driver.currentLat;
    const lng = driver.currentLng;
    if (typeof lat === "number" && typeof lng === "number" && mapRef.current) {
      mapRef.current.flyTo([lat, lng], 15, { duration: 1.2 });
      onSelectDriver?.(driver);
    }
  };

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

  // Main Render
  return (
    <>
      <div
        className={`overflow-hidden rounded-2xl glass-tactical shadow-2xl transition-all ${
          isFullscreen
            ? "fixed inset-0 z-[100] w-screen h-screen command-deck-bg flex flex-col p-4 m-0 rounded-none animate-fadeIn"
            : className
        }`}
      >
        {/* Top Map Control Bar */}
        <div className="flex flex-wrap items-center justify-between border-b border-midyaf-gold/20 bg-slate-950/90 px-4 py-3 text-white backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="relative flex size-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex size-3 rounded-full bg-emerald-500" />
            </div>
            <div>
              <p className="text-sm font-black tracking-tight text-midyaf-gold flex items-center gap-2">
                <span>{isFullscreen ? l("Fullscreen Operational Tactical Map") : l("Sovereign Dark Tactical")}</span>
                <span className="rounded bg-midyaf-gold/20 px-1.5 py-0.2 text-[10px] text-midyaf-gold ring-1 ring-midyaf-gold/40">
                  {l("Riyadh")}
                </span>
              </p>
              <p className="text-[11px] text-slate-400">
                {RIYADH.centerLat.toFixed(4)}° N, {RIYADH.centerLng.toFixed(4)}° E · {drivers.length} {l("Active Fleets")} · {tasks.length} {l("Missions")}
              </p>
            </div>
          </div>

          {/* Action Tools & Switchers */}
          <div className="flex items-center gap-2">
            {/* Tactical Cartography Switcher */}
            <div className="flex items-center gap-1 rounded-xl bg-white/5 p-1 ring-1 ring-white/10">
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
                <span className="hidden sm:inline">{l("Tactical")}</span>
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
                <span className="hidden sm:inline">{l("Satellite")}</span>
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
                <span className="hidden sm:inline">{l("Standard")}</span>
              </button>
            </div>

            {/* Fullscreen Expand / Minimize Button */}
            <button
              type="button"
              onClick={() => {
                tacticalAudio.playChime();
                setIsFullscreen((prev) => !prev);
              }}
              className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-midyaf-gold/20 to-amber-500/20 px-3 py-1.5 text-xs font-black text-midyaf-gold ring-1 ring-midyaf-gold/50 hover:bg-midyaf-gold/30 transition shadow-sm"
              title={isFullscreen ? l("Exit Fullscreen") : l("Expand Fullscreen Operational Deck")}
            >
              {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
              <span>{isFullscreen ? l("Exit Fullscreen") : l("Fullscreen")}</span>
            </button>
          </div>
        </div>

        {/* Content Area */}
        {isFullscreen ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 flex-1 overflow-hidden p-3">
            {/* Fullscreen Map Canvas (8 cols) */}
            <div className="lg:col-span-8 relative h-full rounded-2xl overflow-hidden border border-midyaf-gold/30 shadow-2xl bg-slate-950">
              <div ref={containerRef} className="h-full w-full" />
            </div>

            {/* Operational Monitoring Sidebar (4 cols) */}
            <div className="lg:col-span-4 flex flex-col gap-3 h-full overflow-hidden">
              {/* Tab Selector */}
              <div className="flex gap-1.5 rounded-xl bg-slate-900/90 p-1.5 ring-1 ring-white/10">
                <button
                  type="button"
                  onClick={() => {
                    tacticalAudio.playTacticalPing();
                    setFullscreenTab("drivers");
                  }}
                  className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition ${
                    fullscreenTab === "drivers"
                      ? "bg-midyaf-purple text-midyaf-gold ring-1 ring-midyaf-gold/40 shadow"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <Car size={13} />
                  <span>{l("Active Fleets & Drivers")}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    tacticalAudio.playTacticalPing();
                    setFullscreenTab("guests");
                  }}
                  className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition ${
                    fullscreenTab === "guests"
                      ? "bg-midyaf-purple text-midyaf-gold ring-1 ring-midyaf-gold/40 shadow"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <Users size={13} />
                  <span>{l("VIP Guests & Delegations")}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    tacticalAudio.playTacticalPing();
                    setFullscreenTab("tasks");
                  }}
                  className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition ${
                    fullscreenTab === "tasks"
                      ? "bg-midyaf-purple text-midyaf-gold ring-1 ring-midyaf-gold/40 shadow"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <ClipboardList size={13} />
                  <span>{l("Operational Tasks & Missions")}</span>
                </button>
              </div>

              {/* Tab Content List */}
              <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
                {fullscreenTab === "drivers" && (
                  <div className="space-y-2">
                    {drivers.map((driver) => {
                      const vehicle = (driver as any).vehicleModel ?? "VIP Motorcade";
                      const plate = (driver as any).plateNumber ?? "2027 KSA";
                      const speed = (driver as any).speed ?? 78;

                      return (
                        <div
                          key={driver.id}
                          className="rounded-xl glass-tactical p-3 border border-white/10 hover:border-emerald-400/50 transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-white text-xs">{l(driver.user.name)}</span>
                            <span className="font-mono text-emerald-400 text-xs font-black bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30">
                              {speed} km/h
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 mt-1">{vehicle} · {plate}</p>
                          <div className="mt-2 flex items-center justify-between">
                            <Badge tone={driver.status === "OFFLINE" ? "slate" : "green"}>
                              {l(driver.status)}
                            </Badge>
                            <button
                              type="button"
                              onClick={() => handleLocateDriver(driver)}
                              className="flex items-center gap-1 text-[11px] font-bold text-midyaf-gold hover:text-amber-300 transition"
                            >
                              <Crosshair size={12} />
                              <span>{isArabic ? "تحديد الموقع على الخريطة" : "Locate on Map"}</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {fullscreenTab === "guests" && (
                  <div className="space-y-2">
                    {VIP_GUESTS_ROSTER.map((vip, idx) => (
                      <div
                        key={idx}
                        className="rounded-xl glass-tactical p-3 border border-midyaf-gold/20 hover:border-midyaf-gold/60 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-white text-xs">👑 {vip.name}</span>
                          <span className="text-[10px] text-cyan-300 font-mono bg-cyan-950/60 px-1.5 py-0.5 rounded">
                            VIP
                          </span>
                        </div>
                        <p className="text-[11px] text-midyaf-gold mt-0.5">{vip.title}</p>
                        <div className="mt-2 text-[10px] text-slate-400 space-y-0.5 border-t border-white/5 pt-1.5">
                          <p>🚗 {l("Chauffeur")}: <span className="text-slate-200 font-semibold">{vip.driver}</span> ({vip.vehicle})</p>
                          <p>📍 {l("Corridor")}: <span className="text-slate-200">{vip.location}</span></p>
                          <p className="text-emerald-400 font-semibold">● {vip.status}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {fullscreenTab === "tasks" && (
                  <div className="space-y-2">
                    {tasks.map((task) => (
                      <div
                        key={task.id}
                        className="rounded-xl glass-tactical p-3 border border-white/10"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-white text-xs">{l(task.type)}</span>
                          <Badge tone={task.status === "COMPLETED" ? "green" : task.status === "DELAYED" ? "red" : "purple"}>
                            {l(task.status)}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-slate-300 mt-1">
                          {l(task.pickupLocation)} → {l(task.dropoffLocation)}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-1">
                          {l("Owner")}: {l(task.ownerName)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Normal Inline Map Surface */
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
        )}
      </div>
    </>
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
