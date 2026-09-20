import { useEffect, useState } from "react";
import { animate, useReducedMotion } from "motion/react";
import { cn } from "../../lib/cn";

/**
 * 270° arc gauge. Value 0–100. Segments (optional) draw proportional bands
 * around the track, e.g. active / idle / offline.
 */
export function ArcGauge({
  value,
  label,
  sublabel,
  size = 160,
  segments,
  tone = "gold",
  className
}: {
  value: number;
  label?: string;
  sublabel?: string;
  size?: number;
  segments?: Array<{ value: number; className: string }>;
  tone?: "gold" | "ok" | "warn" | "danger" | "info";
  className?: string;
}) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(reduced ? value : 0);
  useEffect(() => {
    if (reduced) {
      setShown(value);
      return;
    }
    const controls = animate(shown, value, { duration: 0.9, ease: [0.22, 1, 0.36, 1], onUpdate: setShown });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, reduced]);

  const stroke = 12;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const sweep = 270;
  const start = 135; // degrees, clockwise from +x
  const circumference = 2 * Math.PI * r;
  const arcLen = (sweep / 360) * circumference;
  const pct = Math.max(0, Math.min(100, shown)) / 100;

  const toneClass = { gold: "stroke-gold-500", ok: "stroke-ok", warn: "stroke-warn", danger: "stroke-danger", info: "stroke-info" }[tone];

  const total = segments?.reduce((s, x) => s + x.value, 0) ?? 0;
  let offset = 0;

  return (
    <div className={cn("relative inline-grid place-items-center", className)} style={{ width: size, height: size }} role="img" aria-label={`${label ?? ""} ${Math.round(value)}%`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ direction: "ltr" }} aria-hidden>
        <g transform={`rotate(${start} ${cx} ${cy})`}>
          <circle cx={cx} cy={cy} r={r} fill="none" className="stroke-surface-3" strokeWidth={stroke} strokeDasharray={`${arcLen} ${circumference}`} strokeLinecap="round" />
          {segments && total > 0
            ? segments.map((seg, i) => {
                const len = (seg.value / total) * arcLen;
                const el = (
                  <circle
                    key={i}
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill="none"
                    className={seg.className}
                    strokeWidth={stroke}
                    strokeDasharray={`${Math.max(0, len - 3)} ${circumference}`}
                    strokeDashoffset={-offset}
                    opacity={0.35}
                  />
                );
                offset += len;
                return el;
              })
            : null}
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            className={toneClass}
            strokeWidth={stroke}
            strokeDasharray={`${arcLen * pct} ${circumference}`}
            strokeLinecap="round"
          />
        </g>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="font-tnum text-display-sm leading-none text-ink">{Math.round(shown)}%</span>
        {label ? <span className="mt-1 text-xs font-semibold uppercase tracking-label text-ink-muted">{label}</span> : null}
        {sublabel ? <span className="text-xs text-ink-faint">{sublabel}</span> : null}
      </div>
    </div>
  );
}
