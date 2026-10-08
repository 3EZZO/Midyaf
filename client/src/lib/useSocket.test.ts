import { describe, expect, it } from "vitest";
import {
  SOCKET_UNAUTHORIZED,
  buildSocketOptions,
  createSocketAuthRecovery,
  isSocketAuthError,
  loadForSession,
  refreshSessionIfCurrent
} from "./useSocket";

function handshakeToken(options: ReturnType<typeof buildSocketOptions>) {
  let sent: unknown;
  (options.auth as (callback: (data: object) => void) => void)((data) => {
    sent = (data as { token?: unknown }).token;
  });
  return sent;
}

describe("buildSocketOptions", () => {
  it("sends the current access token in the handshake", () => {
    expect(handshakeToken(buildSocketOptions(() => "token-a"))).toBe("token-a");
  });

  it("reads the latest token on every (re)connection, e.g. after a refresh", () => {
    let token = "token-a";
    const options = buildSocketOptions(() => token);
    expect(handshakeToken(options)).toBe("token-a");
    token = "token-b";
    expect(handshakeToken(options)).toBe("token-b");
  });

  it("sends an empty token after logout instead of a stale one", () => {
    expect(handshakeToken(buildSocketOptions(() => null))).toBe("");
  });

  it("keeps the existing transports and auto-connect behaviour", () => {
    expect(buildSocketOptions(() => "t")).toMatchObject({
      autoConnect: true,
      transports: ["websocket", "polling"]
    });
  });
});

describe("isSocketAuthError", () => {
  it("recognises the server's handshake rejection only", () => {
    expect(SOCKET_UNAUTHORIZED).toBe("unauthorized");
    expect(isSocketAuthError(new Error("unauthorized"))).toBe(true);
    expect(isSocketAuthError(new Error("xhr poll error"))).toBe(false);
    expect(isSocketAuthError("unauthorized")).toBe(false);
    expect(isSocketAuthError(undefined)).toBe(false);
  });
});

type TestSession = { accessToken: string; refreshToken: string; user: string };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function harness(initial: TestSession | null) {
  const state = { session: initial };
  const refreshes: Array<ReturnType<typeof deferred<TestSession>>> = [];
  const installed: TestSession[] = [];
  let signOuts = 0;
  const recovery = createSocketAuthRecovery<TestSession>({
    getSession: () => state.session,
    refresh: () => {
      const pending = deferred<TestSession>();
      refreshes.push(pending);
      return pending.promise;
    },
    install: (next) => {
      state.session = next;
      installed.push(next);
    },
    signOut: () => {
      state.session = null;
      signOuts += 1;
    }
  });
  return { state, refreshes, installed, recovery, signOuts: () => signOuts };
}

const alice = { accessToken: "a1", refreshToken: "ra", user: "alice" };

describe("createSocketAuthRecovery", () => {
  it("refreshes once and installs the new session", async () => {
    const h = harness(alice);
    h.recovery.onAuthError();
    h.refreshes[0].resolve({ ...alice, accessToken: "a2" });
    await flush();
    expect(h.installed.map((s) => s.accessToken)).toEqual(["a2"]);
  });

  it("bounds an episode: replacement tokens that are rejected again do not loop", async () => {
    const h = harness(alice);
    h.recovery.onAuthError();
    h.refreshes[0].resolve({ ...alice, accessToken: "a2" });
    await flush();
    h.recovery.onAuthError();
    h.recovery.onAuthError();
    expect(h.refreshes).toHaveLength(1);
  });

  it("starts a new episode after a successful connection", async () => {
    const h = harness(alice);
    h.recovery.onAuthError();
    h.refreshes[0].resolve({ ...alice, accessToken: "a2" });
    await flush();
    h.recovery.onConnected();
    h.recovery.onAuthError();
    expect(h.refreshes).toHaveLength(2);
  });

  it("drops a pending refresh result after logout (success or failure)", async () => {
    const h = harness(alice);
    h.recovery.onAuthError();
    h.state.session = null;
    h.recovery.reset();
    h.refreshes[0].resolve({ ...alice, accessToken: "a2" });
    await flush();
    expect(h.installed).toEqual([]);

    const g = harness(alice);
    g.recovery.onAuthError();
    g.state.session = null;
    g.refreshes[0].reject(new Error("refresh failed"));
    await flush();
    expect(g.signOuts()).toBe(0);
  });

  it("never restores the previous account after an account switch", async () => {
    const bob = { accessToken: "b1", refreshToken: "rb", user: "bob" };
    const h = harness(alice);
    h.recovery.onAuthError();
    h.state.session = bob;
    h.recovery.reset();
    h.refreshes[0].resolve({ ...alice, accessToken: "a2" });
    await flush();
    expect(h.installed).toEqual([]);
    expect(h.state.session).toBe(bob);

    const g = harness(alice);
    g.recovery.onAuthError();
    g.state.session = bob;
    g.refreshes[0].reject(new Error("refresh failed"));
    await flush();
    expect(g.signOuts()).toBe(0);
    expect(g.state.session).toBe(bob);
  });

  it("ignores its result when another refresh (bootstrap 401 path) already replaced the session", async () => {
    const h = harness(alice);
    h.recovery.onAuthError();
    const fromBootstrap = { ...alice, accessToken: "a3" };
    h.state.session = fromBootstrap;
    h.refreshes[0].resolve({ ...alice, accessToken: "a2" });
    await flush();
    expect(h.installed).toEqual([]);
    expect(h.state.session).toBe(fromBootstrap);
  });

  it("installs nothing when the refresh returns the same access token", async () => {
    const h = harness(alice);
    h.recovery.onAuthError();
    h.refreshes[0].resolve({ ...alice });
    await flush();
    expect(h.installed).toEqual([]);
    h.recovery.onAuthError();
    expect(h.refreshes).toHaveLength(1);
  });

  it("signs out once when the refresh fails for the same session", async () => {
    const h = harness(alice);
    h.recovery.onAuthError();
    h.refreshes[0].reject(new Error("refresh failed"));
    await flush();
    expect(h.signOuts()).toBe(1);
    h.recovery.onAuthError();
    expect(h.refreshes).toHaveLength(1);
  });

  it("does nothing without a session", () => {
    const h = harness(null);
    h.recovery.onAuthError();
    expect(h.refreshes).toHaveLength(0);
  });
});

