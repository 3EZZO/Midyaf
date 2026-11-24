import { isFatalRefreshError } from "./bootSession";
import { readJwtExpMs } from "./demoGuideHint";
import type { RecoverableSession, SessionRefreshDeps } from "./useSocket";

/** Refresh proactively 90 seconds before a 15-minute access token expires. */
export const PROACTIVE_REFRESH_LEAD_MS = 90_000;

/** On tab/phone wake (`visibilitychange` / `online`), refresh if <= 2 min left. */
export const VISIBILITY_REFRESH_LEAD_MS = 120_000;

const MAX_TIMEOUT_MS = 2_147_483_647;

export type SessionRefreshResult =
  | { outcome: "installed"; accessToken: string }
  | { outcome: "unchanged" }
  | { outcome: "signed_out" }
  | { outcome: "offline" }
  | { outcome: "stale" }
  | { outcome: "no_session" };

export type SingleFlightSessionRefresher = {
  /** Refreshes the current session once, coalescing concurrent callers. */
  refreshCurrent: () => Promise<SessionRefreshResult>;
  /**
   * 401 recovery hook for `apiFetch`. Returns a fresh access token to retry
   * with (either from an already-completed refresh or a single-flight refresh),
   * or `null` when no retry should be attempted.
   */
  refreshForUnauthorized: (failedAccessToken: string) => Promise<string | null>;
  /** Clears any tracked in-flight refresh (e.g. on logout/login). */
  reset: () => void;
};

/**
 * Single-flight coordinator shared across the proactive refresh timer,
 * `visibilitychange` wakeups, `apiFetch` 401 retries, and socket auth recovery.
 *
 * Guarantees at most one `POST /api/auth/refresh` in flight per session at any
 * moment, drops stale completions after logout or account switch, and signs out
 * ONLY on fatal auth rejection (400/401/403) — never on offline/5xx/429.
 */
export function createSingleFlightRefresher<S extends RecoverableSession>(
  deps: SessionRefreshDeps<S>
): SingleFlightSessionRefresher {
  let inflight: { session: S; promise: Promise<SessionRefreshResult> } | null = null;

  function runRefreshFor(active: S): Promise<SessionRefreshResult> {
    if (inflight && inflight.session === active) {
      return inflight.promise;
    }

    const promise: Promise<SessionRefreshResult> = (async () => {
      let next: S;
      try {
        next = await deps.refresh(active.refreshToken);
      } catch (error) {
        if (deps.getSession() !== active) return { outcome: "stale" };
        if (isFatalRefreshError(error)) {
          deps.signOut();
          return { outcome: "signed_out" };
        }
        return { outcome: "offline" };
      }

      if (deps.getSession() !== active) return { outcome: "stale" };
      if (next.accessToken === active.accessToken) return { outcome: "unchanged" };
      deps.install(next);
      return { outcome: "installed", accessToken: next.accessToken };
    })();

    const entry = { session: active, promise };
    inflight = entry;
    void promise.finally(() => {
      if (inflight === entry) {
        inflight = null;
      }
    });
    return promise;
  }

  return {
    refreshCurrent() {
      const current = deps.getSession();
      if (!current) return Promise.resolve({ outcome: "no_session" });
      return runRefreshFor(current);
    },

    async refreshForUnauthorized(failedAccessToken: string): Promise<string | null> {
      const current = deps.getSession();
      if (!current) return null;

      // Another path (proactive timer, visibility wakeup, or another request)
      // already rotated the token while this 401 was in flight.
      if (current.accessToken !== failedAccessToken) {
        return current.accessToken;
      }

      const result = await runRefreshFor(current);
      if (result.outcome === "installed") {
        return result.accessToken;
      }
      return null;
    },

    reset() {
      inflight = null;
    }
  };
}

/**
 * Computes milliseconds until proactive refresh should fire (`exp - leadMs`).
 * Returns `null` for non-JWT stub tokens (no timer scheduled).
 */
export function msUntilProactiveRefresh(
  accessToken: string | null | undefined,
  nowMs = Date.now(),
  leadMs = PROACTIVE_REFRESH_LEAD_MS
): number | null {
  const expMs = readJwtExpMs(accessToken);
  if (expMs === null) return null;
  const delay = Math.max(0, expMs - leadMs - nowMs);
  return Math.min(delay, MAX_TIMEOUT_MS);
}

/**
 * True when the token has a numeric `exp` claim that is already expired or
 * within `leadMs` of expiry (used on `visibilitychange` / `online` wakeups).
 */
export function shouldRefreshOnVisible(
  accessToken: string | null | undefined,
  nowMs = Date.now(),
  leadMs = VISIBILITY_REFRESH_LEAD_MS
): boolean {
  const expMs = readJwtExpMs(accessToken);
  if (expMs === null) return false;
  return expMs - nowMs <= leadMs;
}

/**
 * Socket session key decoupled from `accessToken` so routine proactive token
 * refreshes never tear down or reconnect the live WebSocket. Changes ONLY on
 * logout, account/persona switch (`user.id`), or explicit socket auth-error
 * recovery (`recoveryGen`).
 */
export function socketSessionKey(
  session: { user: { id: string } } | null | undefined,
  recoveryGen: number
): string | null {
  if (!session) return null;
  return `${session.user.id}:${recoveryGen}`;
}

