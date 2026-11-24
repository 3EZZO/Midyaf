import type { DemoStatusDto } from "@shared/demo";
import type { Session } from "@shared/domain";

/**
 * Session-scoped UI hint persisted once GET /api/demo/status confirms an active
 * switchable Investor Demo session. Allows ShellFrame to reserve the exact
 * height of the collapsed InvestorStoryGuide bar from first paint on reload
 * (eliminating the ~33px CLS shift while demo status resolves).
 *
 * Never set when DEMO_MODE_ENABLED=false, and cleared on disabled status or logout.
 */
export const DEMO_GUIDE_HINT_KEY = "midyaf.demoGuideHint";

const DEFAULT_EXPIRY_SKEW_MS = 5_000;

function safeSessionStorage(): Storage | undefined {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : undefined;
  } catch {
    return undefined;
  }
}

export function readDemoGuideHint(
  storage: Pick<Storage, "getItem"> | undefined = safeSessionStorage()
): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(DEMO_GUIDE_HINT_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeDemoGuideHint(
  enabled: boolean,
  storage: Pick<Storage, "setItem" | "removeItem"> | undefined = safeSessionStorage()
): void {
  if (!storage) return;
  try {
    if (enabled) {
      storage.setItem(DEMO_GUIDE_HINT_KEY, "1");
    } else {
      storage.removeItem(DEMO_GUIDE_HINT_KEY);
    }
  } catch {
    // Restricted storage contexts must never break rendering.
  }
}

function decodeBase64Url(segment: string): string | null {
  try {
    const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    if (typeof atob === "function") {
      return atob(padded);
    }
    return Buffer.from(padded, "base64").toString("utf8");
  } catch {
    return null;
  }
}

/**
 * Decodes a JWT access token's `exp` claim into epoch milliseconds, or returns
 * `null` for non-JWT / stub / malformed tokens.
 */
export function readJwtExpMs(token: string | null | undefined): number | null {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[1]) return null;
  const decoded = decodeBase64Url(parts[1]);
  if (!decoded) return null;
  try {
    const payload = JSON.parse(decoded) as { exp?: unknown };
    if (typeof payload.exp !== "number" || !Number.isFinite(payload.exp)) {
      return null;
    }
    return payload.exp * 1000;
  } catch {
    return null;
  }
}

/**
 * Client-side expiry pre-check for a stored JWT access token.
 * Returns true only when the token has a valid numeric `exp` claim that is
 * already past (within `skewMs`). Non-JWT stub tokens return false.
 */
export function isJwtExpired(
  token: string | null | undefined,
  nowMs = Date.now(),
  skewMs = DEFAULT_EXPIRY_SKEW_MS
): boolean {
  const expMs = readJwtExpMs(token);
  if (expMs === null) return false;
  return expMs <= nowMs + skewMs;
}

export function shouldFetchDemoStatus(
  session: Pick<Session, "accessToken" | "user"> | null | undefined,
  nowMs = Date.now()
): boolean {
  if (!session?.accessToken || session.user.onboardingPending) {
    return false;
  }
  if (isJwtExpired(session.accessToken, nowMs)) {
    return false;
  }
  return true;
}

export type DemoStatusFetchOutcome =
  | { skipped: true }
  | { skipped: false; status: DemoStatusDto | null; activeGuide: boolean };

/**
 * Guards GET /api/demo/status so an expired stored access token never fires a
 * doomed 401 before `loadSessionData` finishes refreshing the session.
 */
export async function loadDemoStatusIfFresh(
  session: Pick<Session, "accessToken" | "user"> | null | undefined,
  fetcher: (accessToken: string, signal?: AbortSignal) => Promise<DemoStatusDto | null>,
  options: {
    signal?: AbortSignal;
    nowMs?: number;
    storage?: Pick<Storage, "setItem" | "removeItem"> | undefined;
  } = {}
): Promise<DemoStatusFetchOutcome> {
  if (!shouldFetchDemoStatus(session, options.nowMs)) {
    return { skipped: true };
  }

  const status = await fetcher(session!.accessToken, options.signal);
  const activeGuide = Boolean(status?.enabled && status.canSwitch);
  if (!options.signal?.aborted) {
    writeDemoGuideHint(activeGuide, options.storage);
  }
  return { skipped: false, status, activeGuide };
}
