import { useEffect, useState } from "react";
import { Car } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { GEOFENCE_RING_META, GEOFENCE_RING_ORDER } from "@shared/constants";
import type { Driver } from "@shared/domain";
import { cn } from "../../lib/cn";
import { DEMO_CONVOYS, type DemoDriverKey } from "../../lib/demo/data";
import type { ConvoySnapshot } from "../../lib/demo/director";
import { useLiveEvent } from "../../lib/liveEvents";
import { localizeText } from "../../lib/localize";
import { driverRingPosition } from "../../lib/metrics";
import { livePulse } from "../../lib/motion";
import { getMapController } from "../map";
import { EmptyState } from "../ui";
import { PanelFrame } from "./PanelFrame";
import { formatMmSs } from "./format";

type Row = {
  id: string;
  driverId: string | null;
  callsign: string;
  detail: string;
  /** 0 outside … 4 docked. */
  depth: number;
  speedKmh: number;
  etaSeconds: number;
  location: string | null;
  vipId: string | null;
};

const RING_LABEL: Record<string, { en: string; ar: string }> = {
  OUTSIDE: { en: "En route", ar: "في الطريق" },
  OUTER_APPROACH: { en: "Approach", ar: "الاقتراب" },
  STAGING_HOLD: { en: "Staging", ar: "الاصطفاف" },
  CURBSIDE_GATE: { en: "Curbside", ar: "الرصيف" },
  DOCKED_BAY: { en: "Docked", ar: "راسٍ" }
};

/**
 * Every convoy the room is watching. Under the director the five scripted
 * motorcades are listed with their callsigns; without one, every captain
 * with a fix is a row. Ring position is four dots, outer → docked, filled
 * as far as the innermost ring the convoy is inside.
 */
export function ConvoyRoster({
  isArabic,
  scripted,
  drivers,
  convoys,
  selectedDriverId,
  onSelectDriver,
  onSelectVip
}: {
  isArabic: boolean;
  scripted: boolean;
  drivers: Driver[];
  convoys: Record<DemoDriverKey, ConvoySnapshot>;
  selectedDriverId: string | null;
  /** Row click: select on the map and fly the camera to the convoy. */
  onSelectDriver: (driverId: string) => void;
  /** Row click on a convoy carrying a VIP also opens the dossier. */
  onSelectVip: (vipId: string) => void;
}) {
  const l = (value: string | number | null | undefined) =>
    localizeText(value, isArabic);
  const byId = new Map(drivers.map((d) => [d.id, d]));

  const rows: Row[] = scripted
    ? DEMO_CONVOYS.map((convoy) => {
        const snap = convoys[convoy.driver];
        const driver = snap.driverId ? byId.get(snap.driverId) : undefined;
        const ring = snap.ring;
        return {
          id: convoy.driver,
          driverId: snap.driverId,
          callsign: isArabic ? convoy.callsign.ar : convoy.callsign.en,
          detail: [
            driver ? l(driver.user.name) : null,
            isArabic ? convoy.vehicle.ar : convoy.vehicle.en,
            convoy.plate
          ]
            .filter(Boolean)
            .join(" · "),
          depth: ring === "OUTSIDE" ? 0 : GEOFENCE_RING_META[ring].order + 1,
          speedKmh: snap.speedKmh,
          etaSeconds: snap.etaSeconds,
          location: snap.location
            ? isArabic
              ? snap.location.ar
              : snap.location.en
            : null,
          vipId: convoy.vipId
        };
      })
    : drivers
        .filter(
          (d) =>
            d.currentLat != null &&
            d.currentLng != null &&
            d.status !== "OFFLINE"
        )
        .map((driver) => {
          const pos = driverRingPosition(driver);
          return {
            id: driver.id,
            driverId: driver.id,
            callsign: l(driver.user.name),
            detail: [vehicle(driver, l), l(driver.status)]
              .filter(Boolean)
              .join(" · "),
            depth: pos?.depth ?? 0,
            speedKmh: driver.speedKmh ?? 0,
            etaSeconds: 0,
            location: pos ? (isArabic ? pos.siteNameAr : pos.siteNameEn) : null,
            vipId: null
          };
        });

  return (
    <PanelFrame
      panelId="convoyRoster"
      title={isArabic ? "قائمة المواكب" : "Convoy roster"}
      icon={<Car />}
      trailing={<span className="font-tnum">{rows.length}</span>}
    >
      {rows.length === 0 ? (
        <EmptyState
          title={
            isArabic ? "لا توجد مواكب على الخريطة" : "No convoys on the map"
          }
          description={
            isArabic
              ? "تظهر المواكب عند وصول أول إحداثية."
              : "Convoys appear with their first fix."
          }
          className="h-full"
        />
      ) : (
        <ul className="divide-y divide-hairline">
          {rows.map((row) => (
            <ConvoyRow
              key={row.id}
              row={row}
              isArabic={isArabic}
              selected={
                row.driverId !== null && row.driverId === selectedDriverId
              }
              onSelect={() => {
                if (row.driverId) {
                  onSelectDriver(row.driverId);
                  getMapController()?.focusConvoy(`driver:${row.driverId}`);
                }
                if (row.vipId) onSelectVip(row.vipId);
              }}
            />
          ))}
        </ul>
      )}
    </PanelFrame>
  );
}

