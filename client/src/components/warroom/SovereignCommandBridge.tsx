import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore
} from "react";
import { Activity } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CONCENTRIC_GEOFENCES } from "@shared/constants";
import type { Driver, Event, MidyafData, Session, Task } from "@shared/domain";
import { cn } from "../../lib/cn";
import { DEMO_CONVOYS } from "../../lib/demo/data";
import { getDirector } from "../../lib/demo/director";
import { useDirectorState } from "../../lib/demo/useDemoDirector";
import { isArabicLanguage } from "../../lib/localize";
import { driverRingPosition, slaSample } from "../../lib/metrics";
import { tacticalAudio } from "../../lib/tacticalAudio";
import { AiBriefingCard } from "../ai/AiBriefingCard";
import { Heartbeat } from "../charts";
import { RiyadhMap } from "../map";
import { ActTitleCard } from "./ActTitleCard";
import { ConvoyRoster } from "./ConvoyRoster";
import { FlightBoard } from "./FlightBoard";
import { MissionLog } from "./MissionLog";
import { NarratorBar } from "./NarratorBar";
import { OccupancyStrip } from "./OccupancyStrip";
import { PanelFrame } from "./PanelFrame";
import { RadarSweep } from "./RadarSweep";
import { Scorecard } from "./Scorecard";
import { VipDossierDialog } from "./VipDossierDialog";
import { WarRoomHeader } from "./WarRoomHeader";

export type SovereignCommandBridgeProps = {
  isOpen: boolean;
  onClose: () => void;
  isDemoMode: boolean;
  event?: Event;
  drivers: Driver[];
  tasks: Task[];
  /** For the streamed briefing: the bearer token and the snapshot it is grounded in. */
  session?: Session;
  data?: MidyafData;
};

/**
 * The War Room. A 16:9, no-scroll grid over the same data the portals read:
 * flight board + convoy roster · map + ring occupancy · radar + heartbeat +
 * mission log, with the narrator's transport in the footer. Every panel
 * subscribes to the live bus, so with real server events and no script the
 * room is fully live; with the director armed it plays "Sovereign Arrival".
 */
