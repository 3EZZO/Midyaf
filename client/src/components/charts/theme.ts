/**
 * Chart palette resolved from the CSS tokens at call time so charts follow
 * the design system. Recharts needs concrete colour strings.
 */
function token(name: string, alpha = 1) {
  if (typeof document === "undefined") return `rgb(201 164 76 / ${alpha})`;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v ? `rgb(${v} / ${alpha})` : `rgb(201 164 76 / ${alpha})`;
}

export const chartColors = () => ({
  gold: token("--gold-500"),
  goldSoft: token("--gold-500", 0.25),
  pearl: token("--ink"),
  muted: token("--ink-muted"),
  faint: token("--ink-faint"),
  // 8% ivory, drawn dashed: present but quiet on a projector.
  grid: token("--ink", 0.08),
  surface: token("--surface-2"),
  ok: token("--status-ok"),
  warn: token("--status-warn"),
  danger: token("--status-danger"),
  info: token("--status-info"),
  neutral: token("--status-neutral")
});

export const tickStyle = () => ({ fill: token("--ink-faint"), fontSize: 12, fontVariantNumeric: "tabular-nums" as const });

export const tooltipStyle = () => ({
  contentStyle: {
    background: token("--surface-2"),
    border: `1px solid rgb(246 244 238 / 0.12)`,
    borderRadius: 10,
    boxShadow: "inset 0 1px 0 rgba(246,244,238,0.06), 0 18px 40px rgba(0,0,0,0.6)",
    fontSize: 12,
    color: token("--ink")
  },
  labelStyle: { color: token("--ink-muted"), marginBottom: 4 },
  itemStyle: { color: token("--ink"), padding: 0 },
  cursor: { stroke: token("--gold-500", 0.35), strokeWidth: 1 }
});
