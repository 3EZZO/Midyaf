import { useCallback, useEffect, useMemo, useState } from "react";
import { useReducedMotion } from "motion/react";
import { GEOFENCE_RING_META } from "@shared/constants";
import type { Driver } from "@shared/domain";
import { cn } from "../../lib/cn";
import { useLiveEvent } from "../../lib/liveEvents";
import { radarPlots } from "../../lib/metrics";
import { RING_LABEL, pick, ringColor } from "./shared";
import { PanelFrame } from "./PanelFrame";

const SIZE = 220;
const R = SIZE / 2 - 10;
const BLIP_PULSE_MS = 1600;

/**
 * Polar plot of every captain within reach of one geofenced site. Ring radii
 * come from CONCENTRIC_GEOFENCES (log-scaled so the 35 m bay is visible);
 * bearings are true. A 4 s sweep rotates unless the OS asks for reduced
 * motion; a blip pulses once when its captain crosses a ring.
 */
export function RadarSweep({
  isArabic,
  drivers,
  siteCode,
  selectedDriverId
}: {
  isArabic: boolean;
  drivers: Driver[];
  siteCode: string;
  selectedDriverId: string | null;
}) {
  const reduced = useReducedMotion();
  const data = useMemo(
    () => radarPlots(drivers, siteCode),
    [drivers, siteCode]
  );
  const [pulsing, setPulsing] = useState<Record<string, number>>({});

  useLiveEvent(
    "geofence:transition",
    useCallback((payload) => {
      setPulsing((p) => ({ ...p, [payload.driverId]: Date.now() }));
    }, [])
  );
  useEffect(() => {
    const ids = Object.keys(pulsing);
    if (!ids.length) return;
    const id = window.setTimeout(() => {
      const cutoff = Date.now() - BLIP_PULSE_MS;
      setPulsing((p) =>
        Object.fromEntries(Object.entries(p).filter(([, at]) => at > cutoff))
      );
    }, BLIP_PULSE_MS);
    return () => window.clearTimeout(id);
  }, [pulsing]);

  const siteName = data ? (isArabic ? data.site.nameAr : data.site.nameEn) : "";
  const cx = SIZE / 2;
  const cy = SIZE / 2;

  return (
    <PanelFrame
      panelId="radar"
      title={isArabic ? "رادار النطاق" : "Ring radar"}
      bodyClassName="flex flex-col items-center px-3 pb-2 pt-1"
    >
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="aspect-square h-auto w-full max-w-[220px] max-h-[30vh]"
        style={{ direction: "ltr" }}
        role="img"
        aria-label={`${siteName}: ${data?.plots.length ?? 0} ${isArabic ? "مركبات" : "vehicles"}`}
      >
        <defs>
          <radialGradient id="radar-bg" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(212,175,55,0.10)" />
            <stop offset="100%" stopColor="rgba(212,175,55,0)" />
          </radialGradient>
          <linearGradient id="radar-sweep" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(212,175,55,0)" />
            <stop offset="100%" stopColor="rgba(212,175,55,0.35)" />
          </linearGradient>
        </defs>
        <circle
          cx={cx}
          cy={cy}
          r={R}
          fill="url(#radar-bg)"
          className="stroke-hairline"
          strokeWidth={1}
        />
        {/* Crosshair */}
        <line
          x1={cx}
          y1={cy - R}
          x2={cx}
          y2={cy + R}
          stroke="rgba(255,255,255,0.06)"
        />
        <line
          x1={cx - R}
          y1={cy}
          x2={cx + R}
          y2={cy}
          stroke="rgba(255,255,255,0.06)"
        />
        {/* Rings, outer → inner */}
        {data
          ? [...data.rings].reverse().map((ring) => {
              const meta = GEOFENCE_RING_META[ring.ring];
              return (
                <circle
                  key={ring.ring}
                  cx={cx}
                  cy={cy}
                  r={ring.radial * R}
                  fill="none"
                  stroke={meta.color}
                  strokeOpacity={0.55}
                  strokeWidth={meta.weight}
                  strokeDasharray={meta.dashArray ?? undefined}
                />
              );
            })
          : null}
        {/* Sweep */}
        {!reduced ? (
          <g
            className="animate-radar-sweep"
            style={{ transformOrigin: `${cx}px ${cy}px` }}
          >
            <path
              d={`M ${cx} ${cy} L ${cx + R} ${cy} A ${R} ${R} 0 0 0 ${cx + R * Math.cos(-Math.PI / 3)} ${cy + R * Math.sin(-Math.PI / 3)} Z`}
              fill="url(#radar-sweep)"
            />
            <line
              x1={cx}
              y1={cy}
              x2={cx + R}
              y2={cy}
              stroke="#D4AF37"
              strokeOpacity={0.8}
              strokeWidth={1.2}
            />
          </g>
        ) : null}
        {/* Blips */}
        {data?.plots.map((p) => {
          const a = ((p.bearingDeg - 90) * Math.PI) / 180;
          const x = cx + p.radial * R * Math.cos(a);
          const y = cy + p.radial * R * Math.sin(a);
          const color = ringColor(p.ring);
          const selected = p.driverId === selectedDriverId;
          const pulse = Boolean(pulsing[p.driverId]);
          return (
            <g
              key={p.driverId}
              transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}
            >
              {pulse ? (
                <circle
                  r={4}
                  fill="none"
                  stroke={color}
                  strokeWidth={1.5}
                  className="radar-blip-pulse"
                />
              ) : null}
              <circle
                r={selected ? 5 : 3.5}
                fill={color}
                stroke={selected ? "#F2D575" : "#03050C"}
                strokeWidth={selected ? 2 : 1}
              />
              <title>{`${p.name} · ${pick(RING_LABEL[p.ring], isArabic)} · ${p.distanceMeters} m`}</title>
            </g>
          );
        })}
        <circle cx={cx} cy={cy} r={2.5} fill="#D4AF37" />
      </svg>
      <div
        className="mt-1 w-full truncate text-center text-xs font-semibold text-ink-muted"
        title={siteName}
      >
        {siteName}
      </div>
      <div className="mt-1 flex w-full flex-wrap justify-center gap-x-3 gap-y-0.5 text-xs text-ink-faint">
        {data?.rings.map((r) => (
          <span key={r.ring} className={cn("inline-flex items-center gap-1")}>
            <span
              className="size-1.5 rounded-full"
              style={{ background: ringColor(r.ring) }}
            />
            {pick(RING_LABEL[r.ring], isArabic)}
          </span>
        ))}
      </div>
    </PanelFrame>
  );
}
