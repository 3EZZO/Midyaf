import { motion, useReducedMotion } from "motion/react";
import {
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { PortalKey } from "@shared/domain";
import { cn } from "../lib/cn";
import { RAIL_STORAGE_KEY, usePersistedCollapse } from "../lib/collapsibleStorage";
import { spring } from "../lib/motion";
import { portalCategory, portalIcons } from "./portalMeta";

export const PORTAL_RAIL_ID = "midyaf-portal-rail";
export const PORTAL_RAIL_LIST_ID = "midyaf-portal-rail-list";

export function railToggleCopy(collapsed: boolean, isArabic: boolean) {
  if (collapsed) {
    return {
      label: isArabic ? "توسيع القائمة الجانبية" : "Expand sidebar",
      short: isArabic ? "توسيع" : "Expand"
    };
  }
  return {
    label: isArabic ? "طي القائمة الجانبية" : "Collapse sidebar",
    short: isArabic ? "طي القائمة" : "Collapse"
  };
}

/**
 * Persistent portal rail on the inline-start edge (≥ lg).
 * Toggles smoothly between expanded (icon + label, 256px) and collapsed
 * (icon-only, 72px) with tooltips on every icon when collapsed.
 * Uses CSS logical edge/border utilities so RTL places it on the right and LTR on the left.
 * Below lg the BottomTabBar takes over.
 */
export function IconRail({
  allowedPortals,
  portal,
  setPortal,
  isArabic,
  collapsed: controlledCollapsed,
  onToggleCollapse,
  defaultCollapsed = false
}: {
  allowedPortals: PortalKey[];
  portal: PortalKey;
  setPortal: (portal: PortalKey) => void;
  isArabic: boolean;
  /** Controlled collapsed state (managed by ShellFrame so main padding stays in sync). */
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  /** Initial state when uncontrolled and no persisted preference exists. */
  defaultCollapsed?: boolean;
}) {
  const { t } = useTranslation();
  const reduced = useReducedMotion();
  const persisted = usePersistedCollapse(RAIL_STORAGE_KEY, defaultCollapsed);
  const collapsed = controlledCollapsed ?? persisted.collapsed;
  const handleToggle = onToggleCollapse ?? persisted.toggle;
  const toggleCopy = railToggleCopy(collapsed, isArabic);

  // In RTL the rail is on the right edge, so panel-right icons match the visual edge.
  const ToggleIcon = isArabic
    ? collapsed
      ? PanelRightOpen
      : PanelRightClose
    : collapsed
      ? PanelLeftOpen
      : PanelLeftClose;

  return (
    <nav
      id={PORTAL_RAIL_ID}
      aria-label={isArabic ? "البوابات" : "Portals"}
      data-rail-collapsed={collapsed ? "true" : "false"}
      className={cn(
        "fixed inset-y-0 start-0 z-dock hidden flex-col border-e border-hairline bg-surface-1 lg:flex",
        "transition-[width] duration-slow ease-out motion-reduce:transition-none",
        collapsed ? "w-[72px]" : "w-64"
      )}
    >
      {/* Brand header + collapse toggle */}
      <div
        className={cn(
          "flex h-16 shrink-0 items-center border-b border-hairline px-3",
          collapsed ? "justify-center" : "justify-between gap-2 px-4"
        )}
      >
        <a
          href="#"
          onClick={(e) => e.preventDefault()}
          className={cn(
            "flex min-w-0 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:shadow-focus",
            collapsed && "justify-center"
          )}
          aria-label={t("brand")}
          title={collapsed ? `${t("brand")} · ${t("brandArabic")}` : undefined}
        >
          <img
            src="/midyaf-icon.png"
            alt=""
            className="size-10 shrink-0 rounded-lg object-cover ring-1 ring-gold-500/40"
          />
          {!collapsed ? (
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-bold text-ink">{t("brand")}</span>
              <span className="truncate text-xs text-gold-500">{t("brandArabic")}</span>
            </span>
          ) : null}
        </a>

        {!collapsed ? (
          <button
            type="button"
            onClick={handleToggle}
            aria-expanded={!collapsed}
            aria-controls={PORTAL_RAIL_LIST_ID}
            aria-label={toggleCopy.label}
            title={toggleCopy.label}
            data-rail-toggle="collapse"
            className={cn(
              "grid size-8 shrink-0 place-items-center rounded-lg border border-hairline bg-surface-2 text-ink-muted",
              "transition-colors duration-base hover:border-gold-500/40 hover:bg-surface-3 hover:text-ink",
              "focus-visible:outline-none focus-visible:shadow-focus motion-reduce:transition-none"
            )}
          >
            <ToggleIcon className="size-4" aria-hidden />
          </button>
        ) : null}
      </div>

      {/* Portal items */}
      <ul
        id={PORTAL_RAIL_LIST_ID}
        className="flex flex-1 flex-col gap-1 px-2.5 py-3"
        role="list"
      >
        {allowedPortals.map((item) => {
          const Icon = portalIcons[item];
          const active = item === portal;
          const category = portalCategory[item];
          const portalLabel = t(`portals.${item}`);
          const categoryLabel = isArabic ? category.ar : category.en;
          const tooltipText = `${portalLabel} — ${categoryLabel}`;
          return (
            <li key={item} className="group/rail-item relative">
              <button
                type="button"
                onClick={() => setPortal(item)}
                aria-current={active ? "page" : undefined}
                aria-label={collapsed ? tooltipText : portalLabel}
                title={collapsed ? tooltipText : undefined}
                className={cn(
                  "relative flex h-12 w-full items-center rounded-lg text-start",
                  "transition-colors duration-base focus-visible:outline-none focus-visible:shadow-focus motion-reduce:transition-none",
                  collapsed ? "justify-center px-0" : "gap-2.5 px-2.5",
                  active ? "text-ink" : "text-ink-muted hover:bg-white/5 hover:text-ink"
                )}
              >
                {active ? (
                  <motion.span
                    layoutId="rail-active"
                    transition={reduced ? { duration: 0 } : spring}
                    className="absolute inset-0 rounded-lg bg-surface-3 ring-1 ring-inset ring-gold-500/40"
                    aria-hidden
                  />
                ) : null}
                <Icon
                  className={cn("relative size-5 shrink-0", active && "text-gold-500")}
                  strokeWidth={1.6}
                  aria-hidden
                />
                {!collapsed ? (
                  <span className="relative flex min-w-0 flex-col">
                    <span className="truncate text-sm font-semibold">{portalLabel}</span>
                    <span className="truncate text-xs text-ink-faint">{categoryLabel}</span>
                  </span>
                ) : null}
              </button>

              {/* Inline-end floating tooltip when collapsed (right in LTR, left in RTL). */}
              {collapsed ? (
                <span
                  role="tooltip"
                  aria-hidden="true"
                  className={cn(
                    "pointer-events-none absolute top-1/2 start-full z-palette ms-2 -translate-y-1/2 whitespace-nowrap",
                    "rounded-lg border border-hairline bg-surface-3 px-2.5 py-1.5 text-xs font-medium text-ink shadow-dropdown",
                    "opacity-0 transition-opacity duration-fast motion-reduce:transition-none",
                    "group-hover/rail-item:opacity-100 group-focus-within/rail-item:opacity-100"
                  )}
                >
                  <span className="block font-semibold text-ink">{portalLabel}</span>
                  <span className="block text-xs text-ink-muted">{categoryLabel}</span>
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>

      {/* Footer expand/collapse control */}
      <div className="shrink-0 border-t border-hairline p-3">
        <div className="group/rail-toggle relative">
          <button
            type="button"
            onClick={handleToggle}
            aria-expanded={!collapsed}
            aria-controls={PORTAL_RAIL_LIST_ID}
            aria-label={toggleCopy.label}
            title={toggleCopy.label}
            data-rail-toggle={collapsed ? "expand" : "collapse-footer"}
            className={cn(
              "flex h-10 w-full items-center rounded-lg border border-hairline bg-surface-2 text-xs font-semibold text-ink-muted",
              "transition-colors duration-base hover:border-gold-500/40 hover:bg-surface-3 hover:text-ink",
              "focus-visible:outline-none focus-visible:shadow-focus motion-reduce:transition-none",
              collapsed ? "justify-center px-0" : "gap-2.5 px-3"
            )}
          >
            <ToggleIcon className="size-4 shrink-0 text-gold-500" aria-hidden />
            {!collapsed ? <span className="truncate">{toggleCopy.short}</span> : null}
          </button>

          {collapsed ? (
            <span
              role="tooltip"
              aria-hidden="true"
              className={cn(
                "pointer-events-none absolute top-1/2 start-full z-palette ms-2 -translate-y-1/2 whitespace-nowrap",
                "rounded-lg border border-hairline bg-surface-3 px-2.5 py-1.5 text-xs font-medium text-ink shadow-dropdown",
                "opacity-0 transition-opacity duration-fast motion-reduce:transition-none",
                "group-hover/rail-toggle:opacity-100 group-focus-within/rail-toggle:opacity-100"
              )}
            >
              {toggleCopy.label}
            </span>
          ) : null}
        </div>
      </div>
    </nav>
  );
}
