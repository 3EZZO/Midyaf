import type { Transition, Variants } from "motion/react";

/**
 * Motion vocabulary. Every animation in the app is one of these — motion is
 * semantic (enter/exit, state change, live acknowledgement) or narrative
 * (War Room), never decorative. `MotionConfig reducedMotion="user"` at the
 * root collapses all of them to opacity when the OS asks for reduced motion.
 */

export const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];

export const DURATION = {
  fast: 0.12,
  base: 0.2,
  slow: 0.4,
  cinematic: 0.9
} as const;

export const spring: Transition = { type: "spring", stiffness: 500, damping: 40 };

const isRtl = () => typeof document !== "undefined" && document.documentElement.dir === "rtl";

/** Portal-to-portal switch: fade + short slide in the reading direction. */
export const portalSwitch: Variants = {
  initial: () => ({ opacity: 0, x: isRtl() ? -12 : 12 }),
  animate: { opacity: 1, x: 0, transition: { duration: DURATION.base, ease: EASE_OUT } },
  exit: () => ({ opacity: 0, x: isRtl() ? 8 : -8, transition: { duration: DURATION.fast, ease: EASE_OUT } })
};

/** Parent for a grid of cards; children use `staggerChild`. Capped so long lists don't drag. */
export const staggerIn: Variants = {
  initial: {},
  animate: { transition: { staggerChildren: 0.04, delayChildren: 0.02 } }
};

export const staggerChild: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: DURATION.base, ease: EASE_OUT } }
};

/** One-shot ring used to acknowledge a live event on a pill, marker or row. */
export const livePulse: Variants = {
  initial: { scale: 1, opacity: 0.6 },
  animate: { scale: 1.6, opacity: 0, transition: { duration: 0.7, ease: "easeOut" } }
};

/** Login entrance — visuals only; the form is interactive at t=0. */
export const entrance = {
  horizon: {
    initial: { scaleX: 0, opacity: 0 },
    animate: { scaleX: 1, opacity: 1, transition: { duration: 1.2, ease: EASE_OUT } }
  } satisfies Variants,
  rise: (delay = 0): Variants => ({
    initial: { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE_OUT, delay } }
  })
};

/** War Room only: title cards, scorecard reveal, camera-synchronised overlays. */
export const cinematic: Variants = {
  initial: { opacity: 0, y: 24, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { duration: DURATION.cinematic, ease: EASE_OUT } },
  exit: { opacity: 0, y: -12, transition: { duration: DURATION.slow, ease: EASE_OUT } }
};

export const fade: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: DURATION.base } },
  exit: { opacity: 0, transition: { duration: DURATION.fast } }
};
