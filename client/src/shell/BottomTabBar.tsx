import { useState } from "react";
import { Check, LayoutGrid } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { PortalKey } from "@shared/domain";
import { Sheet } from "../components/ui/Dialog";
import { cn } from "../lib/cn";
import { portalCategory, portalIcons, portalMeta, portalShortLabel } from "./portalMeta";

export const MOBILE_PRIMARY_TAB_LIMIT = 4;

/**
 * Splits allowed portals into up to 4 primary bottom-dock tabs plus overflow
 * items surfaced inside the "More" sheet so 390px phones never clip mid-word.
 */
export function partitionBottomTabs(
  allowedPortals: PortalKey[],
  maxPrimary = MOBILE_PRIMARY_TAB_LIMIT
): { primary: PortalKey[]; overflow: PortalKey[] } {
  if (allowedPortals.length <= maxPrimary) {
    return { primary: allowedPortals, overflow: [] };
  }
  return {
    primary: allowedPortals.slice(0, maxPrimary),
    overflow: allowedPortals.slice(maxPrimary)
  };
}

/** Mobile/tablet portal switcher (< lg): up to 4 primary tabs + a "More" Sheet. */
export function BottomTabBar({
  allowedPortals,
  portal,
  setPortal,
  isArabic,
  defaultMoreOpen = false
}: {
  allowedPortals: PortalKey[];
  portal: PortalKey;
  setPortal: (portal: PortalKey) => void;
  isArabic: boolean;
  /** Allows SSR tests to render the "More" sheet directly. */
  defaultMoreOpen?: boolean;
}) {
  const { t } = useTranslation();
  const [moreOpen, setMoreOpen] = useState(defaultMoreOpen);

  if (allowedPortals.length < 2) return null;

  const { primary, overflow } = partitionBottomTabs(allowedPortals);
  const hasMore = overflow.length > 0;
  const activeInOverflow = overflow.includes(portal);
  const totalSlots = primary.length + (hasMore ? 1 : 0);

  return (
    <>
      <nav
        aria-label={isArabic ? "البوابات" : "Portals"}
        data-bottom-tab-bar
        className="fixed inset-x-0 bottom-0 z-dock border-t border-hairline bg-surface-1/95 backdrop-blur lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ul
          className="grid px-1"
          style={{ gridTemplateColumns: `repeat(${totalSlots}, minmax(0, 1fr))` }}
          role="list"
        >
          {primary.map((item) => {
            const Icon = portalIcons[item];
            const active = item === portal;
            const fullLabel = t(`portals.${item}`);
            const shortLabel = isArabic ? portalShortLabel[item].ar : portalShortLabel[item].en;
            return (
              <li key={item} className="min-w-0">
                <button
                  type="button"
                  onClick={() => setPortal(item)}
                  aria-current={active ? "page" : undefined}
                  aria-label={fullLabel}
                  title={fullLabel}
                  data-bottom-tab={item}
                  className={cn(
                    "relative flex h-14 w-full flex-col items-center justify-center gap-1 px-1 text-xs font-medium",
                    "transition-colors duration-base focus-visible:outline-none focus-visible:shadow-focus motion-reduce:transition-none",
                    active ? "text-gold-500" : "text-ink-muted hover:text-ink"
                  )}
                >
                  {active ? (
                    <span
                      className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-gold-500"
                      aria-hidden
                    />
                  ) : null}
                  <Icon className="size-5 shrink-0" strokeWidth={1.6} aria-hidden />
                  <span className="max-w-full truncate">{shortLabel}</span>
                </button>
              </li>
            );
          })}

          {hasMore ? (
            <li className="min-w-0">
              <button
                type="button"
                onClick={() => setMoreOpen(true)}
                aria-expanded={moreOpen}
                aria-haspopup="dialog"
                data-bottom-tab-more
                className={cn(
                  "relative flex h-14 w-full flex-col items-center justify-center gap-1 px-1 text-xs font-medium",
                  "transition-colors duration-base focus-visible:outline-none focus-visible:shadow-focus motion-reduce:transition-none",
                  activeInOverflow || moreOpen ? "text-gold-500" : "text-ink-muted hover:text-ink"
                )}
              >
                {activeInOverflow ? (
                  <span
                    className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-gold-500"
                    aria-hidden
                  />
                ) : null}
                <LayoutGrid className="size-5 shrink-0" strokeWidth={1.6} aria-hidden />
                <span className="max-w-full truncate">{isArabic ? "المزيد" : "More"}</span>
              </button>
            </li>
          ) : null}
        </ul>
      </nav>

      {hasMore ? (
        <Sheet
          open={moreOpen}
          onOpenChange={setMoreOpen}
          title={isArabic ? "بوابات إضافية" : "More portals"}
          description={
            isArabic
              ? "اختر بوابة للانتقال إليها مباشرة"
              : "Choose a portal to switch to directly"
          }
          closeLabel={isArabic ? "إغلاق" : "Close"}
          width="max-w-sm"
        >
          <ul className="space-y-1.5" role="list" data-bottom-more-list>
            {overflow.map((item) => {
              const Icon = portalIcons[item];
              const active = item === portal;
              const fullLabel = t(`portals.${item}`);
              const category = isArabic ? portalCategory[item].ar : portalCategory[item].en;
              const desc = isArabic ? portalMeta[item].descAr : portalMeta[item].descEn;
              return (
                <li key={item}>
                  <button
                    type="button"
                    data-bottom-more-item={item}
                    aria-current={active ? "page" : undefined}
                    onClick={() => {
                      setPortal(item);
                      setMoreOpen(false);
                    }}
                    className={cn(
                      "flex min-h-[52px] w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-start",
                      "transition-colors duration-base focus-visible:outline-none focus-visible:shadow-focus motion-reduce:transition-none",
                      active
                        ? "border-gold-500/45 bg-surface-3 text-ink"
                        : "border-hairline bg-surface-1/70 text-ink-muted hover:bg-surface-3/70 hover:text-ink"
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-9 shrink-0 place-items-center rounded-lg border border-hairline bg-surface-2",
                        active ? "text-gold-500" : "text-ink-muted"
                      )}
                    >
                      <Icon className="size-4" strokeWidth={1.6} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-ink">{fullLabel}</span>
                        <span className="shrink-0 text-xs text-ink-faint">{category}</span>
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-ink-muted">{desc}</span>
                    </span>
                    {active ? <Check className="size-4 shrink-0 text-gold-500" aria-hidden /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </Sheet>
      ) : null}
    </>
  );
}
