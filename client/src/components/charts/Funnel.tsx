import { motion, useReducedMotion } from "motion/react";
import type { FunnelStage } from "../../lib/metrics";
import { integer } from "../../lib/format";
import { cn } from "../../lib/cn";

/**
 * Guest journey funnel as horizontal bars (widths relative to the first
 * stage). Bars animate from zero on mount and on value change.
 */
export function Funnel({ stages, isArabic, className }: { stages: FunnelStage[]; isArabic: boolean; className?: string }) {
  const reduced = useReducedMotion();
  const max = Math.max(1, stages[0]?.count ?? 1);
  const tones = ["bg-neutral", "bg-info", "bg-gold-500", "bg-gold-300", "bg-ok"];
  return (
    <ol className={cn("space-y-2.5", className)} aria-label={isArabic ? "رحلة الضيوف" : "Guest journey"}>
      {stages.map((s, i) => {
        const pct = (s.count / max) * 100;
        const prev = i > 0 ? stages[i - 1].count : s.count;
        const conv = prev ? Math.round((s.count / prev) * 100) : 0;
        return (
          <li key={s.key} className="grid grid-cols-[7rem_1fr_3.5rem] items-center gap-3 text-sm">
            <span className="truncate text-ink-muted">{isArabic ? s.ar : s.en}</span>
            <div className="h-6 overflow-hidden rounded bg-surface-1">
              <motion.div
                className={cn("h-full rounded", tones[i % tones.length])}
                initial={reduced ? false : { width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: reduced ? 0 : i * 0.06 }}
              />
            </div>
            <span className="text-end font-tnum font-semibold text-ink">
              {integer(s.count)}
              {i > 0 ? <span className="ms-1 text-xs font-normal text-ink-faint">{conv}%</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
