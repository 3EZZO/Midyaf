import { motion, useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";
import type { PortalKey } from "@shared/domain";
import { cn } from "../lib/cn";
import { spring } from "../lib/motion";
import { portalCategory, portalIcons } from "./portalMeta";

/**
 * Persistent portal rail on the inline-start edge (≥ lg). 72px of icons that
 * expands on hover/focus to reveal labels. Below lg the BottomTabBar takes over.
 */
export function IconRail({
  allowedPortals,
  portal,
  setPortal,
  isArabic
}: {
  allowedPortals: PortalKey[];
  portal: PortalKey;
  setPortal: (portal: PortalKey) => void;
  isArabic: boolean;
}) {
  const { t } = useTranslation();
  const reduced = useReducedMotion();

  return (
    <nav
      aria-label={isArabic ? "البوابات" : "Portals"}
      className={cn(
        "group/rail fixed inset-y-0 start-0 z-dock hidden w-[72px] flex-col border-e border-hairline bg-surface-1 lg:flex",
        "transition-[width] duration-slow ease-out hover:w-64 focus-within:w-64"
      )}
    >
      <a href="#" onClick={(e) => e.preventDefault()} className="flex h-16 shrink-0 items-center gap-3 px-4" aria-label={t("brand")}>
        <img src="/midyaf-icon.png" alt="" className="size-10 shrink-0 rounded-lg object-cover ring-1 ring-gold-500/40" />
        <span className="hidden min-w-0 flex-col group-hover/rail:flex group-focus-within/rail:flex">
          <span className="truncate text-sm font-bold text-ink">{t("brand")}</span>
          <span className="truncate text-xs text-gold-500">{t("brandArabic")}</span>
        </span>
      </a>

      <ul className="flex flex-1 flex-col gap-1 px-3 py-2" role="list">
        {allowedPortals.map((item) => {
          const Icon = portalIcons[item];
          const active = item === portal;
          const category = portalCategory[item];
          return (
            <li key={item}>
              <button
                type="button"
                onClick={(e) => {
                  setPortal(item);
                  // Mouse users: collapse the rail after choosing. Keyboard
                  // users never trigger this path from a pointer click.
                  if (e.detail > 0) e.currentTarget.blur();
                }}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-12 w-full items-center gap-3 rounded-lg px-3 text-start",
                  "transition-colors duration-base focus-visible:outline-none focus-visible:shadow-focus",
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
                <Icon className={cn("relative size-5 shrink-0", active && "text-gold-500")} aria-hidden />
                <span className="relative hidden min-w-0 flex-col group-hover/rail:flex group-focus-within/rail:flex">
                  <span className="truncate text-sm font-semibold">{t(`portals.${item}`)}</span>
                  <span className="truncate text-xs text-ink-faint">{isArabic ? category.ar : category.en}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
