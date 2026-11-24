import { AnimatePresence, motion } from "motion/react";
import {
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Projector,
  RotateCcw,
  Search,
  Shield,
  Sparkles
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { DemoPersonaDto, DemoStatusDto } from "@shared/demo";
import type { PortalKey, Role, Session } from "@shared/domain";
import { Button, IconButton } from "../components/ui/Button";
import { PushNotificationToggle } from "../components/PushNotificationToggle";
import { ConnectionDot, connectionLabel } from "../components/ui/ConnectionDot";
import { Kbd } from "../components/ui/Kbd";
import { Tooltip } from "../components/ui/Tooltip";
import { cn } from "../lib/cn";
import { fade } from "../lib/motion";
import { toggleProjectorMode, useProjectorMode } from "../lib/projectorMode";
import { useSocketContext } from "../lib/useSocket";
import { PORTAL_RAIL_ID, railToggleCopy } from "./IconRail";
import { InvestorDemoSwitcher, type DemoResetPhase } from "./InvestorDemoSwitcher";
import { portalIcons, portalMeta, portalShortLabel } from "./portalMeta";

// Privileged roles are shown by title rather than personal name on shared screens.
const roleDisplay: Partial<Record<Role, { en: string; ar: string; initials: string }>> = {
  SUPER_ADMIN: { en: "System Administrator", ar: "المشرف العام للمنظومة", initials: "SA" },
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

export function resetStageCopy(phase: DemoResetPhase, isArabic: boolean): string | null {
  if (phase === "restoring") {
    return isArabic ? "جارٍ استعادة نقطة البداية…" : "Restoring baseline…";
  }
  if (phase === "refreshing") {
    return isArabic ? "جارٍ تحديث البوابات…" : "Refreshing portals…";
  }
  return null;
}

export function TopBar({
  isArabic,
  session,
  portal,
  isDemoMode,
  ticker,
  railCollapsed,
  onToggleRail,
  investorDemoStatus,
  investorDemoBusy,
  demoResetPhase = "idle",
  hotkeysDisabled = false,
  onSwitchDemoPersona,
  onCaptureDemoBaseline,
  onResetDemoData,
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
  railCollapsed?: boolean;
  onToggleRail?: () => void;
  investorDemoStatus?: DemoStatusDto | null;
  investorDemoBusy?: boolean;
  demoResetPhase?: DemoResetPhase;
  hotkeysDisabled?: boolean;
  onSwitchDemoPersona?: (persona: DemoPersonaDto) => Promise<void> | void;
  onCaptureDemoBaseline?: () => Promise<void> | void;
  onResetDemoData?: () => Promise<void> | void;
  onOpenQuickNav: () => void;
  onOpenWarRoom?: () => void;
  onLanguageToggle: () => void;
  onLogout: () => void;
}) {
  const { t } = useTranslation();
  const meta = portalMeta[portal];
  const shortTitle = portalShortLabel[portal];
  const Icon = portalIcons[portal];
  const { name, initials } = displayNameFor(session, isArabic);
  const { status } = useSocketContext();
  const projectorOn = useProjectorMode();
  const projectorLabel = isArabic ? "وضع العرض" : "Projector mode";
  const railCopy = railToggleCopy(Boolean(railCollapsed), isArabic);
  const RailIcon = isArabic
    ? railCollapsed
      ? PanelRightOpen
      : PanelRightClose
    : railCollapsed
      ? PanelLeftOpen
      : PanelLeftClose;
  // Without a live ticker the pill states the link honestly: it must never
  // claim "connected" while the server is unreachable.
  const idleText =
    status === "connected"
      ? isArabic
        ? "البث المباشر متصل"
        : "Live telemetry connected"
      : connectionLabel(status, isArabic);
  const resetLabel = resetStageCopy(demoResetPhase, isArabic);

  return (
    <header
      className="sticky top-0 z-header flex items-center gap-2.5 border-b border-hairline bg-surface-1/90 px-3 backdrop-blur sm:gap-3 sm:px-4 lg:px-6"
      // The bar's 4rem content row sits below the notch inset; the background
      // spans both, so controls never paint outside it.
      style={{ paddingTop: "env(safe-area-inset-top)", height: "calc(4rem + env(safe-area-inset-top))" }}
    >
      {/* Desktop rail collapse/expand shortcut (mirrors the rail's own toggle) */}
      {onToggleRail ? (
        <button
          type="button"
          onClick={onToggleRail}
          aria-expanded={!railCollapsed}
          aria-controls={PORTAL_RAIL_ID}
          aria-label={railCopy.label}
          title={railCopy.label}
          data-topbar-rail-toggle
          className={cn(
            "hidden size-9 shrink-0 place-items-center rounded-lg border border-hairline bg-surface-2 text-ink-muted lg:grid",
            "transition-colors duration-base hover:border-gold-500/40 hover:bg-surface-3 hover:text-ink",
            "focus-visible:outline-none focus-visible:shadow-focus motion-reduce:transition-none"
          )}
        >
          <RailIcon className="size-4" strokeWidth={1.6} aria-hidden />
        </button>
      ) : null}

      {/* Brand mark (mobile only — the rail carries it on desktop) */}
      <img
        src="/midyaf-icon.png"
        alt={t("brand")}
        className="size-9 shrink-0 rounded-lg object-cover ring-1 ring-gold-500/40 lg:hidden"
      />

      {/* Current portal — breathes cleanly at 390px and 1440px without crowding */}
      <div className="flex min-w-0 flex-1 items-center gap-2.5 sm:gap-3">
        <span className="hidden size-9 shrink-0 place-items-center rounded-lg border border-hairline bg-surface-2 text-gold-500 sm:grid">
          <Icon className="size-4" strokeWidth={1.6} aria-hidden />
        </span>
        <div className="min-w-0">
          {/* Not an h1: each page's PortalHero owns the single h1. */}
          <p className="truncate text-sm font-bold text-ink">
            <span className="sm:hidden">{isArabic ? shortTitle.ar : shortTitle.en}</span>
            <span className="hidden sm:inline">{isArabic ? meta.titleAr : meta.titleEn}</span>
          </p>
          <p className="hidden truncate text-xs text-ink-muted 2xl:block">
            {isArabic ? meta.descAr : meta.descEn}
          </p>
        </div>
      </div>

      {/* Staged reset status pill (replaces ticker while a baseline reset is in flight) */}
      {resetLabel ? (
        <div
          role="status"
          aria-live="polite"
          data-demo-reset-stage={demoResetPhase}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-gold-500/45 bg-gold-500/12 px-2.5 py-1.5 text-xs font-semibold text-gold-300"
        >
          <RotateCcw className="size-3.5 shrink-0 animate-spin text-gold-500 motion-reduce:animate-none" aria-hidden />
          <span className="whitespace-nowrap">{resetLabel}</span>
        </div>
      ) : (
        /* Live ticker only on wide 2xl displays so 1440px stays uncrowded */
        <div className="hidden min-w-0 shrink items-center justify-center 2xl:flex">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={ticker ?? status}
              variants={fade}
              initial="initial"
              animate="animate"
              exit="exit"
              className="inline-flex max-w-sm items-center gap-2 truncate rounded-lg border border-hairline bg-surface-2 px-3 py-1.5 text-xs text-ink-muted"
            >
              <ConnectionDot />
              <span className="truncate">{ticker ?? idleText}</span>
            </motion.span>
          </AnimatePresence>
        </div>
      )}

      {/* Right-aligned utility controls */}
      <div className="ms-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
        {investorDemoStatus?.canSwitch &&
        onSwitchDemoPersona &&
        onCaptureDemoBaseline &&
        onResetDemoData ? (
          <InvestorDemoSwitcher
            status={investorDemoStatus}
            isArabic={isArabic}
            busy={investorDemoBusy}
            hotkeysDisabled={hotkeysDisabled}
            onSwitchPersona={onSwitchDemoPersona}
            onCaptureBaseline={onCaptureDemoBaseline}
            onResetDemo={onResetDemoData}
          />
        ) : null}

        <Button
          variant="ghost"
          size="sm"
          onClick={onOpenQuickNav}
          aria-label={isArabic ? "بحث سريع (Ctrl+K)" : "Quick jump (Ctrl+K)"}
          title={isArabic ? "بحث سريع (Ctrl+K)" : "Quick jump (Ctrl+K)"}
          className="gap-1.5 px-2 xl:px-2.5"
        >
          <Search className="size-4 text-gold-500" strokeWidth={1.6} aria-hidden />
          <span className="hidden xl:inline">{isArabic ? "بحث سريع" : "Quick jump"}</span>
          <span className="hidden items-center gap-0.5 xl:flex">
            <Kbd>Ctrl</Kbd>
            <Kbd>K</Kbd>
          </span>
        </Button>

        {/* Qasr P5 / P2: Compact projector mode toggle (hidden on phones) */}
        <Tooltip
          content={
            <span className="flex items-center gap-2">
              {projectorLabel}
              <Kbd>Ctrl</Kbd>
              <Kbd>Shift</Kbd>
              <Kbd>P</Kbd>
            </span>
          }
        >
          <button
            type="button"
            onClick={() => toggleProjectorMode()}
            aria-label={projectorLabel}
            aria-pressed={projectorOn}
            title={`${projectorLabel} (Ctrl+Shift+P)`}
            data-projector-toggle
            className={cn(
              "hidden size-9 shrink-0 place-items-center rounded-lg border transition-colors duration-base md:grid",
              "focus-visible:outline-none focus-visible:shadow-focus motion-reduce:transition-none",
              projectorOn
                ? "border-gold-500/60 bg-gold-500/15 text-gold-300 shadow-glow"
                : "border-hairline bg-surface-2 text-ink-muted hover:border-gold-500/40 hover:bg-surface-3 hover:text-ink"
            )}
          >
            <Projector className="size-4" strokeWidth={1.6} aria-hidden />
          </button>
        </Tooltip>

        {isDemoMode ? (
          <>
            <span className="hidden whitespace-nowrap items-center gap-1.5 rounded-lg border border-warn/30 bg-warn/10 px-2.5 py-1 text-xs font-semibold text-warn 2xl:inline-flex">
              <Sparkles className="size-3.5" aria-hidden />
              {isArabic ? "الوضع التجريبي نشط" : "DEMO MODE"}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={onOpenWarRoom}
              className="gap-1.5"
              aria-label={isArabic ? "غرفة العمليات" : "War Room"}
            >
              <Shield className="size-4" strokeWidth={1.6} aria-hidden />
              {/* Icon-only on phones so the fixed-height bar fits; the name stays on aria-label. */}
              <span className="hidden sm:inline">{isArabic ? "غرفة العمليات" : "War Room"}</span>
              <span className="hidden items-center gap-0.5 xl:flex">
                <Kbd>Ctrl</Kbd>
                <Kbd>Space</Kbd>
              </span>
            </Button>
          </>
        ) : null}

        <span className="2xl:hidden">
          <ConnectionDot />
        </span>

        <PushNotificationToggle session={session} isArabic={isArabic} />

        <Button
          variant="ghost"
          size="sm"
          onClick={onLanguageToggle}
          aria-label={t("switchLanguage")}
          className="px-2 sm:px-2.5"
        >
          {/* Compact on phones so Logout never gets pushed off a 390px screen. */}
          <span className="sm:hidden" aria-hidden>
            {isArabic ? "EN" : "ع"}
          </span>
          <span className="hidden sm:inline">{t("switchLanguage")}</span>
        </Button>

        <Tooltip content={session.user.email}>
          <span className={cn("hidden items-center gap-2 rounded-lg border border-hairline bg-surface-2 py-1 pe-2.5 ps-1 lg:flex")}>
            <span className="grid size-7 place-items-center rounded-md bg-surface-3 text-xs font-bold text-gold-500 ring-1 ring-gold-500/30">
              {initials}
            </span>
            <span className="max-w-[11rem] truncate text-xs font-semibold text-ink xl:max-w-[13rem]">
              {name}
            </span>
          </span>
        </Tooltip>

        <IconButton label={t("logout")} variant="ghost" size="sm" onClick={onLogout}>
          <LogOut className="size-4" strokeWidth={1.6} aria-hidden />
        </IconButton>
      </div>

      {/* Brass reset progress line pinned flush to the bottom hairline of the TopBar */}
      {demoResetPhase !== "idle" ? (
        <div
          role="progressbar"
          aria-busy="true"
          aria-label={resetLabel ?? undefined}
          data-demo-reset-progress={demoResetPhase}
          className="qasr-reset-track pointer-events-none absolute inset-x-0 bottom-0 h-0.5"
        >
          <span className="qasr-reset-bar" data-stage={demoResetPhase} />
        </div>
      ) : null}
    </header>
  );
}
