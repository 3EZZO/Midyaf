import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { statusMeta } from "@shared/statusMeta";
import { chartColors, tickStyle, tooltipStyle } from "./theme";

export type StackedRow = { label: string } & Record<string, number | string>;

/**
 * Horizontal stacked bars keyed by status. Colours come from statusMeta so a
 * status looks the same here as in every StatusPill.
 */
export function StackedBars({
  rows,
  keys,
  height = 220,
  isArabic,
  layout = "vertical"
}: {
  rows: StackedRow[];
  /** Status enum keys to stack, in order. */
  keys: string[];
  height?: number;
  isArabic: boolean;
  layout?: "vertical" | "horizontal";
}) {
  const c = chartColors();
  const toneColor = { ok: c.ok, warn: c.warn, danger: c.danger, info: c.info, neutral: c.neutral, gold: c.gold };
  const tt = tooltipStyle();
  const label = (k: string) => (isArabic ? statusMeta(k).ar : statusMeta(k).en);

  return (
    <div style={{ direction: "ltr", height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout={layout} margin={{ top: 4, right: 8, bottom: 0, left: 0 }} barCategoryGap={10}>
          <CartesianGrid stroke={c.grid} horizontal={layout === "horizontal"} vertical={layout === "vertical"} />
          {layout === "vertical" ? (
            <>
              <XAxis type="number" tick={tickStyle()} axisLine={false} tickLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="label" tick={tickStyle()} axisLine={false} tickLine={false} width={96} />
            </>
          ) : (
            <>
              <XAxis dataKey="label" tick={tickStyle()} axisLine={false} tickLine={false} />
              <YAxis tick={tickStyle()} axisLine={false} tickLine={false} allowDecimals={false} width={32} />
            </>
          )}
          <Tooltip {...tt} cursor={{ fill: "rgba(255,255,255,0.03)" }} formatter={(v, name) => [Number(v), label(String(name))]} />
          <Legend
            iconType="circle"
            iconSize={8}
            formatter={(v) => <span style={{ color: c.muted, fontSize: 12 }}>{label(String(v))}</span>}
          />
          {keys.map((k, i) => (
            <Bar
              key={k}
              dataKey={k}
              stackId="s"
              fill={toneColor[statusMeta(k).tone]}
              radius={i === keys.length - 1 ? (layout === "vertical" ? [0, 4, 4, 0] : [4, 4, 0, 0]) : 0}
              isAnimationActive
              animationDuration={700}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