export function SovereignCommandBridge({
  isOpen,
  onClose,
  isDemoMode,
  event,
  drivers,
  tasks,
  session,
  data
}: SovereignCommandBridgeProps) {
  const { i18n } = useTranslation();
  const isArabic = isArabicLanguage(i18n.language);
  const director = getDirector();
  const state = useDirectorState();
  const muted = useSyncExternalStore(
    tacticalAudio.subscribe,
    () => tacticalAudio.isMuted(),
    () => false
  );
  const scripted = isDemoMode && state.scriptId !== null;

  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [dossierVipId, setDossierVipId] = useState<string | null>(null);

  const selectedDriver = useMemo(
    () => drivers.find((d) => d.id === selectedDriverId) ?? null,
    [drivers, selectedDriverId]
  );

  // The radar follows the selected convoy's destination; otherwise Alpha's, or the site nearest the selection.
  const radarSite = useMemo(() => {
    if (scripted) {
      const convoy =
        DEMO_CONVOYS.find(
          (c) => state.convoys[c.driver].driverId === selectedDriverId
        ) ?? DEMO_CONVOYS[0];
      return convoy.destination;
    }
    if (selectedDriver)
      return (
        driverRingPosition(selectedDriver)?.siteCode ??
        CONCENTRIC_GEOFENCES[0].code
      );
    return CONCENTRIC_GEOFENCES[0].code;
  }, [scripted, selectedDriverId, selectedDriver, state.convoys]);

  const sla = slaSample(tasks);

  // Narrator hotkeys, scoped to the open War Room. Ctrl/Cmd chords belong to the app shell.
  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      )
        return;
      const forward = isArabic ? "ArrowLeft" : "ArrowRight";
      const back = isArabic ? "ArrowRight" : "ArrowLeft";
      switch (e.key) {
        case "Escape":
          e.preventDefault();
          if (dossierVipId) setDossierVipId(null);
          else if (state.scorecardVisible)
            director.execute({ type: "scorecard", visible: false });
          else onClose();
          return;
        case "m":
        case "M":
          e.preventDefault();
          tacticalAudio.toggleMute();
          return;
      }
      if (!scripted) return;
      if (e.key === " ") {
        e.preventDefault();
        director.toggle();
      } else if (e.key === forward) {
        e.preventDefault();
        director.next();
      } else if (e.key === back) {
        e.preventDefault();
        director.prev();
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        director.restart();
      } else if (/^[1-9]$/.test(e.key)) {
        e.preventDefault();
        director.seekAct(Number(e.key) - 1);
      }
    },
    [
      director,
      dossierVipId,
      isArabic,
      onClose,
      scripted,
      state.scorecardVisible
    ]
  );
  useEffect(() => {
    if (!isOpen) return;
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onKeyDown]);

  if (!isOpen) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-warroom flex flex-col command-deck-bg text-ink",
        isArabic ? "font-arabic" : "font-english"
      )}
      role="region"
      aria-label={isArabic ? "غرفة العمليات السيادية" : "Sovereign War Room"}
    >
      <WarRoomHeader
        isArabic={isArabic}
        isDemoMode={isDemoMode}
        state={state}
        drivers={drivers}
        muted={muted}
        onToggleMute={() => tacticalAudio.toggleMute()}
        onClose={onClose}
      />

      <div className="relative grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-3 lg:grid-cols-12 lg:overflow-hidden">
        <aside className="flex min-h-0 flex-col gap-3 lg:col-span-3">
          <FlightBoard
            isArabic={isArabic}
            scripted={scripted}
            phases={state.flights}
          />
          <ConvoyRoster
            isArabic={isArabic}
            scripted={scripted}
            drivers={drivers}
            convoys={state.convoys}
            selectedDriverId={selectedDriverId}
            onSelectDriver={setSelectedDriverId}
            onSelectVip={setDossierVipId}
          />
        </aside>

        <section className="flex min-h-[420px] flex-col gap-3 lg:col-span-6 lg:min-h-0">
          {/* No backdrop-filter on this wrapper: it would trap the map's fixed-position fullscreen fallback. */}
          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-gold-500/25 bg-surface-2">
            <RiyadhMap
              event={event}
              drivers={drivers}
              tasks={tasks}
              height="h-full min-h-[360px]"
              defaultMode="dark"
              selectedDriverId={selectedDriverId}
              onSelectDriver={(driver) => setSelectedDriverId(driver.id)}
              className="flex-1"
            />
            {/* Leaflet panes sit at z-400/1000; the briefing floats above them at the map's bottom-start. */}
            <div className="pointer-events-none absolute inset-3 z-[1100] flex items-end">
              <AiBriefingCard
                isArabic={isArabic}
                session={session}
                data={data}
                isDemoMode={isDemoMode}
              />
            </div>
          </div>
          <OccupancyStrip isArabic={isArabic} drivers={drivers} />
        </section>

        <aside className="flex min-h-0 flex-col gap-3 lg:col-span-3">
          <RadarSweep
            isArabic={isArabic}
            drivers={drivers}
            siteCode={radarSite}
            selectedDriverId={selectedDriverId}
          />
          <PanelFrame
            panelId="heartbeat"
            title={isArabic ? "نبض الالتزام بالوقت" : "On-time heartbeat"}
            icon={<Activity />}
            bodyClassName="flex items-center justify-center px-3 py-2"
          >
            <Heartbeat
              value={sla.onTimePercent}
              label={
                isArabic
                  ? `${sla.completed} مكتملة · ${sla.delayed} متأخرة`
                  : `${sla.completed} done · ${sla.delayed} delayed`
              }
            />
          </PanelFrame>
          <MissionLog isArabic={isArabic} />
        </aside>

        <ActTitleCard isArabic={isArabic} state={state} />
        <Scorecard
          isArabic={isArabic}
          state={state}
          event={event}
          drivers={drivers}
          tasks={tasks}
          onDismiss={() =>
            director.execute({ type: "scorecard", visible: false })
          }
        />
      </div>

      <NarratorBar
        isArabic={isArabic}
        isDemoMode={isDemoMode}
        director={director}
        state={state}
      />

      <VipDossierDialog
        isArabic={isArabic}
        vipId={dossierVipId}
        drivers={drivers}
        convoys={state.convoys}
        onClose={() => setDossierVipId(null)}
      />
    </div>
  );
}
