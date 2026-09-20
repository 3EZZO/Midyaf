import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ACT_TIMING } from "../../lib/demo/data";
import type { DirectorState } from "../../lib/demo/director";
import { cinematic } from "../../lib/motion";
import { pick } from "./shared";

/** Cinematic title card on every act entry (play-through or jump); auto-dismisses. */
export function ActTitleCard({
  isArabic,
  state
}: {
  isArabic: boolean;
  state: DirectorState;
}) {
  const [shownToken, setShownToken] = useState<number | null>(null);
  useEffect(() => {
    if (!state.actTitle || state.actEntryToken === 0) return;
    setShownToken(state.actEntryToken);
    const id = window.setTimeout(
      () => setShownToken(null),
      ACT_TIMING.titleCardMs
    );
    return () => window.clearTimeout(id);
  }, [state.actEntryToken, state.actTitle]);

  const visible = shownToken !== null && shownToken === state.actEntryToken;

  return (
    <AnimatePresence>
      {visible && state.actTitle ? (
        <motion.div
          key={state.actEntryToken}
          variants={cinematic}
          initial="initial"
          animate="animate"
          exit="exit"
          className="pointer-events-none absolute inset-x-0 top-[22%] z-[1100] flex justify-center px-6"
          role="status"
          aria-live="polite"
        >
          <div className="max-w-3xl rounded-lg border border-gold-500/40 bg-surface-0/85 px-10 py-7 text-center shadow-dropdown backdrop-blur-md">
            <div className="text-xs font-bold uppercase tracking-label text-gold-500">
              {isArabic ? "الوصول السيادي" : "Sovereign Arrival"} ·{" "}
              {state.actIndex + 1}/{state.actCount}
            </div>
            <h2 className="mt-2 text-display-md text-ink">
              {pick(state.actTitle, isArabic)}
            </h2>
            {state.actSubtitle ? (
              <p className="mt-2 text-base text-ink-muted">
                {pick(state.actSubtitle, isArabic)}
              </p>
            ) : null}
            <div
              className="mx-auto mt-4 h-0.5 w-24 rounded-full bg-gold-500"
              aria-hidden
            />
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
