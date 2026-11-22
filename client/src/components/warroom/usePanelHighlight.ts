import { useEffect, useRef, useState } from "react";
import { liveEvents } from "../../lib/liveEvents";

export type PanelSpotlightState = "idle" | "focused" | "dimmed";

/**
 * Pure helper mapping the currently highlighted panel id (if any) to a panel's
 * spotlight state: "focused" (brass-lit), "dimmed" (20% dimmed), or "idle".
 */
export function resolvePanelSpotlight(
  panelId: string,
  activePanelId: string | null
): PanelSpotlightState {
  if (!activePanelId) return "idle";
  return activePanelId === panelId ? "focused" : "dimmed";
}

/**
 * Tracks whichever panel the War Room director currently highlights via
 * `demo:highlight`, returning its panelId for `durationMs` (otherwise null).
 */
export function useActiveHighlightPanel(): string | null {
  const [activeId, setActiveId] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const off = liveEvents.on("demo:highlight", (payload) => {
      setActiveId(payload.panelId);
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(
        () => setActiveId(null),
        payload.durationMs
      );
    });
    return () => {
      off();
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, []);

  return activeId;
}

/**
 * Returns the Qasr Obsidian spotlight state for a War Room panel:
 * focused panel illuminates with brass; sibling panels gently dim 20%.
 */
export function usePanelSpotlight(panelId: string): PanelSpotlightState {
  const activeId = useActiveHighlightPanel();
  return resolvePanelSpotlight(panelId, activeId);
}

/**
 * True for `durationMs` after the director emits `demo:highlight` for this
 * panel. Retained for backward compatibility with existing callers.
 */
export function usePanelHighlight(panelId: string): boolean {
  return usePanelSpotlight(panelId) === "focused";
}
