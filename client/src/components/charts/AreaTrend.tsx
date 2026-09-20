import { useId, useMemo } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Series } from "../../lib/metrics";
import { axisDate, compact } from "../../lib/format";
import { chartColors, tickStyle, tooltipStyle } from "./theme";

/**
 * Cumulative trend (commission, spend). One or two series; gold primary,
 * pearl secondary. The only gradient permitted in the app is the area fill.
 */
export function AreaTrend({
  series,
  secondary,
  height = 220,
  valueFormatter = (v: number) => compact(v),
  labels
}: {
  series: Series;
  secondary?: Series;
  height?: number;
  valueFormatter?: (v: number) => string;
  labels?: { primary: string; secondary?: string };
}) {
  const id = useId();
  const c = chartColors();
  const data = useMemo(
    () =>
      series.dates.map((date, i) => ({
        date,
        primary: series.points[i],
        secondary: secondary?.points[i]
      })),
    [series, secondary]
  );
  const tt = tooltipStyle();

  return (
    // Time flows left→right regardless of document direction.
    <div style={{ direction: "ltr", height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`${id}-p`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={c.gold} stopOpacity={0.22} />
              <stop offset="100%" stopColor={c.gold} stopOpacity={0} />
            </linearGradient>
            <linearGradient id={`${id}-s`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={c.pearl} stopOpacity={0.12} />
              <stop offset="100%" stopColor={c.pearl} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={c.grid} strokeDasharray="0" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={axisDate}
            tick={tickStyle()}
            axisLine={false}
            tickLine={false}
            minTickGap={32}
            interval="preserveStartEnd"
          />
          <YAxis
            tickFormatter={(v) => valueFormatter(Number(v))}
            tick={tickStyle()}
            axisLine={false}
            tickLine={false}
            width={56}
          />
          <Tooltip
            {...tt}
            labelFormatter={(v) => axisDate(String(v))}
            formatter={(v, name) => [valueFormatter(Number(v)), name === "primary" ? labels?.primary ?? "" : labels?.secondary ?? ""]}
          />
          {secondary ? (
            <Area
              type="monotone"
              dataKey="secondary"
              stroke={c.pearl}
              strokeWidth={1.5}
              fill={`url(#${id}-s)`}
              dot={false}
              isAnimationActive
              animationDuration={900}
            />
          ) : null}
          <Area
            type="monotone"
            dataKey="primary"
            stroke={c.gold}
            strokeWidth={2}
            fill={`url(#${id}-p)`}
            dot={false}
            activeDot={{ r: 4, fill: c.gold, stroke: c.surface, strokeWidth: 2 }}
            isAnimationActive
            animationDuration={900}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
