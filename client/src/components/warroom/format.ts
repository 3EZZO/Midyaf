const riyadhClock = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Riyadh",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false
});

/** `HH:MM:SS` in Arabia Standard Time, Western digits, whatever the UI locale. */
export function formatClock(epochMs: number): string {
  return riyadhClock.format(new Date(epochMs));
}

/** `m:ss` from a millisecond duration; never negative. */
export function formatMmSs(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export type TMinus = { phase: "none" | "before" | "after"; text: string };

/**
 * Countdown to the landing the director armed. Before touchdown it reads
 * `T−m:ss`; afterwards `T+m:ss` so the room keeps a shared clock for the
 * rest of the operation.
 */
export function formatTMinus(landingAt: number | null, now: number): TMinus {
  if (landingAt === null) return { phase: "none", text: "—" };
  const delta = landingAt - now;
  if (delta > 0) return { phase: "before", text: `T−${formatMmSs(delta)}` };
  return { phase: "after", text: `T+${formatMmSs(-delta)}` };
}
