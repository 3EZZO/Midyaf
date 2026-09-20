import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./map.css";
import {
  Car,
  ClipboardList,
  Crosshair,
  Crown,
  Map as MapIcon,
  MapPin,
  Maximize2,
  Minimize2,
  Moon,
  Radar,
  Satellite,
  Users
} from "lucide-react";
import { useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";
import type { Driver, Event, Task } from "@shared/domain";
import { RIYADH } from "@shared/constants";
import { cn } from "../../lib/cn";
import { useLiveEvent } from "../../lib/liveEvents";
import { isArabicLanguage, localizeText } from "../../lib/localize";
import { Badge, Button, IconTabNav, StatusPill, type IconTab } from "../ui";
import { CorridorLayer } from "./CorridorLayer";
import { GeofenceLayer } from "./GeofenceLayer";
import { createMapController, registerMapController, type MapController } from "./MapController";
import { MarkerRegistry, type MarkerSpec } from "./MarkerRegistry";
import { OVERVIEW_MAX_ZOOM, type MapMode } from "./constants";
import { coordinates } from "./geometry";
import { useLeafletMap } from "./useLeafletMap";

/**
 * The tactical map. Leaflet stays imperative: React owns the chrome, the
 * registry/layers own the canvas. Data flows in as props on every tick and
 * is diffed by id, so convoys glide between fixes instead of being redrawn.
 */

type Zone = "ALL" | "NORTH" | "CENTRAL" | "WEST";
type FullscreenTab = "drivers" | "guests" | "tasks";

const ZONES: { id: Zone; en: string; ar: string }[] = [
  { id: "ALL", en: "All Corridors", ar: "كافة المسارات" },
  { id: "NORTH", en: "North / KKIA", ar: "شمال / المطار" },
  { id: "CENTRAL", en: "KAFD Plenary", ar: "كافد المالي" },
  { id: "WEST", en: "Diriyah / DQ", ar: "الدرعية / الدبلوماسي" }
];

const MODES: { id: MapMode; icon: typeof Moon; en: string; ar: string }[] = [
  { id: "dark", icon: Moon, en: "Tactical", ar: "تكتيكي" },
  { id: "satellite", icon: Satellite, en: "Satellite", ar: "قمر صناعي" },
  { id: "standard", icon: MapIcon, en: "Standard", ar: "قياسي" }
];

const FULLSCREEN_TABS: IconTab<FullscreenTab>[] = [
  { id: "drivers", icon: Car, labelEn: "Fleet & Captains", labelAr: "الأسطول والقادة" },
  { id: "guests", icon: Users, labelEn: "VIP Delegations", labelAr: "وفود كبار الشخصيات" },
  { id: "tasks", icon: ClipboardList, labelEn: "Missions", labelAr: "المهام" }
];

/** Demo roster shown in the fullscreen "VIP Delegations" tab. */
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

type Layers = {
  markers: MarkerRegistry;
  geofences: GeofenceLayer;
  corridors: CorridorLayer;
  routes: L.LayerGroup;
  controller: MapController;
};

export type RiyadhMapProps = {
  event?: Event;
  drivers: Driver[];
  tasks: Task[];
  className?: string;
  height?: string;
  defaultMode?: MapMode;
  selectedDriverId?: string | null;
  onSelectDriver?: (driver: Driver) => void;
  /** Receives the imperative camera handle once the map is live (null on unmount). */
  onController?: (controller: MapController | null) => void;
};

export function RiyadhMap({
  event,
  drivers,
  tasks,
  className = "",
  height = "h-[400px]",
  defaultMode = "dark",
  selectedDriverId = null,
  onSelectDriver,
  onController
}: RiyadhMapProps) {
  const { i18n } = useTranslation();
  const isArabic = isArabicLanguage(i18n.language);
  const l = useCallback((value: string | number | null | undefined) => localizeText(value, isArabic), [isArabic]);
  const reducedMotion = useReducedMotion() === true;

  const [mapMode, setMapMode] = useState<MapMode>(defaultMode);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenTab, setFullscreenTab] = useState<FullscreenTab>("drivers");
  const [selectedZone, setSelectedZone] = useState<Zone>("ALL");
  const [showGeofences, setShowGeofences] = useState(true);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const map = useLeafletMap(containerRef, mapMode, isArabic);
  const layersRef = useRef<Layers | null>(null);
  const [layers, setLayers] = useState<Layers | null>(null);
  const fittedEventRef = useRef<string | null>(null);
  const routeKeyRef = useRef<string>("");
  const onSelectDriverRef = useRef(onSelectDriver);
  onSelectDriverRef.current = onSelectDriver;
  const onControllerRef = useRef(onController);
  onControllerRef.current = onController;

  // Layers live for the map's lifetime; language/visibility are patched in place.
  useEffect(() => {
    if (!map) return;
    const corridors = new CorridorLayer(map, isArabic);
    const geofences = new GeofenceLayer(map, isArabic, showGeofences);
    const routes = L.layerGroup().addTo(map);
    const markers = new MarkerRegistry(map);
    const controller = createMapController({ map, markers, geofences, corridors, reducedMotion });
    const created: Layers = { markers, geofences, corridors, routes, controller };
    layersRef.current = created;
    setLayers(created);
    registerMapController(controller);
    onControllerRef.current?.(controller);
    return () => {
      onControllerRef.current?.(null);
      registerMapController(null);
      markers.destroy();
      geofences.destroy();
      corridors.destroy();
      routes.clearLayers();
      routes.remove();
      layersRef.current = null;
      setLayers(null);
      routeKeyRef.current = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  useEffect(() => {
    layers?.geofences.setVisible(showGeofences);
  }, [layers, showGeofences]);

  useEffect(() => {
    layers?.geofences.setLanguage(isArabic);
    layers?.corridors.setLanguage(isArabic);
  }, [layers, isArabic]);

  useEffect(() => {
    layers?.markers.setSelected(selectedDriverId);
  }, [layers, selectedDriverId]);

  const displayedDrivers = useMemo(() => {
    if (selectedZone === "ALL") return drivers;
    return drivers.filter((d) => {
      const zone = (d.zone ?? "").toUpperCase();
      const lat = d.currentLat;
      const lng = d.currentLng;
      if (selectedZone === "NORTH") return zone.includes("NORTH") || (typeof lat === "number" && lat > 24.85);
      if (selectedZone === "CENTRAL")
        return zone.includes("CENTRAL") || (typeof lat === "number" && lat >= 24.7 && lat <= 24.85);
      if (selectedZone === "WEST")
        return zone.includes("WEST") || zone.includes("DIRIYAH") || (typeof lng === "number" && lng < 46.62);
      return true;
    });
  }, [drivers, selectedZone]);

  // Reconcile markers on every data change. Nothing here clears a layer.
  useEffect(() => {
    if (!map || !layers) return;
    const { markers, routes } = layers;
    const specs: MarkerSpec[] = [];

    const venue = coordinates(event?.venueLat, event?.venueLng);
    if (venue && event) {
      specs.push({
        id: `venue:${event.id}`,
        tone: "venue",
        position: venue,
        label: l(event.venue ?? "Sovereign Summit Main Venue"),
        subtitle: l("VIP Delegation Base · Plenary Hall")
      });
    }

    for (const task of tasks) {
      const pickup = coordinates(task.pickupLat, task.pickupLng);
      const dropoff = coordinates(task.dropoffLat, task.dropoffLng);
      if (pickup) {
        specs.push({
          id: `task:${task.id}:pickup`,
          tone: task.status === "DELAYED" ? "delay" : "task",
          position: pickup,
          label: l(task.pickupLocation),
          subtitle: `${l("Status")}: ${l(task.status)}`
        });
      }
      if (dropoff) {
        specs.push({
          id: `task:${task.id}:dropoff`,
          tone: "dropoff",
          position: dropoff,
          label: l(task.dropoffLocation),
          subtitle: l("Destination Corridor")
        });
      }
    }

    for (const driver of displayedDrivers) {
      const position = coordinates(driver.currentLat, driver.currentLng);
      if (!position) continue;
      const telemetry = markers.telemetry(`driver:${driver.id}`);
      const vehicle = describeVehicle(driver, l);
      const speed = telemetry && telemetry.speedKmh > 0 ? `${telemetry.speedKmh} ${isArabic ? "كم/س" : "km/h"}` : null;
      specs.push({
        id: `driver:${driver.id}`,
        tone: "driver",
        position,
        trail: true,
        label: l(driver.user.name),
        subtitle: [vehicle, speed].filter(Boolean).join(" · ") || l(driver.status),
        onClick: () => onSelectDriverRef.current?.(driver)
      });
    }

    const bounds = markers.sync(specs);

    // Task routes are static lines; rebuild only when the set actually changes.
    const routeKey = tasks
      .map((t) => `${t.id}:${t.status}:${t.pickupLat},${t.pickupLng}>${t.dropoffLat},${t.dropoffLng}`)
      .join("|");
    if (routeKey !== routeKeyRef.current) {
      routeKeyRef.current = routeKey;
      routes.clearLayers();
      for (const task of tasks) {
        const pickup = coordinates(task.pickupLat, task.pickupLng);
        const dropoff = coordinates(task.dropoffLat, task.dropoffLng);
        if (!pickup || !dropoff) continue;
        const delayed = task.status === "DELAYED";
        L.polyline([pickup, dropoff], {
          color: delayed ? "#FB7185" : "#D4AF37",
          weight: 6,
          opacity: 0.3,
          interactive: false
        }).addTo(routes);
        L.polyline([pickup, dropoff], {
          color: delayed ? "#FB7185" : "#34D399",
          weight: 2.5,
          opacity: 0.9,
          interactive: false,
          dashArray: task.status === "COMPLETED" ? undefined : "6 8"
        }).addTo(routes);
      }
    }

    // First frame per event: fit everything, no animation.
    const eventKey = event?.id ?? "none";
    if (fittedEventRef.current !== eventKey) {
      fittedEventRef.current = eventKey;
      bounds.extend(layers.corridors.allBounds());
      if (bounds.isValid()) map.fitBounds(bounds.pad(0.15), { maxZoom: OVERVIEW_MAX_ZOOM, animate: false });
      else map.setView([RIYADH.centerLat, RIYADH.centerLng], RIYADH.defaultZoom, { animate: false });
    }
  }, [map, layers, displayedDrivers, tasks, event, l, isArabic]);

  // Live acknowledgements: the ring a convoy just entered pulses, so does the convoy.
  useLiveEvent(
    "geofence:transition",
    useCallback((payload) => {
      const current = layersRef.current;
      if (!current) return;
      current.geofences.pulseRing(payload.geofenceId ?? payload.geofenceCode, payload.currentRing);
      current.markers.pulse(`driver:${payload.driverId}`);
    }, [])
  );

  // Fullscreen: same DOM node, different box — Leaflet only needs a resize.
  useEffect(() => {
    if (!map) return;
    const timer = window.setTimeout(() => map.invalidateSize({ animate: false }), 260);
    return () => window.clearTimeout(timer);
  }, [map, isFullscreen]);

  // Fullscreen uses the Fullscreen API (top layer — immune to transformed or
  // backdrop-filtered ancestors, and what a projector wants). Where it is
  // unavailable (iOS Safari) the wrapper falls back to `position: fixed`.
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const toggleFullscreen = () => {
    const el = wrapperRef.current;
    if (!isFullscreen) {
      setIsFullscreen(true);
      if (el?.requestFullscreen) el.requestFullscreen({ navigationUI: "hide" }).catch(() => undefined);
      return;
    }
    setIsFullscreen(false);
    if (document.fullscreenElement === el) document.exitFullscreen().catch(() => undefined);
  };

  useEffect(() => {
    if (!isFullscreen) return;
    const el = wrapperRef.current;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      // Native fullscreen handles Escape itself and reports via fullscreenchange.
      if (e.key === "Escape" && document.fullscreenElement !== el) setIsFullscreen(false);
    };
    const onFullscreenChange = () => {
      if (document.fullscreenElement !== el) setIsFullscreen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, [isFullscreen]);

  const locateDriver = (driver: Driver) => {
    if (layersRef.current?.controller.focusConvoy(`driver:${driver.id}`)) onSelectDriver?.(driver);
  };

  const activeCount = displayedDrivers.filter((d) => d.status !== "OFFLINE").length;

  return (
    <div
      ref={wrapperRef}
      className={cn(
        "flex flex-col overflow-hidden bg-surface-1",
        isFullscreen
          ? "fixed inset-0 z-map-full h-screen w-screen rounded-none animate-fade-in"
          : cn("rounded-lg border border-hairline shadow-2xl", className)
      )}
      data-fullscreen={isFullscreen || undefined}
    >
      {/* Control bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline bg-surface-2/90 px-4 py-2.5 backdrop-blur-md">
        <div className="flex min-w-0 items-center gap-3">
          <StatusPill status="LIVE" size="sm" />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold tracking-tight text-gold-500">
              {isFullscreen ? l("Fullscreen Operational Tactical Map") : l("Sovereign Dark Tactical")}
            </p>
            <p className="font-tnum truncate text-xs text-ink-muted">
              {RIYADH.centerLat.toFixed(4)}° N, {RIYADH.centerLng.toFixed(4)}° E · {activeCount} {l("Active Fleets")} ·{" "}
              {tasks.length} {l("Missions")}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            ariaLabel={isArabic ? "تصفية حسب المنطقة" : "Filter by zone"}
            className="hidden md:flex"
            items={ZONES.map((z) => ({ id: z.id, label: isArabic ? z.ar : z.en }))}
            value={selectedZone}
            onChange={setSelectedZone}
          />
          <Segmented
            ariaLabel={isArabic ? "نمط الخريطة" : "Map style"}
            items={MODES.map((m) => ({
              id: m.id,
              label: isArabic ? m.ar : m.en,
              icon: <m.icon size={12} aria-hidden />
            }))}
            value={mapMode}
            onChange={setMapMode}
            compactLabels
          />
          <Button
            size="sm"
            variant={showGeofences ? "outline" : "ghost"}
            aria-pressed={showGeofences}
            onClick={() => setShowGeofences((prev) => !prev)}
            leadingIcon={<Radar size={13} aria-hidden />}
            title={isArabic ? "تبديل حلقات السياج الجغرافي" : "Toggle geofence rings"}
          >
            <span className="hidden sm:inline">{isArabic ? "حلقات السياج" : "Geofences"}</span>
          </Button>
          <Button
            size="sm"
            variant="gold"
            onClick={toggleFullscreen}
            leadingIcon={isFullscreen ? <Minimize2 size={13} aria-hidden /> : <Maximize2 size={13} aria-hidden />}
            title={isFullscreen ? l("Exit Fullscreen") : l("Expand Fullscreen Operational Deck")}
          >
            {isFullscreen ? l("Exit Fullscreen") : l("Fullscreen")}
          </Button>
        </div>
      </div>

      {/* Canvas + (fullscreen) sidebar. The map node is never remounted. */}
      <div className={cn("flex min-h-0 flex-1", isFullscreen ? "gap-3 p-3" : "")}>
        <div
          className={cn(
            "relative min-w-0 flex-1 overflow-hidden bg-surface-0",
            isFullscreen ? "rounded-lg border border-gold-500/30" : height
          )}
        >
          <div ref={containerRef} className="h-full w-full" />

          {!isFullscreen && (
            <div className="pointer-events-none absolute inset-x-3 bottom-3 z-[500] flex items-end justify-between gap-2">
              <div className="font-tnum flex items-center gap-3 rounded-lg border border-hairline bg-surface-1/85 px-3 py-1.5 text-xs text-ink-muted shadow-xl backdrop-blur-md">
                <span className="flex items-center gap-1.5 font-semibold text-ok">
                  <span className="size-2 rounded-full bg-ok" aria-hidden />
                  {activeCount} {l("Chauffeurs Active")}
                </span>
                <span className="text-ink-faint" aria-hidden>
                  |
                </span>
                <span>
                  {tasks.length} {l("Active Missions")}
                </span>
              </div>
            </div>
          )}
        </div>

        {isFullscreen && (
          <aside className="flex w-full max-w-sm flex-col gap-3 overflow-hidden lg:max-w-md">
            <IconTabNav
              tabs={FULLSCREEN_TABS}
              value={fullscreenTab}
              onChange={setFullscreenTab}
              layoutId="map-fullscreen-tabs"
              ariaLabel={isArabic ? "لوحات الخريطة" : "Map panels"}
            />
            <div className="flex-1 space-y-2 overflow-y-auto pe-1">
              {fullscreenTab === "drivers" &&
                displayedDrivers.map((driver) => {
                  const telemetry = layers?.markers.telemetry(`driver:${driver.id}`);
                  const vehicle = describeVehicle(driver, l);
                  const selected = selectedDriverId === driver.id;
                  return (
                    <div
                      key={driver.id}
                      className={cn(
                        "rounded-lg border bg-surface-2 p-3 transition-colors duration-base",
                        selected ? "border-gold-500/60" : "border-hairline"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs font-bold text-ink">{l(driver.user.name)}</span>
                        <span className="font-tnum rounded border border-ok/30 bg-ok/10 px-2 py-0.5 text-xs font-bold text-ok">
                          {telemetry && telemetry.speedKmh > 0 ? telemetry.speedKmh : "—"} {isArabic ? "كم/س" : "km/h"}
                        </span>
                      </div>
                      {vehicle && <p className="mt-1 text-xs text-ink-muted">{vehicle}</p>}
                      <div className="mt-2 flex items-center justify-between">
                        <StatusPill status={driver.status} size="sm" />
                        <Button size="sm" variant="ghost" onClick={() => locateDriver(driver)} leadingIcon={<Crosshair size={12} aria-hidden />}>
                          {isArabic ? "تحديد على الخريطة" : "Locate"}
                        </Button>
                      </div>
                    </div>
                  );
                })}

              {fullscreenTab === "guests" &&
                VIP_GUESTS_ROSTER.map((vip) => (
                  <div key={vip.name} className="rounded-lg border border-gold-500/20 bg-surface-2 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-xs font-bold text-ink">
                        <Crown size={13} className="text-gold-500" aria-hidden />
                        <span className="truncate">{vip.name}</span>
                      </span>
                      <Badge tone="gold">VIP</Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-gold-300">{vip.title}</p>
                    <div className="mt-2 space-y-1 border-t border-hairline pt-1.5 text-xs text-ink-muted">
                      <p className="flex items-center gap-1.5">
                        <Car size={11} className="shrink-0 text-gold-500" aria-hidden />
                        <span>
                          {l("Chauffeur")}: <span className="font-semibold text-ink">{vip.driver}</span> ({vip.vehicle})
                        </span>
                      </p>
                      <p className="flex items-center gap-1.5">
                        <MapPin size={11} className="shrink-0 text-info" aria-hidden />
                        <span>
                          {l("Corridor")}: <span className="text-ink">{vip.location}</span>
                        </span>
                      </p>
                      <p className="flex items-center gap-1.5 font-semibold text-ok">
                        <span className="inline-block size-1.5 rounded-full bg-ok" aria-hidden />
                        <span>{vip.status}</span>
                      </p>
                    </div>
                  </div>
                ))}

              {fullscreenTab === "tasks" &&
                tasks.map((task) => (
                  <div key={task.id} className="rounded-lg border border-hairline bg-surface-2 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-ink">{l(task.type)}</span>
                      <StatusPill status={task.status} size="sm" />
                    </div>
                    <p className="mt-1 text-xs text-ink-muted">
                      {l(task.pickupLocation)} → {l(task.dropoffLocation)}
                    </p>
                    <p className="mt-1 text-xs text-ink-faint">
                      {l("Owner")}: {l(task.ownerName)}
                    </p>
                  </div>
                ))}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

function describeVehicle(driver: Driver, l: (v: string | number | null | undefined) => string): string {
  const extra = driver as Driver & { vehicleModel?: string; plateNumber?: string };
  return [extra.vehicleModel ? l(extra.vehicleModel) : null, extra.plateNumber ?? null].filter(Boolean).join(" · ");
}

/** Small segmented control for the map chrome (zone filter, tile mode). */
function Segmented<T extends string>({
  items,
  value,
  onChange,
  ariaLabel,
  className,
  compactLabels = false
}: {
  items: { id: T; label: string; icon?: ReactNode }[];
  value: T;
  onChange: (id: T) => void;
  ariaLabel: string;
  className?: string;
  /** Hide text on narrow screens, keep icons. */
  compactLabels?: boolean;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className={cn("flex items-center gap-1 rounded-lg border border-hairline bg-surface-1 p-1", className)}>
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(item.id)}
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition-colors duration-base",
              active ? "bg-surface-3 text-gold-500 ring-1 ring-gold-500/40" : "text-ink-muted hover:text-ink"
            )}
          >
            {item.icon}
            <span className={compactLabels ? "hidden sm:inline" : undefined}>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
