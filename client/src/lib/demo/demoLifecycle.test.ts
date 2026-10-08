import { beforeEach, describe, expect, it } from "vitest";
import type { Driver, Guest, Task } from "@shared/domain";
import { liveEvents, type LiveEvent } from "../liveEvents";
import {
  DemoLifecycle,
  LOG_LIMIT,
  appendLog,
  enterRehearsal,
  leaveRehearsal,
  withoutDirectorLog,
  type DemoTicket,
  type LogEntry
} from "./demoLifecycle";
import { Director } from "./director";
import { sovereignArrival } from "./scripts/sovereignArrival";

/**
 * VIS-05: leaving a rehearsal must be immediate and complete without a page
 * refresh, and no late callback may write rehearsal state onto normal data,
 * onto a newer rehearsal or into the next session. The App wiring follows
 * these exact steps; the browser toggle itself is Codex's check.
 */

const driver = (id: string, name: string): Driver =>
  ({ id, userId: `u-${id}`, zone: "NORTH_ZONE", status: "AVAILABLE", user: { id: `u-${id}`, name } }) as unknown as Driver;

const context = {
  drivers: [
    driver("d1", "Sultan Al-Otaibi"),
    driver("d2", "Fahad Al Qahtani"),
    driver("d3", "Rakan Al-Dossary"),
    driver("d4", "Tariq Al-Ghamdi"),
    driver("d5", "Nasser Al-Mutairi")
  ],
  tasks: [
    { id: "t1", type: "AIRPORT_PICKUP", status: "PENDING", pickupLocation: "Airport" },
    { id: "t2", type: "VENUE_TRANSFER", status: "PENDING", pickupLocation: "Venue" }
  ] as unknown as Task[],
  guests: [{ id: "g1", isVIP: true, user: { id: "u-g1", name: "Guest One" } }] as unknown as Guest[]
};

function run(director: Director, ms: number, frame = 100) {
  for (let t = 0; t < ms; t += frame) director.tick(Math.min(frame, ms - t));
}

describe("DemoLifecycle gates", () => {
  it("lets a normal-mode load show its result", () => {
    const lifecycle = new DemoLifecycle();
    const ticket = lifecycle.ticket();
    expect(ticket.canShow()).toBe(true);
  });

  it("keeps a load started before the rehearsal from painting over it", () => {
    const lifecycle = new DemoLifecycle();
    const before = lifecycle.ticket();
    lifecycle.enter();
    expect(before.canShow()).toBe(false);
    // Nor after the rehearsal ends: the exit's own refresh owns the display.
    lifecycle.exit();
    expect(before.canShow()).toBe(false);
    expect(lifecycle.ticket().canShow()).toBe(true);
  });

  it("never shows a load taken during a rehearsal, even after exit", () => {
    const lifecycle = new DemoLifecycle();
    lifecycle.enter();
    const during = lifecycle.ticket();
    expect(during.canShow()).toBe(false);
    lifecycle.exit();
    expect(during.canShow()).toBe(false);
  });

  it("scopes director writes to the rehearsal that emitted them across rapid re-entry", () => {
    const lifecycle = new DemoLifecycle();
    const first = lifecycle.enter();
    expect(lifecycle.isRehearsal(first)).toBe(true);
    lifecycle.exit();
    expect(lifecycle.isRehearsal(first)).toBe(false);
    const second = lifecycle.enter();
    expect(second).not.toBe(first);
    // A late event from the first run does not land on the second.
    expect(lifecycle.isRehearsal(first)).toBe(false);
    expect(lifecycle.isRehearsal(second)).toBe(true);
  });

  it("treats a repeated exit (e.g. sign-out after leaving) as a no-op", () => {
    const lifecycle = new DemoLifecycle();
    const ticket = lifecycle.ticket();
    expect(lifecycle.exit()).toBe(0);
    expect(lifecycle.active).toBe(false);
    expect(ticket.canShow()).toBe(true);
  });
});

/**
 * The same steps App takes for a workspace load (loadSessionData and
 * refreshData share them): session guard, ordering claim, normal snapshot,
 * then display only if the rehearsal gate allows; and for toggling demo.
 */
type Workspace = { session: string | null; normal: string | null; shown: string | null; cache: string | null };

function settle(ws: Workspace, ticket: DemoTicket, session: string, fresh: string) {
  if (ws.session !== session) return;
  if (!ticket.claim()) return;
  ws.normal = fresh;
  ws.cache = fresh;
  if (ticket.canShow()) ws.shown = fresh;
}

function enterDemo(lifecycle: DemoLifecycle, ws: Workspace) {
  if (ws.shown) ws.normal = ws.shown;
  lifecycle.enter();
  ws.shown = "rehearsal";
}