function ConvoyRow({
  row,
  isArabic,
  selected,
  onSelect
}: {
  row: Row;
  isArabic: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const reduced = useReducedMotion();
  const [pulseKey, setPulseKey] = useState(0);
  useLiveEvent("geofence:transition", (payload) => {
    if (
      payload.driverId === row.driverId &&
      payload.direction === "APPROACHING"
    )
      setPulseKey((k) => k + 1);
  });
  // A pulse is a one-shot acknowledgement; it never repeats on re-render.
  useEffect(() => {
    if (!pulseKey) return;
    const id = window.setTimeout(() => setPulseKey(0), 800);
    return () => window.clearTimeout(id);
  }, [pulseKey]);

  const ringName =
    row.depth === 0 ? "OUTSIDE" : GEOFENCE_RING_ORDER[row.depth - 1];
  const ringLabel = RING_LABEL[ringName];

  return (
    <li className="relative">
      {pulseKey && !reduced ? (
        <motion.span
          key={pulseKey}
          variants={livePulse}
          initial="initial"
          animate="animate"
          className="pointer-events-none absolute inset-y-1 inset-x-1 rounded-lg border border-gold-500/60"
          aria-hidden
        />
      ) : null}
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className={cn(
          "flex w-full items-center gap-3 px-3 py-2 text-start transition-colors duration-base focus-visible:outline-none focus-visible:shadow-focus",
          selected ? "bg-gold-500/10" : "hover:bg-white/5"
        )}
      >
        <div className="min-w-0 flex-1 leading-tight">
          <p
            className={cn(
              "truncate text-sm font-bold",
              selected ? "text-gold-300" : "text-ink"
            )}
          >
            {row.callsign}
          </p>
          <p className="truncate text-xs text-ink-muted">{row.detail}</p>
          {row.location ? (
            <p className="truncate text-xs text-ink-faint">{row.location}</p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          <RingDots
            depth={row.depth}
            label={isArabic ? ringLabel.ar : ringLabel.en}
          />
          <div
            className="flex items-baseline gap-2 font-tnum text-xs"
            dir="ltr"
          >
            <span
              className={cn(
                "font-bold",
                row.speedKmh > 0 ? "text-ok" : "text-ink-faint"
              )}
            >
              {row.speedKmh > 0 ? row.speedKmh : "—"}{" "}
              <span className="font-normal text-ink-muted">
                {isArabic ? "كم/س" : "km/h"}
              </span>
            </span>
            {row.etaSeconds > 0 ? (
              <span className="text-ink-muted">
                {isArabic ? "الوصول" : "ETA"}{" "}
                <span className="font-bold text-ink">
                  {formatMmSs(row.etaSeconds * 1000)}
                </span>
              </span>
            ) : null}
          </div>
        </div>
      </button>
    </li>
  );
}

function RingDots({ depth, label }: { depth: number; label: string }) {
  return (
    <span
      className="flex items-center gap-1.5"
      title={label}
      aria-label={label}
    >
      <span className="text-xs text-ink-muted">{label}</span>
      <span className="flex items-center gap-1" dir="ltr" aria-hidden>
        {GEOFENCE_RING_ORDER.map((ring, i) => {
          const filled = i < depth;
          return (
            <span
              key={ring}
              className={cn(
                "size-2 rounded-full transition-colors duration-slow",
                !filled && "bg-white/10"
              )}
              style={
                filled
                  ? { backgroundColor: GEOFENCE_RING_META[ring].color }
                  : undefined
              }
            />
          );
        })}
      </span>
    </span>
  );
}

/** Vehicle description when a captain record carries one (legacy fields, not in the Driver type). */
function vehicle(
  driver: Driver,
  l: (v: string | number | null | undefined) => string
): string | null {
  const extra = driver as Driver & {
    vehicleModel?: string;
    plateNumber?: string;
  };
  const parts = [
    extra.vehicleModel ? l(extra.vehicleModel) : null,
    extra.plateNumber ?? null
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}
