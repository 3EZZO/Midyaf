import { describe, expect, it, vi } from "vitest";
import { ApiError } from "./api";
import { refreshExpiredSessionAtBoot } from "./bootSession";

type S = { accessToken: string; refreshToken: string };

const NOW = 1_800_000_000_000;

function makeJwt(expSeconds: number): string {
  const encode = (obj: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(obj), "utf8").toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ exp: expSeconds })}.sig`;
}

function setup(active: S, refresh: (token: string) => Promise<S>) {
  let current: S | null = active;
  const deps = {
    getSession: () => current,
    refresh: vi.fn(refresh),
    install: vi.fn((next: S) => {
      current = next;
    }),
    signOut: vi.fn(() => {
      current = null;
    })
  };
  return { deps, swap: (next: S | null) => (current = next) };
}

const expired: S = { accessToken: makeJwt(NOW / 1000 - 60), refreshToken: "r1" };
const valid: S = { accessToken: makeJwt(NOW / 1000 + 600), refreshToken: "r1" };
const fresh: S = { accessToken: makeJwt(NOW / 1000 + 900), refreshToken: "r2" };

describe("refreshExpiredSessionAtBoot", () => {
  it("does nothing for a still-valid access token", async () => {
    const { deps } = setup(valid, async () => fresh);
    await expect(refreshExpiredSessionAtBoot(valid, deps, NOW)).resolves.toBe("fresh");
    expect(deps.refresh).not.toHaveBeenCalled();
  });

  it("refreshes an expired token before anything loads", async () => {
    const { deps } = setup(expired, async () => fresh);
    await expect(refreshExpiredSessionAtBoot(expired, deps, NOW)).resolves.toBe("installed");
    expect(deps.refresh).toHaveBeenCalledWith("r1");
    expect(deps.install).toHaveBeenCalledWith(fresh);
  });

  it("treats a token inside the 5 s skew as expired", async () => {
    const nearly: S = { accessToken: makeJwt(NOW / 1000 + 2), refreshToken: "r1" };
    const { deps } = setup(nearly, async () => fresh);
    await expect(refreshExpiredSessionAtBoot(nearly, deps, NOW)).resolves.toBe("installed");
  });

  it("signs out when the server refuses the refresh token", async () => {
    const { deps } = setup(expired, async () => {
      throw new ApiError("Session expired", 401);
    });
    await expect(refreshExpiredSessionAtBoot(expired, deps, NOW)).resolves.toBe("signed_out");
    expect(deps.signOut).toHaveBeenCalledOnce();
    expect(deps.install).not.toHaveBeenCalled();
  });

  it("keeps the session when offline so the cached data can still paint", async () => {
    const { deps } = setup(expired, async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(refreshExpiredSessionAtBoot(expired, deps, NOW)).resolves.toBe("offline");
    expect(deps.signOut).not.toHaveBeenCalled();
  });

  it("keeps the session on a server 5xx (cold start) instead of signing out", async () => {
    const { deps } = setup(expired, async () => {
      throw new ApiError("Session expired", 503);
    });
    await expect(refreshExpiredSessionAtBoot(expired, deps, NOW)).resolves.toBe("offline");
    expect(deps.signOut).not.toHaveBeenCalled();
  });

  it("keeps the session on 429 rate-limit instead of signing out", async () => {
    const { deps } = setup(expired, async () => {
      throw new ApiError("Too many requests", 429);
    });
    await expect(refreshExpiredSessionAtBoot(expired, deps, NOW)).resolves.toBe("offline");
    expect(deps.signOut).not.toHaveBeenCalled();
  });

  it("drops a late result when the session changed meanwhile", async () => {
    let release!: (s: S) => void;
    const { deps, swap } = setup(expired, () => new Promise<S>((r) => (release = r)));
    const pending = refreshExpiredSessionAtBoot(expired, deps, NOW);
    swap(null); // logout while refreshing
    release(fresh);
    await expect(pending).resolves.toBe("stale");
    expect(deps.install).not.toHaveBeenCalled();
  });

  it("does not sign out a newer session when a late refresh fails", async () => {
    let fail!: (e: unknown) => void;
    const { deps, swap } = setup(expired, () => new Promise<S>((_, j) => (fail = j)));
    const pending = refreshExpiredSessionAtBoot(expired, deps, NOW);
    swap(fresh); // another path already refreshed
    fail(new ApiError("Session expired", 401));
    await expect(pending).resolves.toBe("stale");
    expect(deps.signOut).not.toHaveBeenCalled();
  });
});
