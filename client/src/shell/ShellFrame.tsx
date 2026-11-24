import { Suspense, lazy, useEffect, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { Eye, RotateCcw, X } from "lucide-react";
import type { DemoPersonaDto, DemoStatusDto } from "@shared/demo";
import type {
  Driver,
  Event,
  MidyafData,
  PortalKey,
  Session,
  Task
} from "@shared/domain";
import { QuickNavigator } from "../components/QuickNavigator";
const SovereignCommandBridge = lazy(() =>
  import("../components/warroom").then((m) => ({ default: m.SovereignCommandBridge }))
);
import { cn } from "../lib/cn";
import { RAIL_STORAGE_KEY, usePersistedCollapse } from "../lib/collapsibleStorage";
import { activePersonaForStatus } from "../lib/investorDemoApi";
import { portalSwitch } from "../lib/motion";
import "../styles/signature.css";
import { BottomTabBar } from "./BottomTabBar";
import { IconRail } from "./IconRail";
import { demoPersonaScopeCopy, type DemoResetPhase } from "./InvestorDemoSwitcher";
import { InvestorStoryGuide } from "./InvestorStoryGuide";
import { PresenterShortcutsModal } from "./PresenterShortcutsModal";
import { TopBar } from "./TopBar";

export type ShellFrameProps = {
  children: ReactNode;
  isArabic: boolean;
  session: Session;
  allowedPortals: PortalKey[];
  portal: PortalKey;
  setPortal: (portal: PortalKey) => void;
  isDemoMode?: boolean;
  realtimeLog?: string[];
  event?: Event;
  drivers?: Driver[];
  /** Full snapshot; the War Room briefing grounds its prompt in it. */
  data?: MidyafData;
  tasks?: Task[];
  isWarRoomOpen?: boolean;
  setIsWarRoomOpen?: (open: boolean) => void;
  isQuickNavOpen: boolean;
  setIsQuickNavOpen: (open: boolean) => void;
  onExportPdf?: () => void;
  onSharePlan?: () => void;
  onLanguageToggle: () => void;
  onLogout: () => void;
  /** Initial desktop rail collapsed state when no persisted preference exists. */
  defaultRailCollapsed?: boolean;
  /** SIX-TASKS #6 / Qasr P2: One-click Investor Demo status, reset stage & handlers. */
  investorDemoStatus?: DemoStatusDto | null;
  investorDemoBusy?: boolean;
  demoResetPhase?: DemoResetPhase;
  onSwitchDemoPersona?: (persona: DemoPersonaDto) => Promise<void> | void;
  onCaptureDemoBaseline?: () => Promise<void> | void;
  onResetDemoData?: () => Promise<void> | void;
  /** Optional 1-click War Room launch from the Investor Story Guide. */
  onLaunchWarRoom?: () => void;
  /** Controlled presenter keyboard shortcuts cheat-sheet modal (`?`). */
  isShortcutsOpen?: boolean;
  setIsShortcutsOpen?: (open: boolean) => void;
};

/**
 * App chrome: icon rail (desktop) / bottom tab bar (mobile), de-crowded top bar,
 * optional "Viewing as" RBAC ribbon during Investor Demo persona switches,
 * and the portal outlet with a reading-direction slide between portals.
 */
export function ShellFrame({
  children,
  isArabic,
  session,
  allowedPortals,
  portal,
  setPortal,
  isDemoMode,
  realtimeLog = [],
  event,
  drivers,
  data,
  tasks,
  isWarRoomOpen,
  setIsWarRoomOpen,
  isQuickNavOpen,
  setIsQuickNavOpen,
  onExportPdf,
  onSharePlan,
  onLanguageToggle,
  onLogout,
  defaultRailCollapsed = false,
  investorDemoStatus,
  investorDemoBusy,
  demoResetPhase = "idle",
  onSwitchDemoPersona,
  onCaptureDemoBaseline,
  onResetDemoData,
  onLaunchWarRoom,
  isShortcutsOpen = false,
  setIsShortcutsOpen
}: ShellFrameProps) {
  const { collapsed: railCollapsed, toggle: toggleRail } = usePersistedCollapse(
    RAIL_STORAGE_KEY,
    defaultRailCollapsed
  );
  const [ribbonDismissedKey, setRibbonDismissedKey] = useState<string | null>(null);

  // A portal is a new page: start it at the top, not at the previous scroll offset.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [portal]);

  const activePersona = activePersonaForStatus(investorDemoStatus);
  const adminPersona = investorDemoStatus?.personas.find((p) => p.key === "admin" && p.available) ?? null;
  const activePersonaKey = activePersona?.key ?? null;
  const isSwitchedView = Boolean(
    investorDemoStatus?.enabled &&
      investorDemoStatus.canSwitch &&
      activePersona &&
      activePersona.key !== "admin"
  );
  const showRoleRibbon = isSwitchedView && ribbonDismissedKey !== activePersonaKey;
  const scopeText = demoPersonaScopeCopy(activePersonaKey, isArabic);

  return (
    <div
      className={cn(
        "min-h-screen bg-surface-1 text-ink",
        isArabic ? "font-arabic" : "font-english"
      )}
    >
      <IconRail
        allowedPortals={allowedPortals}
        portal={portal}
        setPortal={setPortal}
        isArabic={isArabic}
        collapsed={railCollapsed}
        onToggleCollapse={toggleRail}
      />

      <div
        className={cn(
          "flex min-h-screen flex-col transition-[padding] duration-slow ease-out motion-reduce:transition-none",
          railCollapsed ? "lg:ps-[72px]" : "lg:ps-64"
        )}
      >
        <TopBar
          isArabic={isArabic}
          session={session}
          portal={portal}
          isDemoMode={isDemoMode}
          ticker={realtimeLog[0]}
          railCollapsed={railCollapsed}
          onToggleRail={toggleRail}
          investorDemoStatus={investorDemoStatus}
          investorDemoBusy={investorDemoBusy}
          demoResetPhase={demoResetPhase}
          hotkeysDisabled={Boolean(isWarRoomOpen || isQuickNavOpen || isShortcutsOpen)}
          onSwitchDemoPersona={onSwitchDemoPersona}
          onCaptureDemoBaseline={onCaptureDemoBaseline}
          onResetDemoData={onResetDemoData}
          onOpenQuickNav={() => setIsQuickNavOpen(true)}
          onOpenWarRoom={() => setIsWarRoomOpen?.(true)}
          onLanguageToggle={onLanguageToggle}
          onLogout={onLogout}
        />

        {/* Qasr P2: "Viewing as" RBAC scope ribbon while presenting a switched demo persona */}
        {showRoleRibbon && activePersona ? (
          <div
            role="status"
            data-role-ribbon={activePersona.key}
            className="qasr-role-ribbon border-b border-gold-500/25 bg-surface-2/95 px-4 py-2 text-xs lg:px-6"
          >
            <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
                <span className="inline-flex items-center gap-1.5 font-semibold text-gold-300">
                  <Eye className="size-3.5 shrink-0 text-gold-500" strokeWidth={1.6} aria-hidden />
                  <span>
                    {isArabic
                      ? `تستعرض الآن بدور: ${activePersona.labelAr}`
                      : `Viewing as: ${activePersona.labelEn}`}
                  </span>
                </span>
                {scopeText ? (
                  <span className="text-ink-muted" data-role-ribbon-scope>
                    {scopeText}
                  </span>
                ) : null}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {adminPersona && onSwitchDemoPersona ? (
                  <button
                    type="button"
                    disabled={investorDemoBusy}
                    data-role-ribbon-return
                    onClick={() => void onSwitchDemoPersona(adminPersona)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md border border-gold-500/40 bg-gold-500/10 px-2.5 py-1 text-xs font-semibold text-gold-300",
                      "transition-colors duration-base hover:border-gold-500/70 hover:bg-gold-500/20",
                      "focus-visible:outline-none focus-visible:shadow-focus disabled:opacity-40 motion-reduce:transition-none"
                    )}
                  >
                    <RotateCcw className="size-3.5 shrink-0" aria-hidden />
                    <span>{isArabic ? "العودة للمالك" : "Return to Owner"}</span>
                  </button>
                ) : null}
                <button
                  type="button"
                  data-role-ribbon-dismiss
                  aria-label={isArabic ? "إخفاء شريط الدور" : "Dismiss role banner"}
                  onClick={() => setRibbonDismissedKey(activePersonaKey)}
                  className="grid size-7 place-items-center rounded-md text-ink-muted transition-colors duration-base hover:bg-white/5 hover:text-ink focus-visible:outline-none focus-visible:shadow-focus motion-reduce:transition-none"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* Optional collapsible 4-step Investor Story Guide (only when Investor Demo switcher is active) */}
        {investorDemoStatus?.enabled &&
        investorDemoStatus.canSwitch &&
        onSwitchDemoPersona ? (
          <InvestorStoryGuide
            status={investorDemoStatus}
            portal={portal}
            isArabic={isArabic}
            isWarRoomOpen={isWarRoomOpen}
            busy={investorDemoBusy}
            onSwitchPersona={onSwitchDemoPersona}
            onSelectPortal={setPortal}
            onLaunchWarRoom={onLaunchWarRoom}
            onOpenShortcuts={setIsShortcutsOpen ? () => setIsShortcutsOpen(true) : undefined}
          />
        ) : null}

        {/* Bottom padding clears the tab bar plus the phone's home-indicator inset. */}
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 pb-[calc(6rem+env(safe-area-inset-bottom))] lg:px-8 lg:pb-8">
          {/*
            Keyed by portal so the requested portal always mounts fresh (state reset,
            enter slide). Deliberately no AnimatePresence/exit gate: a "wait" exit
            could retain the previous portal invisibly and never mount the new one.
          */}
          <motion.div key={portal} variants={portalSwitch} initial="initial" animate="animate">
            {children}
          </motion.div>
        </main>
      </div>

      <BottomTabBar
        allowedPortals={allowedPortals}
        portal={portal}
        setPortal={setPortal}
        isArabic={isArabic}
      />

      {isWarRoomOpen ? (
        <Suspense fallback={null}>
          <SovereignCommandBridge
            isOpen={isWarRoomOpen}
            onClose={() => setIsWarRoomOpen?.(false)}
            isDemoMode={Boolean(isDemoMode)}
            event={event}
            drivers={drivers ?? []}
            session={session}
            data={data}
            tasks={tasks ?? []}
          />
        </Suspense>
      ) : null}

      <QuickNavigator
        isOpen={isQuickNavOpen}
        onClose={() => setIsQuickNavOpen(false)}
        isArabic={isArabic}
        activePortal={portal}
        allowedPortals={allowedPortals}
        onSelectPortal={setPortal}
        onToggleLanguage={onLanguageToggle}
        isDemoMode={isDemoMode}
        onOpenWarRoom={() => setIsWarRoomOpen?.(true)}
        onExportPdf={onExportPdf}
        onSharePlan={onSharePlan}
      />

      {setIsShortcutsOpen ? (
        <PresenterShortcutsModal
          open={isShortcutsOpen}
          onOpenChange={setIsShortcutsOpen}
          isArabic={isArabic}
        />
      ) : null}
    </div>
  );
}
