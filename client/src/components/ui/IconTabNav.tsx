import { useId, type ReactNode } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { sectionStorageKey, usePersistedCollapse } from "../../lib/collapsibleStorage";
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
 * Horizontal icon tab strip with a sliding gold indicator and optional
 * collapsible group toggle. Fully keyboard operable (Tabs role + disclosure button).
 */
export function IconTabNav<T extends string>({
  tabs,
  value,
  onChange,
  layoutId = "icon-tab-indicator",
  storageId,
  collapsible = true,
  defaultCollapsed = false,
  isArabic: isArabicProp,
  className,
  ariaLabel
}: {
  tabs: ReadonlyArray<IconTab<T>>;
  value: T;
  onChange: (id: T) => void;
  /** Unique per tab strip when several are on one page. */
  layoutId?: string;
  /** Optional explicit persistence id; defaults to `layoutId`. */
  storageId?: string;
  /** Whether the tab bar can be collapsed to a compact active-tab bar (default: true). */
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  isArabic?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const { i18n } = useTranslation();
  const isArabic = isArabicProp ?? isArabicLanguage(i18n?.language);
  const reduced = useReducedMotion();
  const reactId = useId();
  const persistKey = collapsible ? sectionStorageKey(storageId ?? layoutId) : null;
  const { collapsed: persistedCollapsed, toggle } = usePersistedCollapse(persistKey, defaultCollapsed);
  const collapsed = collapsible ? persistedCollapsed : false;
  const tablistId = `${(storageId ?? layoutId).replace(/[^a-zA-Z0-9_-]/g, "-")}-tablist-${reactId.replace(/:/g, "")}`;

  const activeTab = tabs.find((tab) => tab.id === value) ?? tabs[0];
  const toggleLabel = collapsed
    ? isArabic
      ? "توسيع شريط الأقسام"
      : "Expand section tabs"
    : isArabic
      ? "طي شريط الأقسام"
      : "Collapse section tabs";

  return (
    <div
      data-tabnav-collapsed={collapsible ? (collapsed ? "true" : "false") : undefined}
      className={cn("rounded-lg border border-hairline bg-surface-1 p-1", className)}
    >
      {collapsible ? (
        <div
          className={cn(
            "flex items-center justify-between gap-2 px-2",
            collapsed ? "py-1" : "border-b border-hairline pb-1.5 pt-0.5 mb-1"
          )}
        >
          <div className="flex min-w-0 items-center gap-2 text-xs text-ink-muted">
            {activeTab ? (
              <>
                <activeTab.icon className="size-3.5 shrink-0 text-gold-500" aria-hidden />
                <span className="truncate font-semibold text-ink">
                  {isArabic ? activeTab.labelAr : activeTab.labelEn}
                </span>
                {activeTab.badge !== undefined ? <span className="shrink-0">{activeTab.badge}</span> : null}
              </>
            ) : ariaLabel ? (
              <span className="truncate font-semibold text-ink">{ariaLabel}</span>
            ) : null}
            {collapsed ? (
              <span className="text-ink-faint">
                · {isArabic ? `${tabs.length} أقسام` : `${tabs.length} tabs`}
              </span>
            ) : null}
          </div>

          <button
            type="button"
            onClick={toggle}
            aria-expanded={!collapsed}
            aria-controls={tablistId}
            aria-label={toggleLabel}
            title={toggleLabel}
            data-tabnav-toggle
            className={cn(
              "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-hairline bg-surface-2 px-2 text-xs font-semibold text-ink-muted",
              "transition-colors duration-base hover:border-gold-500/40 hover:bg-surface-3 hover:text-ink",
              "focus-visible:outline-none focus-visible:shadow-focus motion-reduce:transition-none"
            )}
          >
            <span>{collapsed ? (isArabic ? "عرض الأقسام" : "Show tabs") : isArabic ? "طي" : "Collapse"}</span>
            <ChevronDown
              className={cn(
                "size-3.5 transition-transform duration-base ease-out motion-reduce:transition-none",
                collapsed && "-rotate-90 rtl:rotate-90"
              )}
              aria-hidden
            />
          </button>
        </div>
      ) : null}

      <div
        id={tablistId}
        aria-hidden={collapsed || undefined}
        className={cn(
          "grid transition-[grid-template-rows,opacity,visibility] duration-base ease-out motion-reduce:transition-none",
          collapsed ? "grid-rows-[0fr] opacity-0 invisible" : "grid-rows-[1fr] opacity-100 visible"
        )}
      >
        <div className="overflow-hidden">
          <div
            role="tablist"
            aria-label={ariaLabel}
            className="flex flex-wrap gap-1"
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
              const label = isArabic ? tab.labelAr : tab.labelEn;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  tabIndex={active ? 0 : -1}
                  disabled={tab.disabled}
                  title={label}
                  onClick={() => onChange(tab.id)}
                  className={cn(
                    "relative inline-flex min-h-10 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold",
                    "transition-colors duration-base focus-visible:outline-none focus-visible:shadow-focus motion-reduce:transition-none",
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
                  <span className="relative">{label}</span>
                  {tab.badge !== undefined ? <span className="relative">{tab.badge}</span> : null}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
