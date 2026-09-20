import { useId } from "react";
import { cn } from "../../lib/cn";

/**
 * Tiny inline trend line. Pure SVG, no axes. Colour follows `currentColor`
 * so the parent decides (gold by default in KpiTile).
 */
export function Sparkline({
  data,
  width = 96,
  height = 28,
  className,
  fill = true
}: {
  data: number[];
  width?: number;
  height?: number;
  className?: string;
  fill?: boolean;
}) {
  const id = useId();
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);
  const pad = 2;
  const points = data.map((v, i) => [i * stepX, pad + (height - pad * 2) * (1 - (v - min) / range)] as const);
  const line = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;
  const last = points[points.length - 1];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={cn("overflow-visible text-gold-500", className)}
      aria-hidden
      // Time flows left→right regardless of document direction.
      style={{ direction: "ltr" }}
    >
      {fill ? (
        <>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.25" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${id})`} />
        </>
      ) : null}
      <path d={line} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="2" fill="currentColor" />
    </svg>
  );
}
