import { useEffect, useRef, useState } from "react";
import { liveEvents } from "../../lib/liveEvents";

/**
 * True for `durationMs` after the director emits `demo:highlight` for this
 * panel. Panels use it to draw the narrator's eye — a gold ring, nothing
 * that moves the layout.
 */
export function usePanelHighlight(panelId: string): boolean {
  const [active, setActive] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const off = liveEvents.on("demo:highlight", (payload) => {
      if (payload.panelId !== panelId) return;
      setActive(true);
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(
        () => setActive(false),
        payload.durationMs
      );
    });
    return () => {
      off();
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, [panelId]);

  return active;
}
