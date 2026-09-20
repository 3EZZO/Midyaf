import { useEffect, useRef, useState, type ReactNode } from "react";
import { Maximize2, TrendingDown, TrendingUp } from "lucide-react";
import { animate, useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { isArabicLanguage } from "../../lib/localize";
import { Surface } from "./Surface";
import { Sparkline } from "./Sparkline";

export type KpiFormat = "number" | "money" | "percent" | "compact" | "raw";

const sizes = {
  md: { value: "text-3xl", label: "text-xs", pad: "md" as const },
  lg: { value: "text-display-sm", label: "text-xs", pad: "md" as const },
  hero: { value: "text-display-md", label: "text-sm", pad: "lg" as const }
};

function formatValue(value: number, format: KpiFormat, locale: string) {
  switch (format) {
    case "money":
      return new Intl.NumberFormat(locale, { style: "currency", currency: "SAR", maximumFractionDigits: 0 }).format(value);
    case "percent":
      return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)}%`;
    case "compact":
      return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(value);
    case "number":
      return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
    default:
      return String(value);
  }
}

/** Animates from the previous value to the new one; honours reduced motion. */
function useCountUp(target: number, enabled: boolean) {
  const [display, setDisplay] = useState(target);
  const previous = useRef(target);
  useEffect(() => {
    if (!enabled) {
      setDisplay(target);
      previous.current = target;
      return;
    }
    const controls = animate(previous.current, target, {
      duration: 0.6,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setDisplay(v)
    });
    previous.current = target;
    return () => controls.stop();
  }, [target, enabled]);
  return display;
}

export type KpiTileProps = {
  label: ReactNode;
  /** Numeric values animate and format; strings render as-is. */
  value: number | string;
  format?: KpiFormat;
  detail?: ReactNode;
  /** Signed change, e.g. +18.4 → "▲ 18.4%". */
  delta?: number;
  deltaSuffix?: string;
  deltaTone?: "auto" | "ok" | "danger" | "neutral";
  sparkline?: number[];
  icon?: ReactNode;
  tone?: "none" | "gold" | "ok" | "warn" | "danger" | "info";
  size?: keyof typeof sizes;
  onClick?: () => void;
  /** Small caption when the series is derived rather than measured. */
  source?: "live" | "derived";
  className?: string;
};

export function KpiTile({
  label,
  value,
  format = "number",
  detail,
  delta,
  deltaSuffix = "%",
  deltaTone = "auto",
  sparkline,
  icon,
  tone = "none",
  size = "md",
  onClick,
  source,
  className
}: KpiTileProps) {
  const { i18n } = useTranslation();
  const isArabic = isArabicLanguage(i18n.language);
  const locale = isArabic ? "ar-SA-u-nu-latn" : "en-SA";
  const reduced = useReducedMotion();
  const numeric = typeof value === "number";
  const animated = useCountUp(numeric ? value : 0, numeric && !reduced);
  const shown = numeric ? formatValue(animated, format, locale) : value;
  const s = sizes[size];

  const resolvedDeltaTone =
    deltaTone === "auto" ? (delta === undefined || delta === 0 ? "neutral" : delta > 0 ? "ok" : "danger") : deltaTone;
  const deltaColor = { ok: "text-ok", danger: "text-danger", neutral: "text-ink-muted" }[resolvedDeltaTone];

  return (
    <Surface
      tone={tone}
      padding={s.pad}
      onClick={onClick}
      className={cn("group flex flex-col gap-3 overflow-hidden", className)}
      data-numeric
    >
      <div className="flex items-start justify-between gap-3">
        <p className={cn("font-semibold uppercase tracking-label text-ink-muted", s.label)}>{label}</p>
        <div className="flex items-center gap-2">
          {onClick ? (
            <Maximize2
              className="size-3.5 text-ink-faint transition-colors group-hover:text-gold-500"
              aria-label={isArabic ? "توسيع" : "Expand"}
            />
          ) : null}
          {icon ? (
            <span className="grid size-9 place-items-center rounded-lg border border-hairline bg-surface-1 text-gold-500">
              {icon}
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex items-end justify-between gap-3">
        <div className={cn("font-bold tabular-nums tracking-tight text-ink leading-none", s.value)}>{shown}</div>
        {sparkline?.length ? <Sparkline data={sparkline} className="shrink-0" /> : null}
      </div>

      {detail !== undefined || delta !== undefined || source ? (
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="truncate text-ink-muted">{detail}</span>
          <span className="flex shrink-0 items-center gap-2">
            {source === "derived" ? (
              <span className="text-ink-faint">{isArabic ? "مشتق" : "derived"}</span>
            ) : null}
            {delta !== undefined ? (
              <span className={cn("inline-flex items-center gap-0.5 font-semibold tabular-nums", deltaColor)}>
                {delta > 0 ? <TrendingUp className="size-3" /> : delta < 0 ? <TrendingDown className="size-3" /> : null}
                {delta > 0 ? "+" : ""}
                {new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(delta)}
                {deltaSuffix}
              </span>
            ) : null}
          </span>
        </div>
      ) : null}
    </Surface>
  );
}
