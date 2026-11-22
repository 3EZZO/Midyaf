import { useEffect, type ReactNode } from "react";
import { motion } from "motion/react";
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
import { SovereignCommandBridge } from "../components/warroom";
import { cn } from "../lib/cn";
import { RAIL_STORAGE_KEY, usePersistedCollapse } from "../lib/collapsibleStorage";
import { portalSwitch } from "../lib/motion";
import { BottomTabBar } from "./BottomTabBar";
import { IconRail } from "./IconRail";
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
  /** SIX-TASKS #6: One-click Investor Demo status & handlers. */
  investorDemoStatus?: DemoStatusDto | null;
  investorDemoBusy?: boolean;
  onSwitchDemoPersona?: (persona: DemoPersonaDto) => Promise<void> | void;
  onCaptureDemoBaseline?: () => Promise<void> | void;
  onResetDemoData?: () => Promise<void> | void;
};

/**
 * App chrome: icon rail (desktop) / bottom tab bar (mobile), slim top bar,
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
  onSwitchDemoPersona,
  onCaptureDemoBaseline,
  onResetDemoData
}: ShellFrameProps) {
  const { collapsed: railCollapsed, toggle: toggleRail } = usePersistedCollapse(
    RAIL_STORAGE_KEY,
    defaultRailCollapsed
  );

  // A portal is a new page: start it at the top, not at the previous scroll offset.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [portal]);

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
          onSwitchDemoPersona={onSwitchDemoPersona}
          onCaptureDemoBaseline={onCaptureDemoBaseline}
          onResetDemoData={onResetDemoData}
          onOpenQuickNav={() => setIsQuickNavOpen(true)}
          onOpenWarRoom={() => setIsWarRoomOpen?.(true)}
          onLanguageToggle={onLanguageToggle}
          onLogout={onLogout}
        />

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
    </div>
  );
}