function exitDemo(lifecycle: DemoLifecycle, ws: Workspace) {
  lifecycle.exit();
  if (ws.normal) ws.shown = ws.normal;
}

describe("workspace load ordering", () => {
  const workspace = (): Workspace => ({ session: "s1", normal: null, shown: null, cache: null });

  it("drops an older response that settles after a newer one", () => {
    const lifecycle = new DemoLifecycle();
    const ws = workspace();
    const older = lifecycle.ticket();
    const newer = lifecycle.ticket();
    expect(newer.seq).toBeGreaterThan(older.seq);
    settle(ws, newer, "s1", "v2");
    settle(ws, older, "s1", "v1");
    expect(ws).toMatchObject({ normal: "v2", shown: "v2", cache: "v2" });
  });

  it("applies both responses when they settle in start order", () => {
    const lifecycle = new DemoLifecycle();
    const ws = workspace();
    const first = lifecycle.ticket();
    const second = lifecycle.ticket();
    settle(ws, first, "s1", "v1");
    expect(ws.shown).toBe("v1");
    settle(ws, second, "s1", "v2");
    expect(ws).toMatchObject({ normal: "v2", shown: "v2", cache: "v2" });
  });

  it("a load begun before enter cannot replace the exit refresh's snapshot", () => {
    const lifecycle = new DemoLifecycle();
    const ws = workspace();
    settle(ws, lifecycle.ticket(), "s1", "v0");
    const beforeEnter = lifecycle.ticket();
    enterDemo(lifecycle, ws);
    exitDemo(lifecycle, ws);
    const exitRefresh = lifecycle.ticket();
    settle(ws, exitRefresh, "s1", "v2");
    settle(ws, beforeEnter, "s1", "v1-stale");
    expect(ws).toMatchObject({ normal: "v2", shown: "v2", cache: "v2" });
    // The next rehearsal saves, and its exit restores, the fresh data.
    enterDemo(lifecycle, ws);
    expect(ws.shown).toBe("rehearsal");
    exitDemo(lifecycle, ws);
    expect(ws.shown).toBe("v2");
  });

  it("a load settling during the rehearsal refreshes normal data without painting", () => {
    const lifecycle = new DemoLifecycle();
    const ws = workspace();
    settle(ws, lifecycle.ticket(), "s1", "v0");
    const beforeEnter = lifecycle.ticket();
    enterDemo(lifecycle, ws);
    const during = lifecycle.ticket();
    settle(ws, beforeEnter, "s1", "v1");
    expect(ws).toMatchObject({ normal: "v1", shown: "rehearsal" });
    settle(ws, during, "s1", "v2");
    expect(ws).toMatchObject({ normal: "v2", shown: "rehearsal", cache: "v2" });
    exitDemo(lifecycle, ws);
    expect(ws.shown).toBe("v2");
    // The exit refresh is newer still and owns the display.
    settle(ws, lifecycle.ticket(), "s1", "v3");
    expect(ws).toMatchObject({ normal: "v3", shown: "v3" });
  });

  it("a load settling after exit but before the exit refresh writes normal data only", () => {
    const lifecycle = new DemoLifecycle();
    const ws = workspace();
    settle(ws, lifecycle.ticket(), "s1", "v0");
    enterDemo(lifecycle, ws);
    const during = lifecycle.ticket();
    exitDemo(lifecycle, ws);
    const exitRefresh = lifecycle.ticket();
    settle(ws, during, "s1", "v1");
    expect(ws).toMatchObject({ normal: "v1", shown: "v0" });
    settle(ws, exitRefresh, "s1", "v2");
    expect(ws).toMatchObject({ normal: "v2", shown: "v2" });
  });

  it("rejects a previous session's load after logout or an account switch", () => {
    const lifecycle = new DemoLifecycle();
    const ws = workspace();
    const previous = lifecycle.ticket();
    // Logout clears the session and snapshot; another account signs in.
    ws.session = null;
    ws.normal = ws.shown = ws.cache = null;
    settle(ws, previous, "s1", "s1-data");
    expect(ws).toMatchObject({ normal: null, shown: null, cache: null });
    ws.session = "s2";
    const next = lifecycle.ticket();
    settle(ws, previous, "s1", "s1-data");
    expect(ws.shown).toBeNull();
    settle(ws, next, "s2", "s2-data");
    expect(ws).toMatchObject({ normal: "s2-data", shown: "s2-data" });
  });

  it("a stale-session response does not block the new session's loads", () => {
    const lifecycle = new DemoLifecycle();
    const ws = workspace();
    const previous = lifecycle.ticket();
    ws.session = "s2";
    const next = lifecycle.ticket();
    // The rejected response never claimed, so the new load still writes.
    settle(ws, previous, "s1", "s1-data");
    settle(ws, next, "s2", "s2-data");
    expect(ws.shown).toBe("s2-data");
  });
});

