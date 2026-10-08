import { beforeEach, describe, expect, it } from "vitest";
import { eventsPerMinute, liveEvents } from "./liveEvents";

describe("liveEvents.clearSource", () => {
  beforeEach(() => liveEvents.clear());

  it("drops only the director's history and keeps socket events in order", () => {
    liveEvents.emit("task:status_change", { taskId: "t1", status: "EN_ROUTE" }, "socket");
    liveEvents.emit("demo:ticker", { en: "Act 1", ar: "الفصل 1" }, "director");
    liveEvents.emit("guest:arrived", { guestId: "g1" }, "socket");
    liveEvents.emit("fleet:diverted", { message: "Rerouted" }, "director");

    liveEvents.clearSource("director");

    const history = liveEvents.history();
    expect(history.map((e) => e.source)).toEqual(["socket", "socket"]);
    expect(history.map((e) => e.name)).toEqual(["guest:arrived", "task:status_change"]);
    // Derived counts follow the cleaned history.
    expect(eventsPerMinute().reduce((a, b) => a + b, 0)).toBe(2);
  });

  it("does not replay events to listeners while clearing", () => {
    const seen: string[] = [];
    const off = liveEvents.onAny((e) => seen.push(e.name));
    liveEvents.emit("demo:ticker", { en: "x", ar: "x" }, "director");
    liveEvents.clearSource("director");
    off();
    expect(seen).toEqual(["demo:ticker"]);
    expect(liveEvents.history()).toEqual([]);
  });

  it("leaves the history untouched when that source has nothing stored", () => {
    liveEvents.emit("guest:arrived", { guestId: "g1" }, "socket");
    const before = liveEvents.history();
    liveEvents.clearSource("director");
    expect(liveEvents.history()).toBe(before);
  });
});
