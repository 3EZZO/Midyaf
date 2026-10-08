import {
  useCallback,
  useEffect,
  useSyncExternalStore,
  type Dispatch,
  type SetStateAction
} from "react";
import type { MidyafData } from "@shared/domain";
import type { ToastApi } from "../../components/ui/Toast";
import { liveEvents, type LiveEvent, type LiveSource } from "../liveEvents";
import { applyLiveEvent } from "../liveState";
import { getDemoLifecycle } from "./demoLifecycle";
import { getDirector, type Director, type DirectorState } from "./director";
import { sovereignArrival } from "./scripts/sovereignArrival";

/**
 * Binds the director to the workspace. Mounted once in App: it feeds the
 * director the current drivers/tasks/guests, applies every director-sourced
 * bus event to `data` through the same reducer the socket uses, and mirrors
 * ticker lines into the top-bar log. Enabling starts the storyboard from a
 * clean Act 1; disabling stops and forgets the run. The bus listener stays
 * subscribed but ignores director events unless the rehearsal that emitted
 * them is still the live one (`DemoLifecycle`).
 */
export function useDemoDirector({
  enabled,
  data,
  setData,
  isArabic,
  toast,
  pushLog
}: {
  enabled: boolean;
  data: MidyafData | null;
  setData: Dispatch<SetStateAction<MidyafData | null>>;
  isArabic: boolean;
  toast: ToastApi;
  pushLog: (line: string, source?: LiveSource) => void;
}): Director {
  const director = getDirector();
  const lifecycle = getDemoLifecycle();

  useEffect(() => {
    director.setHooks({
      toast: (tone, title, message) =>
        toast[tone](
          isArabic ? title.ar : title.en,
          message ? (isArabic ? message.ar : message.en) : undefined
        )
    });
  }, [director, isArabic, toast]);

  const drivers = data?.drivers;
  const tasks = data?.events[0]?.tasks;
  const guests = data?.events[0]?.guests;
  useEffect(() => {
    director.setContext({
      drivers: drivers ?? [],
      tasks: tasks ?? [],
      guests: guests ?? []
    });
  }, [director, drivers, tasks, guests]);

  useEffect(() => {
    if (!enabled) {
      director.stop();
      return;
    }
    director.stop();
    director.load(sovereignArrival);
    director.play();
    return () => director.pause();
  }, [director, enabled]);

  const onEvent = useCallback(
    (event: LiveEvent) => {
      if (event.source !== "director" || !lifecycle.active) return;
      const epoch = lifecycle.epoch;
      // Re-checked when React applies it: an exit (or a newer rehearsal)
      // queued in between wins, so a late event never lands on normal data.
      setData((current) =>
        lifecycle.isRehearsal(epoch) ? applyLiveEvent(current, event) : current
      );
      const stamp = new Date(event.at).toLocaleTimeString(
        isArabic ? "ar-SA-u-nu-latn" : "en-SA",
        {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit"
        }
      );
      if (event.name === "demo:ticker")
        pushLog(
          `${isArabic ? event.payload.ar : event.payload.en} · ${stamp}`,
          "director"
        );
      else if (event.name === "geofence:transition") {
        const site = isArabic
          ? event.payload.geofenceNameAr
          : event.payload.geofenceNameEn;
        pushLog(
          `${isArabic ? "النطاق الجغرافي" : "Geofence"} · ${site} · ${event.payload.currentRing} · ${stamp}`,
          "director"
        );
      } else if (event.name === "fleet:diverted")
        pushLog(`${event.payload.message} · ${stamp}`, "director");
    },
    [isArabic, lifecycle, pushLog, setData]
  );
  useEffect(() => liveEvents.onAny(onEvent), [onEvent]);

  return director;
}

/** Snapshot of the director for War Room panels; re-renders on every director change. */
export function useDirectorState(): DirectorState {
  const director = getDirector();
  return useSyncExternalStore(
    director.subscribe,
    director.getState,
    director.getState
  );
}
