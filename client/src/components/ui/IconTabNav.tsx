import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { isArabicLanguage } from "../../lib/localize";

export type IconTab<T extends string = string> = {
  id: T;
  icon: LucideIcon;
  labelEn: string;
  labelAr: string;
  /** Optional count / badge shown after the label. */
  badge?: ReactNode;
  disabled?: boolean;
};

/**
 * Horizontal icon tab strip with a sliding gold indicator. The pattern from
 * SilaOperationsDashboard, generalised. Fully keyboard operable (Tabs role).
 */
export function IconTabNav<T extends string>({
  tabs,
  value,
  onChange,
  layoutId = "icon-tab-indicator",
  className,
  ariaLabel
}: {
  tabs: ReadonlyArray<IconTab<T>>;
  value: T;
  onChange: (id: T) => void;
  /** Unique per tab strip when several are on one page. */
  layoutId?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const { i18n } = useTranslation();
  const isArabic = isArabicLanguage(i18n.language);
  const reduced = useReducedMotion();

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn("flex flex-wrap gap-1 rounded-lg border border-hairline bg-surface-1 p-1", className)}
      onKeyDown={(e) => {
        const idx = tabs.findIndex((t) => t.id === value);
        if (idx < 0) return;
        const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
        if (!dir) return;
        e.preventDefault();
        // In RTL the visual order is mirrored, so flip the step.
        const step = isArabic ? -dir : dir;
        let next = idx;
        for (let i = 0; i < tabs.length; i++) {
          next = (next + step + tabs.length) % tabs.length;
          if (!tabs[next].disabled) break;
        }
        onChange(tabs[next].id);
      }}
    >
      {tabs.map((tab) => {
        const active = tab.id === value;
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            disabled={tab.disabled}
            onClick={() => onChange(tab.id)}
            className={cn(
              "relative inline-flex min-h-10 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold",
              "transition-colors duration-base focus-visible:outline-none focus-visible:shadow-focus",
              "disabled:opacity-40",
              active ? "text-ink" : "text-ink-muted hover:text-ink hover:bg-white/5"
            )}
          >
            {active ? (
              <motion.span
                layoutId={layoutId}
                transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 40 }}
                className="absolute inset-0 rounded-lg bg-surface-3 ring-1 ring-inset ring-gold-500/40"
                aria-hidden
              />
            ) : null}
            <Icon className={cn("relative size-4", active ? "text-gold-500" : "")} aria-hidden />
            <span className="relative">{isArabic ? tab.labelAr : tab.labelEn}</span>
            {tab.badge !== undefined ? <span className="relative">{tab.badge}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