describe("top-bar log", () => {
  it("removes only rehearsal lines, newest first", () => {
    let log: LogEntry[] = [];
    log = appendLog(log, "socket: task changed", "socket");
    log = appendLog(log, "director: act 1", "director");
    log = appendLog(log, "socket: guest arrived", "socket");
    log = appendLog(log, "director: geofence", "director");
    expect(withoutDirectorLog(log).map((e) => e.line)).toEqual([
      "socket: guest arrived",
      "socket: task changed"
    ]);
  });

  it("keeps the same array when there is nothing to remove and caps its length", () => {
    const socketOnly = appendLog([], "socket line", "socket");
    expect(withoutDirectorLog(socketOnly)).toBe(socketOnly);
    let log: LogEntry[] = [];
    for (let i = 0; i < LOG_LIMIT + 5; i++) log = appendLog(log, `line ${i}`, "director");
    expect(log).toHaveLength(LOG_LIMIT);
    expect(log[0].line).toBe(`line ${LOG_LIMIT + 4}`);
  });
});

describe("enterRehearsal / leaveRehearsal", () => {
  let lifecycle: DemoLifecycle;
  let director: Director;
  const deps = () => ({ lifecycle, director, events: liveEvents });

  beforeEach(() => {
    liveEvents.clear();
    lifecycle = new DemoLifecycle();
    director = new Director({ now: () => 1_700_000_000_000 });
    director.setContext(context);
  });

  function startRehearsal() {
    const epoch = enterRehearsal(deps());
    director.load(sovereignArrival);
    director.play();
    return epoch;
  }

  it("stops the director, clears its history and keeps socket history", () => {
    liveEvents.emit("guest:arrived", { guestId: "real-guest" }, "socket");
    const epoch = startRehearsal();
    run(director, 40_000);
    liveEvents.emit("task:status_change", { taskId: "real-task", status: "COMPLETED" }, "socket");
    expect(liveEvents.history().some((e) => e.source === "director")).toBe(true);

    leaveRehearsal(deps());

    expect(lifecycle.active).toBe(false);
    expect(lifecycle.isRehearsal(epoch)).toBe(false);
    expect(director.getState().status).toBe("idle");
    expect(director.getState().scorecardVisible).toBe(false);
    const history = liveEvents.history();
    expect(history.map((e) => e.source)).toEqual(["socket", "socket"]);
    expect(history.map((e) => e.name)).toEqual(["task:status_change", "guest:arrived"]);
  });

  it("drops a late frame after the exit", () => {
    startRehearsal();
    run(director, 10_000);
    leaveRehearsal(deps());

    const late: LiveEvent[] = [];
    const off = liveEvents.onAny((e) => late.push(e));
    run(director, 20_000);
    off();
    expect(late).toEqual([]);
    expect(liveEvents.history()).toEqual([]);
  });

  it("re-enters with a clean rehearsal and no history from the previous one", () => {
    startRehearsal();
    director.seekAct(4);
    run(director, 60_000);
    leaveRehearsal(deps());

    const epoch = startRehearsal();
    const state = director.getState();
    expect(lifecycle.isRehearsal(epoch)).toBe(true);
    expect(state.actIndex).toBe(0);
    expect(state.scorecardVisible).toBe(false);
    // Only the new run's setup is in the history.
    const acts = liveEvents
      .history()
      .filter((e) => e.name === "demo:act")
      .map((e) => (e.payload as { index: number }).index);
    expect(acts).toEqual([0]);
  });

  it("enter also clears director leftovers that were never cleaned", () => {
    liveEvents.emit("demo:ticker", { en: "stale", ar: "قديم" }, "director");
    liveEvents.emit("guest:arrived", { guestId: "real-guest" }, "socket");
    enterRehearsal(deps());
    expect(liveEvents.history().map((e) => e.source)).toEqual(["socket"]);
  });

  it("sign-out leaves no rehearsal, director state or session history", () => {
    liveEvents.emit("guest:arrived", { guestId: "previous-user-guest" }, "socket");
    const before = lifecycle.ticket();
    startRehearsal();
    run(director, 20_000);

    leaveRehearsal(deps(), { forgetAllHistory: true });

    expect(lifecycle.active).toBe(false);
    expect(director.getState().status).toBe("idle");
    expect(director.getState().scriptId).toBeNull();
    expect(liveEvents.history()).toEqual([]);
    // A load the previous session started cannot show afterwards either.
    expect(before.canShow()).toBe(false);
  });
});
