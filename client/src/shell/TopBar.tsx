import { AnimatePresence, motion } from "motion/react";
import { LogOut, Search, Shield, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { PortalKey, Role, Session } from "@shared/domain";
import { Button, IconButton } from "../components/ui/Button";
import { ConnectionDot } from "../components/ui/ConnectionDot";
import { Kbd } from "../components/ui/Kbd";
import { Tooltip } from "../components/ui/Tooltip";
import { cn } from "../lib/cn";
import { fade } from "../lib/motion";
import { portalIcons, portalMeta } from "./portalMeta";

// Privileged roles are shown by title rather than personal name on shared screens.
const roleDisplay: Partial<Record<Role, { en: string; ar: string; initials: string }>> = {
  SUPER_ADMIN: { en: "Sovereign System Administrator", ar: "المشرف العام للمنظومة", initials: "SA" },
  LOGISTICS_MANAGER: { en: "Logistics Operations Director", ar: "مدير العمليات اللوجستية", initials: "LD" }
};

export function displayNameFor(session: Session, isArabic: boolean) {
  const roleTitle = roleDisplay[session.user.role];
  const name = roleTitle ? (isArabic ? roleTitle.ar : roleTitle.en) : session.user.name;
  const initials =
    roleTitle?.initials ??
    (session.user.name
      .split(" ")
      .map((w: string) => w[0])
      .filter(Boolean)
      .join("")
      .slice(0, 2)
      .toUpperCase() || "OP");
  return { name, initials };
}

export function TopBar({
  isArabic,
  session,
  portal,
  isDemoMode,
  ticker,
  onOpenQuickNav,
  onOpenWarRoom,
  onLanguageToggle,
  onLogout
}: {
  isArabic: boolean;
  session: Session;
  portal: PortalKey;
  isDemoMode?: boolean;
  ticker?: string;
  onOpenQuickNav: () => void;
  onOpenWarRoom?: () => void;
  onLanguageToggle: () => void;
  onLogout: () => void;
}) {
  const { t } = useTranslation();
  const meta = portalMeta[portal];
  const Icon = portalIcons[portal];
  const { name, initials } = displayNameFor(session, isArabic);

  return (
    <header
      className="sticky top-0 z-header flex h-16 items-center gap-3 border-b border-hairline bg-surface-1/90 px-4 backdrop-blur lg:px-6"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      {/* Brand mark (mobile only — the rail carries it on desktop) */}
      <img src="/midyaf-icon.png" alt={t("brand")} className="size-9 rounded-lg object-cover ring-1 ring-gold-500/40 lg:hidden" />

      {/* Current portal */}
      <div className="flex min-w-0 items-center gap-3">
        <span className="hidden size-9 place-items-center rounded-lg border border-hairline bg-surface-2 text-gold-500 sm:grid">
          <Icon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-bold text-ink">{isArabic ? meta.titleAr : meta.titleEn}</h1>
          <p className="hidden truncate text-xs text-ink-muted md:block">{isArabic ? meta.descAr : meta.descEn}</p>
        </div>
      </div>

      {/* Live ticker */}
      <div className="hidden min-w-0 flex-1 items-center justify-center xl:flex">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={ticker ?? "idle"}
            variants={fade}
            initial="initial"
            animate="animate"
            exit="exit"
            className="inline-flex max-w-md items-center gap-2 truncate rounded-lg border border-hairline bg-surface-2 px-3 py-1.5 text-xs text-ink-muted"
          >
            <ConnectionDot />
            <span className="truncate">{ticker ?? (isArabic ? "البث المباشر متصل" : "Live telemetry connected")}</span>
          </motion.span>
        </AnimatePresence>
      </div>

      <div className="ms-auto flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onOpenQuickNav} className="gap-2 px-2.5">
          <Search className="size-4 text-gold-500" aria-hidden />
          <span className="hidden sm:inline">{isArabic ? "بحث سريع" : "Quick jump"}</span>
          <span className="hidden items-center gap-0.5 sm:flex">
            <Kbd>Ctrl</Kbd>
            <Kbd>K</Kbd>
          </span>
        </Button>

        {isDemoMode ? (
          <>
            <span className="hidden items-center gap-1.5 rounded-lg border border-warn/30 bg-warn/10 px-2.5 py-1 text-xs font-semibold text-warn md:inline-flex">
              <Sparkles className="size-3.5" aria-hidden />
              {isArabic ? "الوضع التجريبي نشط" : "DEMO MODE"}
            </span>
            <Button variant="outline" size="sm" onClick={onOpenWarRoom} className="gap-2">
              <Shield className="size-4" aria-hidden />
              <span>{isArabic ? "غرفة العمليات" : "War Room"}</span>
              <span className="hidden items-center gap-0.5 lg:flex">
                <Kbd>Ctrl</Kbd>
                <Kbd>Space</Kbd>
              </span>
            </Button>
          </>
        ) : null}

        <span className="xl:hidden">
          <ConnectionDot />
        </span>

        <Button variant="ghost" size="sm" onClick={onLanguageToggle}>
          {t("switchLanguage")}
        </Button>

        <Tooltip content={session.user.email}>
          <span className={cn("hidden items-center gap-2.5 rounded-lg border border-hairline bg-surface-2 py-1 pe-3 ps-1 md:flex")}>
            <span className="grid size-8 place-items-center rounded-lg bg-surface-3 text-xs font-bold text-gold-500 ring-1 ring-gold-500/30">
              {initials}
            </span>
            <span className="max-w-[16rem] truncate text-sm font-semibold text-ink">{name}</span>
          </span>
        </Tooltip>

        <IconButton label={t("logout")} variant="ghost" size="sm" onClick={onLogout}>
          <LogOut className="size-4" aria-hidden />
        </IconButton>
      </div>
    </header>
  );
}
