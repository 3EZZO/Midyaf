import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ACT_TIMING } from "../../lib/demo/data";
import type { DirectorState } from "../../lib/demo/director";
import { cn } from "../../lib/cn";
import { cinematic } from "../../lib/motion";
import "../../styles/signature.css";
import { SaduRibbon } from "../ui/SaduRibbon";
import { pick } from "./shared";

/**
 * Qasr Obsidian cinema intertitle card shown on every act entry (play-through
 * or jump) with static Sadu crest and one-shot brass rule sweep; auto-dismisses.
 */
export function ActTitleCard({
  isArabic,
  state,
  forceVisible = false
}: {
  isArabic: boolean;
  state: DirectorState;
  /** Allows SSR tests to render the visible title card directly. */
  forceVisible?: boolean;
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

  const visible = forceVisible || (shownToken !== null && shownToken === state.actEntryToken);

  return (
    <AnimatePresence>
      {visible && state.actTitle ? (
        <motion.div
          key={state.actEntryToken}
          variants={cinematic}
          initial="initial"
          animate="animate"
          exit="exit"
          data-warroom-act-card
          className="pointer-events-none absolute inset-x-0 top-[20%] z-[1100] flex justify-center px-6"
          role="status"
          aria-live="polite"
        >
          <div className="w-full max-w-2xl overflow-hidden rounded-xl border border-gold-500/45 bg-surface-0/95 shadow-luxury backdrop-blur-md">
            <SaduRibbon variant="crest" />
            <div className="px-8 py-7 text-center sm:px-10">
              <div
                className={cn(
                  "font-tnum text-xs font-bold text-gold-300",
                  !isArabic && "uppercase tracking-label"
                )}
              >
                {isArabic ? "وصول الفعالية" : "Event Arrival"} ·{" "}
                {state.actIndex + 1}/{state.actCount}
              </div>
              <h2 className="mt-2.5 font-display text-display-md text-ink">
                {pick(state.actTitle, isArabic)}
              </h2>
              {state.actSubtitle ? (
                <p className="mt-2.5 text-base text-ink/90">
                  {pick(state.actSubtitle, isArabic)}
                </p>
              ) : null}
              <div
                className="qasr-act-rule mx-auto mt-5 h-0.5 w-28 rounded-full bg-gradient-to-r from-transparent via-gold-500 to-transparent"
                aria-hidden
              />
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
