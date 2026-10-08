import type { LiveSource } from "../liveEvents";

/**
 * Which rehearsal, if any, owns the workspace display. App flips it
 * synchronously when demo mode is toggled or the session ends, before any
 * React state settles, so async work started under one state can tell
 * whether it is still allowed to write:
 *
 * - a director event applies only to the rehearsal that was live when it
 *   fired (`isRehearsal`), never to a later one or to normal data;
 * - workspace loads are ordered: a load may write at all only if no load
 *   started after it has already written (`ticket().claim()`), so an older
 *   response settling late never replaces a newer normal snapshot;
 * - a claimed load shows its result only if no rehearsal is active and
 *   none started or ended since it began (`ticket().canShow()`); its fresh
 *   data still refreshes the normal snapshot either way.
 *
 * Session identity is checked by the caller before claiming.
 * Plain object, no React and no I/O, so the gates are unit-testable.
 */

export type DemoTicket = {
  readonly epoch: number;
  /** Start order of this load among all workspace loads on the page. */
  readonly seq: number;
  /**
   * Call once when the load settles with data. False when a load started
   * later has already written; then this result must be dropped entirely
   * (no normal snapshot, cache or display update).
   */
  claim(): boolean;
  /** May this load's result replace the visible workspace? */
  canShow(): boolean;
};

export class DemoLifecycle {
  private isActive = false;
  private currentEpoch = 0;
  private lastLoadSeq = 0;
  private appliedLoadSeq = 0;

  get active(): boolean {
    return this.isActive;
  }

  /** Bumps on every enter and exit. */
  get epoch(): number {
    return this.currentEpoch;
  }

  enter(): number {
    this.isActive = true;
    return ++this.currentEpoch;
  }

  exit(): number {
    if (!this.isActive) return this.currentEpoch;
    this.isActive = false;
    return ++this.currentEpoch;
  }

  /** True while the rehearsal that was current at `epoch` is still running. */
  isRehearsal(epoch: number): boolean {
    return this.isActive && this.currentEpoch === epoch;
  }

  /**
   * Take before an async workspace load; when it settles with data,
   * `claim()` first, then ask `canShow()` before painting.
   */
  ticket(): DemoTicket {
    const epoch = this.currentEpoch;
    const seq = ++this.lastLoadSeq;
    return {
      epoch,
      seq,
      claim: () => {
        if (seq <= this.appliedLoadSeq) return false;
        this.appliedLoadSeq = seq;
        return true;
      },
      canShow: () => !this.isActive && this.currentEpoch === epoch
    };
  }
}

let instance: DemoLifecycle | null = null;

/** One lifecycle per page, shared by App and the director binding. */
export function getDemoLifecycle(): DemoLifecycle {
  if (!instance) instance = new DemoLifecycle();
  return instance;
}

// ── Synchronous enter/exit steps (React state is handled by App) ──────────

type RehearsalDeps = {
  lifecycle: DemoLifecycle;
  director: { stop(): void };
  events: { clearSource(source: LiveSource): void; clear(): void };
};

/** Start clean: no leftover director run or director history. */
export function enterRehearsal({ lifecycle, director, events }: RehearsalDeps) {
  director.stop();
  events.clearSource("director");
  return lifecycle.enter();
}

/**
 * Leave immediately: mark the rehearsal over (late callbacks see it), stop
 * the director and drop its history. Socket history is kept, except on
 * sign-out (`forgetAllHistory`), when nothing of the session should remain.
 */
export function leaveRehearsal(
  { lifecycle, director, events }: RehearsalDeps,
  { forgetAllHistory = false }: { forgetAllHistory?: boolean } = {}
) {
  const epoch = lifecycle.exit();
  director.stop();
  if (forgetAllHistory) events.clear();
  else events.clearSource("director");
  return epoch;
}

// ── Top-bar log entries, tagged by source ─────────────────────────────────

export type LogEntry = { line: string; source: LiveSource };

/** The ticker shows the newest line; a few more are kept so socket lines survive a burst. */
export const LOG_LIMIT = 20;

export function appendLog(
  log: readonly LogEntry[],
  line: string,
  source: LiveSource
): LogEntry[] {
  return [{ line, source }, ...log.slice(0, LOG_LIMIT - 1)];
}

/** The log without rehearsal lines; the same array when there were none. */
export function withoutDirectorLog(log: LogEntry[]): LogEntry[] {
  return log.some((entry) => entry.source === "director")
    ? log.filter((entry) => entry.source !== "director")
    : log;
}
