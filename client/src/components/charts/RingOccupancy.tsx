import type { RingOccupancy as Occupancy } from "../../lib/metrics";
import { statusMeta } from "@shared/statusMeta";
import { cn } from "../../lib/cn";

const ringLabels: Record<string, { en: string; ar: string; tone: string }> = {
  OUTER_APPROACH: { en: "Approach", ar: "الاقتراب", tone: "stroke-info" },
  STAGING_HOLD: { en: "Staging", ar: "الاصطفاف", tone: "stroke-warn" },
  CURBSIDE_GATE: { en: "Curbside", ar: "الرصيف", tone: "stroke-ok" },
  DOCKED_BAY: { en: "Docked", ar: "الرسو", tone: "stroke-gold-500" }
};

/**
 * Concentric rings mirroring the map geofences; each ring's stroke intensity
 * reflects how many convoys are inside it. Counts sit on the ring edge.
 */
export function RingOccupancyChart({
  occupancy,
  isArabic,
  size = 200,
  pulse,
  className
}: {
  occupancy: Occupancy;
  isArabic: boolean;
  size?: number;
  /** Ring type to pulse once (on a geofence transition). */
  pulse?: string | null;
  className?: string;
}) {
  const cx = size / 2;
  const cy = size / 2;
  // Outer ring first (largest radius) → draw outside-in.
  const rings = [...occupancy.rings].sort((a, b) => b.radiusMeters - a.radiusMeters);
  const step = (size / 2 - 12) / rings.length;
  const maxCount = Math.max(1, ...rings.map((r) => r.count));

  return (
    <figure className={cn("inline-flex flex-col items-center gap-2", className)}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ direction: "ltr" }} role="img" aria-label={isArabic ? occupancy.siteNameAr : occupancy.siteNameEn}>
        {rings.map((r, i) => {
          const radius = size / 2 - 12 - i * step;
          const meta = ringLabels[r.type] ?? { en: r.type, ar: r.type, tone: "stroke-neutral" };
          const intensity = 0.25 + (r.count / maxCount) * 0.75;
          return (
            <g key={r.type}>
              <circle cx={cx} cy={cy} r={radius} fill="none" className="stroke-surface-3" strokeWidth={1} />
              <circle
                cx={cx}
                cy={cy}
                r={radius}
                fill="none"
                className={cn(meta.tone, pulse === r.type && "animate-pulse")}
                strokeWidth={r.count ? 3 : 1}
                opacity={r.count ? intensity : 0.35}
              />
              <text x={cx + radius - 4} y={cy - 4} textAnchor="end" className="fill-ink" fontSize={12} fontWeight={700} style={{ fontVariantNumeric: "tabular-nums" }}>
                {r.count}
              </text>
            </g>
          );
        })}
        <circle cx={cx} cy={cy} r={3} className="fill-gold-500" />
      </svg>
      <figcaption className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
        {rings.map((r) => {
          const meta = ringLabels[r.type];
          return (
            <span key={r.type} className="flex items-center justify-between gap-2 text-ink-muted">
              <span>{isArabic ? meta?.ar : meta?.en}</span>
              <span className="font-tnum font-semibold text-ink">{r.count}</span>
            </span>
          );
        })}
        <span className="col-span-2 flex items-center justify-between text-ink-faint">
          <span>{isArabic ? statusMeta("OFFLINE").ar : "Outside"}</span>
          <span className="font-tnum">{occupancy.outside}</span>
        </span>
      </figcaption>
    </figure>
  );
}
