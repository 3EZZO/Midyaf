import { useTranslation } from "react-i18next";
import type { PortalKey } from "@shared/domain";
import { cn } from "../lib/cn";
import { portalIcons } from "./portalMeta";

/** Mobile/tablet portal switcher (< lg). Fixed to the bottom with safe-area padding. */
export function BottomTabBar({
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
  if (allowedPortals.length < 2) return null;
  return (
    <nav
      aria-label={isArabic ? "البوابات" : "Portals"}
      className="fixed inset-x-0 bottom-0 z-dock border-t border-hairline bg-surface-1/95 backdrop-blur lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="flex snap-x overflow-x-auto px-1" role="list">
        {allowedPortals.map((item) => {
          const Icon = portalIcons[item];
          const active = item === portal;
          return (
            <li key={item} className="min-w-[72px] flex-1 snap-start">
              <button
                type="button"
                onClick={() => setPortal(item)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-14 w-full flex-col items-center justify-center gap-1 px-1 text-xs font-medium",
                  "transition-colors duration-base focus-visible:outline-none focus-visible:shadow-focus",
                  active ? "text-gold-500" : "text-ink-muted"
                )}
              >
                <Icon className="size-5" aria-hidden />
                <span className="max-w-full truncate">{t(`portals.${item}`)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
