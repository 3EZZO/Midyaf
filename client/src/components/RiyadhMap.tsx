import { useEffect, useRef } from "react";
import L, { type LayerGroup, type Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";
import { RadioTower } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Driver, Event, Task } from "@shared/domain";
import { RIYADH } from "@shared/constants";
import { Badge } from "./Badge";
import { isArabicLanguage, localizeText } from "../lib/localize";

const socketLayerLabels = [
  "Driver location updates",
  "Task status changes",
  "Guest arrivals",
  "Delay alerts"
];

export function RiyadhMap({
  event,
  drivers,
  tasks
}: {
  event?: Event;
  drivers: Driver[];
  tasks: Task[];
}) {
  const { t, i18n } = useTranslation();
  const isArabic = isArabicLanguage(i18n.language);
  const l = (value: string | number | null | undefined) =>
    localizeText(value, isArabic);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    const map = L.map(containerRef.current, {
      center: [RIYADH.centerLat, RIYADH.centerLng],
      zoom: RIYADH.defaultZoom,
      zoomControl: true,
      attributionControl: true
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);

    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;

    if (!map || !layer) {
      return;
    }

    layer.clearLayers();
    const bounds = L.latLngBounds([]);

    const venuePoint = coordinates(event?.venueLat, event?.venueLng);

    if (venuePoint) {
      addMarker({
        layer,
        bounds,
        lat: venuePoint.lat,
        lng: venuePoint.lng,
        label: l(event?.venue ?? "Venue"),
        tone: "venue"
      });
    }

    for (const task of tasks) {
      const pickupPoint = coordinates(task.pickupLat, task.pickupLng);
      const dropoffPoint = coordinates(task.dropoffLat, task.dropoffLng);

      if (pickupPoint) {
        addMarker({
          layer,
          bounds,
          lat: pickupPoint.lat,
          lng: pickupPoint.lng,
          label: `${l(task.pickupLocation)} · ${l(task.status)}`,
          tone: task.status === "DELAYED" ? "delay" : "task"
        });
      }

      if (dropoffPoint) {
        addMarker({
          layer,
          bounds,
          lat: dropoffPoint.lat,
          lng: dropoffPoint.lng,
          label: l(task.dropoffLocation),
          tone: "dropoff"
        });
      }

      if (pickupPoint && dropoffPoint) {
        L.polyline(
          [
            [pickupPoint.lat, pickupPoint.lng],
            [dropoffPoint.lat, dropoffPoint.lng]
          ],
          {
            color: task.status === "DELAYED" ? "#DC2626" : "#2D0A5F",
            weight: 3,
            opacity: 0.65,
            dashArray: task.status === "COMPLETED" ? undefined : "7 8"
          }
        ).addTo(layer);
      }
    }

    for (const driver of drivers) {
      const driverPoint = coordinates(driver.currentLat, driver.currentLng);

      if (driverPoint) {
        addMarker({
          layer,
          bounds,
          lat: driverPoint.lat,
          lng: driverPoint.lng,
          label: `${l(driver.user.name)} · ${l(driver.status)}`,
          tone: "driver"
        });
      }
    }

    if (bounds.isValid()) {
      map.fitBounds(bounds.pad(0.18), {
        maxZoom: 13,
        animate: false
      });
    } else {
      map.setView([RIYADH.centerLat, RIYADH.centerLng], RIYADH.defaultZoom);
    }
  }, [drivers, event, i18n.language, l, tasks]);

  return (
    <div className="overflow-hidden rounded-xl glass-card animate-fadeInUp">
      <div className="flex items-center justify-between border-b border-slate-100/80 bg-gradient-to-r from-white to-midyaf-pearl px-4 py-3.5">
        <div>
          <p className="text-sm font-extrabold text-midyaf-ink tracking-tight">
            {l("Live driver map")}
          </p>
          <p className="text-xs text-slate-500">
            {t("common.riyadhOnly")} · {RIYADH.centerLat}, {RIYADH.centerLng}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="live-dot" />
          <Badge tone="green">{l("OpenStreetMap active")}</Badge>
        </div>
      </div>

      <div className="relative h-[400px] overflow-hidden">
        <div ref={containerRef} className="h-full w-full" />

        <div className="absolute bottom-4 start-4 z-[500] rounded-xl bg-white/85 p-3.5 text-xs text-slate-600 shadow-card backdrop-blur-md border border-white/60">
          <div className="mb-2.5 flex items-center gap-2 font-bold text-midyaf-ink">
            <RadioTower size={14} />
            {l("Socket.IO live layer")}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {socketLayerLabels.map((label) => (
              <span key={label}>{l(label)}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function addMarker({
  layer,
  bounds,
  lat,
  lng,
  label,
  tone
}: {
  layer: LayerGroup;
  bounds: L.LatLngBounds;
  lat: number;
  lng: number;
  label: string;
  tone: "venue" | "task" | "dropoff" | "driver" | "delay";
}) {
  const point = L.latLng(lat, lng);

  bounds.extend(point);
  L.marker(point, {
    icon: L.divIcon({
      className: "",
      html: `<div class="midyaf-map-marker midyaf-map-marker-${tone}">${markerText(
        tone
      )}</div>`,
      iconSize: [34, 34],
      iconAnchor: [17, 17]
    })
  })
    .bindPopup(escapeHtml(label))
    .addTo(layer);
}

function coordinates(
  lat: number | null | undefined,
  lng: number | null | undefined
): { lat: number; lng: number } | null {
  return typeof lat === "number" && typeof lng === "number"
    ? { lat, lng }
    : null;
}

function markerText(tone: "venue" | "task" | "dropoff" | "driver" | "delay") {
  switch (tone) {
    case "venue":
      return "V";
    case "driver":
      return "D";
    case "dropoff":
      return "↓";
    case "delay":
      return "!";
    case "task":
    default:
      return "↑";
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
