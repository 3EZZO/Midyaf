import { ApiError } from "./api";
import { isJwtExpired } from "./demoGuideHint";
import type { RecoverableSession, SessionRefreshDeps } from "./useSocket";

/**
 * - fresh: the stored access token is still valid; load data now.
 * - installed: a fresh session was installed; its new access token re-runs the
 *   session effect, which loads data.
 * - signed_out: the refresh token was refused; the login screen is the answer.
 * - stale: the session changed meanwhile (logout, switch, another refresh).
 * - offline: the refresh could not reach the server; load data anyway so the
 *   offline cache still paints and the existing 401 recovery stays in charge.
 */
export type BootRefreshOutcome = "fresh" | "installed" | "signed_out" | "stale" | "offline";

/**
 * Boot freshness gate. A session restored from storage often carries an access
 * token that expired while the tab was closed. Loading data with it mounts the
 * shell (from the offline cache), which fires bootstrap, workspace, push config
 * and the socket handshake with the dead token: each one 401s, and the socket is
 * torn down mid-handshake once the refresh lands. Refreshing first avoids all of
 * that. `/auth/refresh` is stateless (it does not rotate tokenVersion), so a
 * duplicate call (for example a StrictMode double effect) is harmless; the later
 * result is dropped as stale.
 */
export async function refreshExpiredSessionAtBoot<S extends RecoverableSession>(
  active: S,
  deps: SessionRefreshDeps<S>,
  nowMs = Date.now()
): Promise<BootRefreshOutcome> {
  if (!isJwtExpired(active.accessToken, nowMs)) return "fresh";

  let next: S;
  try {
    next = await deps.refresh(active.refreshToken);
  } catch (error) {
    if (deps.getSession() !== active) return "stale";
    // Any HTTP answer means the server judged the refresh token: 401 (expired,
    // revoked by logout or password reset), 400 (malformed). A thrown non-API
    // error is the network (offline PWA, cold start dropped): keep the session.
    if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
      deps.signOut();
      return "signed_out";
    }
    return "offline";
  }

  if (deps.getSession() !== active) return "stale";
  deps.install(next);
  return "installed";
}
