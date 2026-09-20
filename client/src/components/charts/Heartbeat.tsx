import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { cn } from "../../lib/cn";

/**
 * Rolling ECG-style line of a 0–100 metric (on-time %). A new sample is
 * appended every `intervalMs`; the line scrolls left. Pure SVG, no library.
 */
export function Heartbeat({
  value,
  intervalMs = 1000,
  samples = 60,
  width = 240,
  height = 48,
  className,
  label
}: {
  value: number;
  intervalMs?: number;
  samples?: number;
  width?: number;
  height?: number;
  className?: string;
  label?: string;
}) {
  const reduced = useReducedMotion();
  const [buffer, setBuffer] = useState<number[]>(() => new Array(samples).fill(value));
  const latest = useRef(value);
  latest.current = value;

  useEffect(() => {
    if (reduced) {
      setBuffer(new Array(samples).fill(value));
      return;
    }
    const id = setInterval(() => {
      // A tiny "beat" on top of the metric keeps the line alive without lying about the value.
      const beat = Math.sin(Date.now() / 180) * 0.8;
      setBuffer((b) => [...b.slice(1), Math.max(0, Math.min(100, latest.current + beat))]);
    }, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, reduced, samples, value]);

  const min = 0;
  const max = 100;
  const stepX = width / (samples - 1);
  const pts = buffer.map((v, i) => `${(i * stepX).toFixed(1)},${(height - 4 - ((v - min) / (max - min)) * (height - 8)).toFixed(1)}`);
  const tone = value >= 95 ? "text-ok" : value >= 85 ? "text-warn" : "text-danger";

  return (
    <div className={cn("flex items-center gap-3", className)} role="img" aria-label={`${label ?? ""} ${Math.round(value)}%`}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={tone} style={{ direction: "ltr" }} aria-hidden>
        <polyline points={pts.join(" ")} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" opacity={0.9} />
        <circle cx={width} cy={pts[pts.length - 1].split(",")[1]} r="2.5" fill="currentColor" />
      </svg>
      <div className="leading-tight">
        <div className={cn("font-tnum text-2xl font-bold", tone)}>{Math.round(value)}%</div>
        {label ? <div className="text-xs uppercase tracking-label text-ink-muted">{label}</div> : null}
      </div>
    </div>
  );
}
