import type { ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
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
  onLogout
}: ShellFrameProps) {
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
      />

      <div className="flex min-h-screen flex-col lg:ps-[72px]">
        <TopBar
          isArabic={isArabic}
          session={session}
          portal={portal}
          isDemoMode={isDemoMode}
          ticker={realtimeLog[0]}
          onOpenQuickNav={() => setIsQuickNavOpen(true)}
          onOpenWarRoom={() => setIsWarRoomOpen?.(true)}
          onLanguageToggle={onLanguageToggle}
          onLogout={onLogout}
        />

        {/* Bottom padding clears the tab bar plus the phone's home-indicator inset. */}
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 pb-[calc(6rem+env(safe-area-inset-bottom))] lg:px-8 lg:pb-8">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={portal}
              variants={portalSwitch}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              {children}
            </motion.div>
          </AnimatePresence>
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
