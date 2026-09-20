import {
  useCallback,
  useEffect,
  useSyncExternalStore,
  type Dispatch,
  type SetStateAction
} from "react";
import type { MidyafData } from "@shared/domain";
import type { ToastApi } from "../../components/ui/Toast";
import { liveEvents, type LiveEvent } from "../liveEvents";
import { applyLiveEvent } from "../liveState";
import { getDirector, type Director, type DirectorState } from "./director";
import { sovereignArrival } from "./scripts/sovereignArrival";

/**
 * Binds the director to the workspace. Mounted once in App: it feeds the
 * director the current drivers/tasks/guests, applies every director-sourced
 * bus event to `data` through the same reducer the socket uses, and mirrors
 * ticker lines into the top-bar log. Enabling loads the storyboard and
 * starts it; disabling pauses it in place.
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
  pushLog: (line: string) => void;
}): Director {
  const director = getDirector();

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
      director.pause();
      return;
    }
    director.load(sovereignArrival);
    director.play();
    return () => director.pause();
  }, [director, enabled]);

  const onEvent = useCallback(
    (event: LiveEvent) => {
      if (event.source !== "director") return;
      setData((current) => applyLiveEvent(current, event));
      const stamp = new Date(event.at).toLocaleTimeString(
        isArabic ? "ar-SA-u-nu-latn" : "en-SA",
        {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit"
        }
      );
      if (event.name === "demo:ticker")
        pushLog(`${isArabic ? event.payload.ar : event.payload.en} · ${stamp}`);
      else if (event.name === "geofence:transition") {
        const site = isArabic
          ? event.payload.geofenceNameAr
          : event.payload.geofenceNameEn;
        pushLog(
          `${isArabic ? "النطاق الجغرافي" : "Geofence"} · ${site} · ${event.payload.currentRing} · ${stamp}`
        );
      } else if (event.name === "fleet:diverted")
        pushLog(`${event.payload.message} · ${stamp}`);
    },
    [isArabic, pushLog, setData]
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