export type SocketRecoveryControllerDeps<
  S extends RecoverableSession & { user: { id: string } }
> = {
  getSession: () => S | null;
  refreshCurrent: () => Promise<SessionRefreshResult>;
  /** Called after a fresh token is available so the caller increments `recoveryGen`. */
  onRecovered: () => void;
};

/**
 * Socket auth-error recovery backed by the shared single-flight refresher.
 * Bounded to one recovery attempt per episode (until `onConnected()` or `reset()`),
 * and calls `onRecovered()` (bumping `recoveryGen`) whenever a fresh token is
 * installed or another refresh already rotated the same user's token.
 */
export function createSocketRecoveryController<
  S extends RecoverableSession & { user: { id: string } }
>(deps: SocketRecoveryControllerDeps<S>) {
  let recovering = false;

  return {
    onAuthError() {
      const failedSession = deps.getSession();
      if (!failedSession || recovering) return;
      recovering = true;

      void deps.refreshCurrent().then((result) => {
        if (result.outcome === "installed") {
          deps.onRecovered();
          return;
        }
        // If another path already rotated the token for the same user while
        // this handshake error was being handled, still reconnect the socket.
        const latest = deps.getSession();
        if (
          result.outcome === "stale" &&
          latest &&
          latest.user.id === failedSession.user.id &&
          latest.accessToken !== failedSession.accessToken
        ) {
          deps.onRecovered();
        }
      });
    },
    onConnected() {
      recovering = false;
    },
    reset() {
      recovering = false;
    }
  };
}

type VisibilityTarget = Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener">;
type OnlineTarget = Pick<Window, "addEventListener" | "removeEventListener">;

export type ProactiveRefreshOptions = {
  accessToken: string | null | undefined;
  onRefresh: () => void;
  now?: () => number;
  leadMs?: number;
  visibilityLeadMs?: number;
  setTimer?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (id: ReturnType<typeof setTimeout>) => void;
  documentTarget?: VisibilityTarget | null;
  windowTarget?: OnlineTarget | null;
};

/**
 * Schedules a single proactive refresh timer (`exp - 90s`) plus `visibilitychange`
 * and `online` wakeup checks. The returned `stop()` cleanup cancels the timer
 * and detaches all listeners (called automatically on token rotation and logout).
 */
export function startProactiveSessionRefresh({
  accessToken,
  onRefresh,
  now = () => Date.now(),
  leadMs = PROACTIVE_REFRESH_LEAD_MS,
  visibilityLeadMs = VISIBILITY_REFRESH_LEAD_MS,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (id) => clearTimeout(id),
  documentTarget = typeof document !== "undefined" ? document : null,
  windowTarget = typeof window !== "undefined" ? window : null
}: ProactiveRefreshOptions): () => void {
  let stopped = false;
  let timerId: ReturnType<typeof setTimeout> | null = null;

  const triggerIfActive = () => {
    if (stopped) return;
    onRefresh();
  };

  const delayMs = msUntilProactiveRefresh(accessToken, now(), leadMs);
  if (delayMs !== null) {
    timerId = setTimer(() => {
      timerId = null;
      triggerIfActive();
    }, delayMs);
  }

  const handleVisibilityChange = () => {
    if (stopped) return;
    if (documentTarget?.visibilityState === "visible" && shouldRefreshOnVisible(accessToken, now(), visibilityLeadMs)) {
      triggerIfActive();
    }
  };

  const handleOnline = () => {
    if (stopped) return;
    if (shouldRefreshOnVisible(accessToken, now(), visibilityLeadMs)) {
      triggerIfActive();
    }
  };

  documentTarget?.addEventListener("visibilitychange", handleVisibilityChange);
  windowTarget?.addEventListener("online", handleOnline);

  return () => {
    stopped = true;
    if (timerId !== null) {
      clearTimer(timerId);
      timerId = null;
    }
    documentTarget?.removeEventListener("visibilitychange", handleVisibilityChange);
    windowTarget?.removeEventListener("online", handleOnline);
  };
}

export type SessionLoadToken = { readonly scope: string };

/**
 * Tracks loaded vs. in-flight bootstrap loads per user scope (`userId:onboarding`).
 *
 * Each `begin(scope)` returns a unique attempt token so a 401-catch recovery can
 * release the gate *before* calling `refreshCurrent()` (letting the refreshed
 * session immediately start a new load) without the old attempt's `finally`
 * clearing the newer attempt's in-flight guard or loading spinner.
 */
export function createSessionLoadGate() {
  let loadedScope: string | null = null;
  let inflight: SessionLoadToken | null = null;

  return {
    shouldSkip(scope: string): boolean {
      return loadedScope === scope || inflight?.scope === scope;
    },
    begin(scope: string): SessionLoadToken {
      const token: SessionLoadToken = { scope };
      inflight = token;
      return token;
    },
    markLoaded(token: SessionLoadToken) {
      loadedScope = token.scope;
    },
    release(token: SessionLoadToken): boolean {
      if (inflight === token) {
        inflight = null;
        return true;
      }
      return false;
    },
    hasInflight(): boolean {
      return inflight !== null;
    },
    reset() {
      loadedScope = null;
      inflight = null;
    }
  };
}