/** loadForSession guards App.refreshData, which socket events trigger. */
describe("loadForSession", () => {
  function setup() {
    const state: { session: TestSession | null } = { session: alice };
    const response = deferred<string>();
    const applied: string[] = [];
    const run = loadForSession(
      alice,
      () => state.session,
      () => response.promise,
      (value) => applied.push(value)
    );
    return { state, response, applied, run };
  }

  it("applies the result while the session is unchanged", async () => {
    const t = setup();
    t.response.resolve("workspace-a");
    await expect(t.run).resolves.toBe(true);
    expect(t.applied).toEqual(["workspace-a"]);
  });

  it.each([
    ["logout", null],
    ["account switch", { accessToken: "b1", refreshToken: "rb", user: "bob" }],
    ["token refresh", { ...alice, accessToken: "a2" }]
  ])("drops a deferred response after %s", async (_name, next) => {
    const t = setup();
    t.state.session = next;
    t.response.resolve("workspace-a");
    await expect(t.run).resolves.toBe(false);
    expect(t.applied).toEqual([]);
  });

  it("propagates a load failure without applying anything", async () => {
    const t = setup();
    t.response.reject(new Error("network"));
    await expect(t.run).rejects.toThrow("network");
    expect(t.applied).toEqual([]);
  });
});

/**
 * refreshSessionIfCurrent is shared by the socket recovery and App's
 * bootstrap 401 path, so concurrent refreshes from both are covered here.
 */
describe("refreshSessionIfCurrent", () => {
  function shared(initial: TestSession | null) {
    const state = { session: initial };
    const pending: Array<ReturnType<typeof deferred<TestSession>>> = [];
    const installed: string[] = [];
    let signOuts = 0;
    const deps = {
      getSession: () => state.session,
      refresh: () => {
        const next = deferred<TestSession>();
        pending.push(next);
        return next.promise;
      },
      install: (next: TestSession) => {
        state.session = next;
        installed.push(next.accessToken);
      },
      signOut: () => {
        state.session = null;
        signOuts += 1;
      }
    };
    return { state, pending, installed, deps, signOuts: () => signOuts };
  }

  it.each([
    ["bootstrap first", 0, 1],
    ["socket first", 1, 0]
  ])("installs only the first of two concurrent refreshes (%s)", async (_name, first, second) => {
    const h = shared(alice);
    const bootstrap = refreshSessionIfCurrent(alice, h.deps);
    const socket = refreshSessionIfCurrent(alice, h.deps);
    const outcomes = [bootstrap, socket];

    h.pending[first].resolve({ ...alice, accessToken: `a-${first}` });
    await expect(outcomes[first]).resolves.toBe("installed");
    h.pending[second].resolve({ ...alice, accessToken: `a-${second}` });
    await expect(outcomes[second]).resolves.toBe("stale");

    expect(h.installed).toEqual([`a-${first}`]);
  });

  it.each([
    ["bootstrap first", 0, 1],
    ["socket first", 1, 0]
  ])("a late failure never signs out the session another refresh installed (%s)", async (_name, first, second) => {
    const h = shared(alice);
    const outcomes = [refreshSessionIfCurrent(alice, h.deps), refreshSessionIfCurrent(alice, h.deps)];

    h.pending[first].resolve({ ...alice, accessToken: "a-new" });
    await outcomes[first];
    h.pending[second].reject(new Error("refresh failed"));
    await expect(outcomes[second]).resolves.toBe("stale");

    expect(h.signOuts()).toBe(0);
    expect(h.state.session?.accessToken).toBe("a-new");
  });

  it("drops success and failure that complete after a logout", async () => {
    const h = shared(alice);
    const success = refreshSessionIfCurrent(alice, h.deps);
    const failure = refreshSessionIfCurrent(alice, h.deps);
    h.state.session = null;
    h.pending[0].resolve({ ...alice, accessToken: "a2" });
    h.pending[1].reject(new Error("refresh failed"));

    await expect(success).resolves.toBe("stale");
    await expect(failure).resolves.toBe("stale");
    expect(h.installed).toEqual([]);
    expect(h.signOuts()).toBe(0);
  });

  it("keeps the newly signed-in account when the old refresh completes", async () => {
    const bob = { accessToken: "b1", refreshToken: "rb", user: "bob" };
    const h = shared(alice);
    const outcome = refreshSessionIfCurrent(alice, h.deps);
    h.state.session = bob;
    h.pending[0].resolve({ ...alice, accessToken: "a2" });

    await expect(outcome).resolves.toBe("stale");
    expect(h.state.session).toBe(bob);
  });

  it("reports unchanged tokens and signs out on a current failure", async () => {
    const h = shared(alice);
    const unchanged = refreshSessionIfCurrent(alice, h.deps);
    h.pending[0].resolve({ ...alice });
    await expect(unchanged).resolves.toBe("unchanged");
    expect(h.installed).toEqual([]);

    const failed = refreshSessionIfCurrent(alice, h.deps);
    h.pending[1].reject(new Error("refresh failed"));
    await expect(failed).resolves.toBe("signed_out");
    expect(h.signOuts()).toBe(1);
  });
});
