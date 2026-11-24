import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  apiFetch,
  isRetryableAuthPath,
  setApiUnauthorizedHandler
} from "./api";
import { isFatalRefreshError } from "./bootSession";
import {
  PROACTIVE_REFRESH_LEAD_MS,
  VISIBILITY_REFRESH_LEAD_MS,
  createSingleFlightRefresher,
  createSocketRecoveryController,
  msUntilProactiveRefresh,
  shouldRefreshOnVisible,
  socketSessionKey,
  startProactiveSessionRefresh
} from "./sessionRefresh";

type TestSession = {
  accessToken: string;
  refreshToken: string;
  user: { id: string };
};

const NOW = 1_800_000_000_000;

function makeJwt(expSeconds: number): string {
  const encode = (obj: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(obj), "utf8").toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ exp: expSeconds })}.sig`;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeHarness(initial: TestSession | null) {
  let current = initial;
  const calls: Array<ReturnType<typeof deferred<TestSession>>> = [];
  const installed: TestSession[] = [];
  let signOuts = 0;

  const refresher = createSingleFlightRefresher<TestSession>({
    getSession: () => current,
    refresh: vi.fn(() => {
      const d = deferred<TestSession>();
      calls.push(d);
      return d.promise;
    }),
    install: vi.fn((next) => {
      current = next;
      installed.push(next);
    }),
    signOut: vi.fn(() => {
      current = null;
      signOuts += 1;
    })
  });

  return {
    getCurrent: () => current,
    swap: (next: TestSession | null) => {
      current = next;
    },
    calls,
    installed,
    signOuts: () => signOuts,
    refresher
  };
}

const alice1: TestSession = {
  accessToken: makeJwt(NOW / 1000 + 900),
  refreshToken: "r-alice-1",
  user: { id: "user-alice" }
};
const alice2: TestSession = {
  accessToken: makeJwt(NOW / 1000 + 1800),
  refreshToken: "r-alice-2",
  user: { id: "user-alice" }
};
const bob1: TestSession = {
  accessToken: makeJwt(NOW / 1000 + 900),
  refreshToken: "r-bob-1",
  user: { id: "user-bob" }
};

afterEach(() => {
  setApiUnauthorizedHandler(null);
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("isFatalRefreshError", () => {
  it("treats only 400, 401, and 403 ApiErrors as fatal sign-out errors", () => {
    expect(isFatalRefreshError(new ApiError("bad", 400))).toBe(true);
    expect(isFatalRefreshError(new ApiError("expired", 401))).toBe(true);
    expect(isFatalRefreshError(new ApiError("forbidden", 403))).toBe(true);
    expect(isFatalRefreshError(new ApiError("rate limited", 429))).toBe(false);
    expect(isFatalRefreshError(new ApiError("cold start", 503))).toBe(false);
    expect(isFatalRefreshError(new TypeError("Failed to fetch"))).toBe(false);
  });
});

describe("createSingleFlightRefresher", () => {
  it("coalesces concurrent refreshes for the same session into a single POST /auth/refresh", async () => {
    const h = makeHarness(alice1);
    const p1 = h.refresher.refreshCurrent();
    const p2 = h.refresher.refreshCurrent();
    const p3 = h.refresher.refreshForUnauthorized(alice1.accessToken);

    expect(h.calls).toHaveLength(1);
    h.calls[0].resolve(alice2);

    const [r1, r2, token3] = await Promise.all([p1, p2, p3]);
    expect(r1).toEqual({ outcome: "installed", accessToken: alice2.accessToken });
    expect(r2).toEqual({ outcome: "installed", accessToken: alice2.accessToken });
    expect(token3).toBe(alice2.accessToken);
    expect(h.installed).toEqual([alice2]);
  });

  it("returns the already-installed token without refreshing when a 401 arrives for an older token", async () => {
    const h = makeHarness(alice2);
    const token = await h.refresher.refreshForUnauthorized(alice1.accessToken);
    expect(token).toBe(alice2.accessToken);
    expect(h.calls).toHaveLength(0);
  });

  it("never signs out on network error, 5xx, or 429; signs out only on 400/401/403", async () => {
    for (const transient of [
      new TypeError("Failed to fetch"),
      new ApiError("Bad Gateway", 502),
      new ApiError("Too Many Requests", 429)
    ]) {
      const h = makeHarness(alice1);
      const p = h.refresher.refreshCurrent();
      h.calls[0].reject(transient);
      await expect(p).resolves.toEqual({ outcome: "offline" });
      expect(h.signOuts()).toBe(0);
      expect(h.getCurrent()).toBe(alice1);
    }

    const fatal = makeHarness(alice1);
    const p = fatal.refresher.refreshCurrent();
    fatal.calls[0].reject(new ApiError("Session expired", 401));
    await expect(p).resolves.toEqual({ outcome: "signed_out" });
    expect(fatal.signOuts()).toBe(1);
    expect(fatal.getCurrent()).toBeNull();
  });

  it("drops late success or failure if logout or account switch happened mid-flight", async () => {
    const h = makeHarness(alice1);
    const p = h.refresher.refreshCurrent();
    h.swap(null);
    h.calls[0].resolve(alice2);
    await expect(p).resolves.toEqual({ outcome: "stale" });
    expect(h.installed).toEqual([]);

    const h2 = makeHarness(alice1);
    const p2 = h2.refresher.refreshCurrent();
    h2.swap(bob1);
    h2.calls[0].reject(new ApiError("Session expired", 401));
    await expect(p2).resolves.toEqual({ outcome: "stale" });
    expect(h2.signOuts()).toBe(0);
    expect(h2.getCurrent()).toBe(bob1);
  });
});

describe("apiFetch single-retry 401 fallback", () => {
  it("excludes all /auth/* paths from 401 retry to prevent loops", () => {
    expect(isRetryableAuthPath("/auth/refresh")).toBe(false);
    expect(isRetryableAuthPath("/auth/logout")).toBe(false);
    expect(isRetryableAuthPath("/auth/login")).toBe(false);
    expect(isRetryableAuthPath("/auth/me")).toBe(false);
    expect(isRetryableAuthPath("auth/refresh?x=1")).toBe(false);
    expect(isRetryableAuthPath("/workspace/events")).toBe(true);
    expect(isRetryableAuthPath("/tasks")).toBe(true);
    expect(isRetryableAuthPath("/bootstrap")).toBe(true);
  });

  it("retries a 401 GET or POST exactly once with the refreshed token and succeeds", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: "Expired" } }), { status: 401 })
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const onUnauth = vi.fn(async () => "fresh-token");
    setApiUnauthorizedHandler(onUnauth);

    const result = await apiFetch<{ ok: boolean }>("/tasks/1/status", "expired-token", {
      method: "POST",
      body: JSON.stringify({ status: "COMPLETED" })
    });

    expect(result).toEqual({ ok: true });
    expect(onUnauth).toHaveBeenCalledTimes(1);
    expect(onUnauth).toHaveBeenCalledWith("expired-token");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const secondHeaders = fetchMock.mock.calls[1][1]?.headers as Record<string, string>;
    expect(secondHeaders.Authorization).toBe("Bearer fresh-token");
  });

  it("caps retry at strictly 1 attempt even if the retried request also returns 401", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: { message: "Still unauthorized" } }), { status: 401 })
      );
    vi.stubGlobal("fetch", fetchMock);

    const onUnauth = vi.fn(async () => "fresh-token");
    setApiUnauthorizedHandler(onUnauth);

    await expect(
      apiFetch("/workspace/events", "expired-token", { method: "POST", body: "{}" })
    ).rejects.toMatchObject({ name: "ApiError", status: 401 });

    expect(onUnauth).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("never retries /auth/* paths or non-401 failures (e.g. 500/403 POST)", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("{}", { status: 401 }))
      .mockResolvedValueOnce(new Response("{}", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    const onUnauth = vi.fn(async () => "fresh-token");
    setApiUnauthorizedHandler(onUnauth);

    await expect(apiFetch("/auth/me", "expired-token")).rejects.toMatchObject({ status: 401 });
    await expect(
      apiFetch("/tasks", "valid-token", { method: "POST", body: "{}" })
    ).rejects.toMatchObject({ status: 500 });

    expect(onUnauth).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("proactive refresh timer + visibilitychange + logout cleanup", () => {
  it("computes delay 90 s before exp and returns null for non-JWT stub tokens", () => {
    const expSec = Math.floor(NOW / 1000) + 900; // 15m from NOW
    expect(msUntilProactiveRefresh(makeJwt(expSec), NOW)).toBe(
      900_000 - PROACTIVE_REFRESH_LEAD_MS
    );
    expect(msUntilProactiveRefresh(makeJwt(Math.floor(NOW / 1000) + 30), NOW)).toBe(0);
    expect(msUntilProactiveRefresh("stub-token", NOW)).toBeNull();
  });

  it("triggers proactive refresh at exp - 90s and clears the timer on stop (logout)", () => {
    vi.useFakeTimers();
    let now = NOW;
    const token = makeJwt(Math.floor(NOW / 1000) + 900); // 15m TTL -> fires at 13.5m
    const onRefresh = vi.fn();

    const stop = startProactiveSessionRefresh({
      accessToken: token,
      onRefresh,
      now: () => now,
      documentTarget: null,
      windowTarget: null
    });

    vi.advanceTimersByTime(809_000);
    expect(onRefresh).not.toHaveBeenCalled();

    // Stop (logout) before timer fires -> timer must be cleared.
    stop();
    vi.advanceTimersByTime(100_000);
    expect(onRefresh).not.toHaveBeenCalled();

    // Fresh schedule fires right at 810,000 ms (90s before exp).
    const stop2 = startProactiveSessionRefresh({
      accessToken: token,
      onRefresh,
      now: () => now,
      documentTarget: null,
      windowTarget: null
    });
    vi.advanceTimersByTime(810_000);
    expect(onRefresh).toHaveBeenCalledTimes(1);
    stop2();
  });

  it("refreshes on visibilitychange when <= 2 min remain and detaches listener on stop", () => {
    let now = NOW;
    const token = makeJwt(Math.floor(NOW / 1000) + 900); // 15m TTL
    const listeners = new Map<string, Set<EventListener>>();
    const docTarget = {
      visibilityState: "hidden" as DocumentVisibilityState,
      addEventListener: (type: string, fn: EventListener) => {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(fn);
      },
      removeEventListener: (type: string, fn: EventListener) => {
        listeners.get(type)?.delete(fn);
      }
    };
    const onRefresh = vi.fn();

    const stop = startProactiveSessionRefresh({
      accessToken: token,
      onRefresh,
      now: () => now,
      setTimer: () => 0 as unknown as ReturnType<typeof setTimeout>,
      clearTimer: () => {},
      documentTarget: docTarget as unknown as Document,
      windowTarget: null
    });

    // Wake early (10m remaining > 2m lead): should NOT refresh.
    now = NOW + 300_000;
    docTarget.visibilityState = "visible";
    listeners.get("visibilitychange")?.forEach((fn) => fn(new Event("visibilitychange")));
    expect(onRefresh).not.toHaveBeenCalled();

    // Wake with 1m remaining (<= 2m lead): SHOULD refresh.
    now = NOW + 900_000 - (VISIBILITY_REFRESH_LEAD_MS - 60_000);
    expect(shouldRefreshOnVisible(token, now)).toBe(true);
    listeners.get("visibilitychange")?.forEach((fn) => fn(new Event("visibilitychange")));
    expect(onRefresh).toHaveBeenCalledTimes(1);

    // After logout (stop), listener is detached.
    stop();
    expect(listeners.get("visibilitychange")?.size ?? 0).toBe(0);
  });
});

describe("socketSessionKey + createSocketRecoveryController", () => {
  it("keeps sessionKey stable across same-user token refresh, changes on user switch or recoveryGen", () => {
    expect(socketSessionKey(null, 0)).toBeNull();
    expect(socketSessionKey(alice1, 0)).toBe("user-alice:0");
    // Proactive refresh installs alice2 (same user.id): sessionKey MUST NOT change.
    expect(socketSessionKey(alice2, 0)).toBe("user-alice:0");
    // Socket auth-error recovery increments recoveryGen: sessionKey MUST change.
    expect(socketSessionKey(alice2, 1)).toBe("user-alice:1");
    // Persona / account switch changes user.id: sessionKey MUST change.
    expect(socketSessionKey(bob1, 0)).toBe("user-bob:0");
  });

  it("bumps recoveryGen via onRecovered on auth error and bounds 1 recovery per episode", async () => {
    const h = makeHarness(alice1);
    let recoveryGen = 0;
    const ctrl = createSocketRecoveryController<TestSession>({
      getSession: h.getCurrent,
      refreshCurrent: h.refresher.refreshCurrent,
      onRecovered: () => {
        recoveryGen += 1;
      }
    });

    ctrl.onAuthError();
    ctrl.onAuthError(); // bounded within same episode
    expect(h.calls).toHaveLength(1);

    h.calls[0].resolve(alice2);
    await new Promise((r) => setTimeout(r, 0));

    expect(recoveryGen).toBe(1);
    expect(h.getCurrent()).toBe(alice2);

    // After socket reconnects cleanly, a future episode can recover again.
    ctrl.onConnected();
    ctrl.onAuthError();
    expect(h.calls).toHaveLength(2);
    h.calls[1].reject(new TypeError("Failed to fetch"));
    await new Promise((r) => setTimeout(r, 0));
    expect(h.signOuts()).toBe(0);
    expect(recoveryGen).toBe(1);
  });

  it("still bumps recoveryGen if another refresh already rotated the same user's token", async () => {
    const h = makeHarness(alice1);
    let recoveryGen = 0;
    const ctrl = createSocketRecoveryController<TestSession>({
      getSession: h.getCurrent,
      refreshCurrent: h.refresher.refreshCurrent,
      onRecovered: () => {
        recoveryGen += 1;
      }
    });

    ctrl.onAuthError();
    h.swap(alice2); // proactive refresh landed first for same user
    h.calls[0].resolve(alice2);
    await new Promise((r) => setTimeout(r, 0));

    expect(recoveryGen).toBe(1);
  });
});
