import { beforeEach, describe, expect, it } from "vitest";
import type { Driver, Guest, Task } from "@shared/domain";
import { liveEvents, type LiveEvent } from "../liveEvents";
import { Director, type Script } from "./director";
import { sovereignArrival } from "./scripts/sovereignArrival";
import { DEMO_DRIVER_ROUTES } from "./data";

const driver = (id: string, name: string): Driver =>
  ({
    id,
    userId: `u-${id}`,
    licenseNo: "L",
    zone: "NORTH_ZONE",
    status: "AVAILABLE",
    user: { id: `u-${id}`, name }
  }) as unknown as Driver;

const task = (id: string, type: string, pickupLocation: string): Task =>
  ({ id, type, status: "PENDING", pickupLocation }) as unknown as Task;

const guest = (id: string, name: string, isVIP = true): Guest =>
  ({ id, isVIP, user: { id: `u-${id}`, name } }) as unknown as Guest;

const context = {
  drivers: [
    driver("d1", "Sultan Al-Otaibi"),
    driver("d2", "Fahad Al Qahtani"),
    driver("d3", "Rakan Al-Dossary"),
    driver("d4", "Tariq Al-Ghamdi"),
    driver("d5", "Nasser Al-Mutairi")
  ],
  tasks: [
    task("t1", "AIRPORT_PICKUP", "King Khalid International Airport"),
    task("t2", "VENUE_TRANSFER", "Voco Summit Hotel")
  ],
  guests: [guest("g1", "Noura Al Harbi"), guest("g2", "Jamie Dimon")]
};

function capture() {
  const events: LiveEvent[] = [];
  const off = liveEvents.onAny((e) => events.push(e));
  return { events, off };
}

/** Advance in 100 ms frames so beats and ticks fire in order, like rAF would. */
function run(director: Director, ms: number, frame = 100) {
  for (let t = 0; t < ms; t += frame) director.tick(Math.min(frame, ms - t));
}

describe("Director", () => {
  let director: Director;
  beforeEach(() => {
    liveEvents.clear();
    director = new Director({ now: () => 1_700_000_000_000 });
    director.setContext(context);
  });

  it("resolves demo captains by name and exposes their ids as controlled", () => {
    const ids = [...director.controlledDriverIds()].sort();
    expect(ids).toEqual(["d1", "d2", "d3", "d4", "d5"]);
    expect(director.getState().convoys.sultan.driverId).toBe("d1");
  });

  it("runs setup on load and publishes the same event types as the socket", () => {
    const { events, off } = capture();
    director.load(sovereignArrival);
    off();
    const names = new Set(events.map((e) => e.name));
    expect(events.every((e) => e.source === "director")).toBe(true);
    expect(names.has("driver:location_update")).toBe(true);
    expect(names.has("task:status_change")).toBe(true);
    expect(names.has("corridor:state")).toBe(true);
    expect(names.has("demo:act")).toBe(true);
    const sultan = director.getState().convoys.sultan;
    expect(sultan.position).toEqual([
      DEMO_DRIVER_ROUTES.sultan[0].lat,
      DEMO_DRIVER_ROUTES.sultan[0].lng
    ]);
    expect(sultan.ring).toBe("DOCKED_BAY");
    expect(sultan.siteCode).toBe("KKIA_ROYAL_T5");
    expect(director.getState().status).toBe("idle");
  });

  it("fires beats in order and glides convoys along the route with scripted speeds", () => {
    director.load(sovereignArrival);
    director.play();
    const { events, off } = capture();
    run(director, 40_000);
    off();
    const state = director.getState();
    expect(state.status).toBe("playing");
    expect(state.actIndex).toBe(0);
    expect(state.actElapsedMs).toBe(40_000);
    // The airport task went ASSIGNED → EN_ROUTE at t=30s.
    const statuses = events
      .filter((e) => e.name === "task:status_change")
      .map((e) => (e.payload as { status: string }).status);
    expect(statuses).toContain("EN_ROUTE");
    // Alpha is in motion, with a plausible speed and a decreasing ETA.
    const sultan = state.convoys.sultan;
    expect(sultan.moving).toBe(true);
    expect(sultan.speedKmh).toBeGreaterThan(0);
    expect(sultan.speedKmh).toBeLessThan(120);
    expect(sultan.etaSeconds).toBeGreaterThan(0);
    const fixes = events.filter(
      (e) =>
        e.name === "driver:location_update" &&
        (e.payload as { driverId: string }).driverId === "d1"
    );
    expect(fixes.length).toBeGreaterThan(2);
  });

  it("derives geofence transitions from motion, departing then approaching", () => {
    director.load(sovereignArrival);
    director.play();
    const { events, off } = capture();
    // Act 1 (leave KKIA) + all of Act 2 (arrive at Ritz staging hold).
    run(
      director,
      sovereignArrival.acts[0].durationMs +
        sovereignArrival.acts[1].durationMs -
        1000
    );
    off();
    const transitions = events
      .filter(
        (e) =>
          e.name === "geofence:transition" &&
          (e.payload as { driverId: string }).driverId === "d1"
      )
      .map(
        (e) =>
          e.payload as {
            geofenceCode: string;
            currentRing: string;
            direction: string;
          }
      );
    const departing = transitions.filter(
      (t) => t.geofenceCode === "KKIA_ROYAL_T5"
    );
    expect(departing.length).toBeGreaterThan(0);
    expect(departing.every((t) => t.direction === "DEPARTING")).toBe(true);
    const arriving = transitions.filter(
      (t) => t.geofenceCode === "RITZ_CARLTON_RIYADH"
    );
    expect(arriving.map((t) => t.currentRing)).toEqual([
      "OUTER_APPROACH",
      "STAGING_HOLD"
    ]);
    expect(director.getState().convoys.sultan.ring).toBe("STAGING_HOLD");
  });

  it("jumps cold to Act 4 with a consistent world and reaches the scorecard", () => {
    director.load(sovereignArrival);
    director.seekAct(3);
    const s = director.getState();
    expect(s.actIndex).toBe(3);
    expect(s.actId).toBe("sandstorm");
    expect(s.convoys.sultan.ring).toBe("CURBSIDE_GATE");
    expect(s.convoys.sultan.siteCode).toBe("RITZ_CARLTON_RIYADH");
    director.play();
    const { events, off } = capture();
    run(director, 20_000);
    const corridor = events
      .filter((e) => e.name === "corridor:state")
      .map((e) => (e.payload as { state: string }).state);
    expect(corridor).toEqual(["closed", "reroute"]);
    expect(events.some((e) => e.name === "fleet:diverted")).toBe(true);
    expect(events.some((e) => e.name === "demo:brief")).toBe(true);
    run(director, sovereignArrival.acts[3].durationMs);
    expect(director.getState().actIndex).toBe(4);
    run(director, 40_000);
    off();
    expect(director.getState().scorecardVisible).toBe(true);
    expect(
      events.some(
        (e) =>
          e.name === "guest:arrived" &&
          (e.payload as { guestId: string }).guestId === "g1"
      )
    ).toBe(true);
    expect(director.getState().convoys.sultan.ring).toBe("DOCKED_BAY");
  });

  it("pause freezes the clock and motions; play resumes in place", () => {
    director.load(sovereignArrival);
    director.play();
    run(director, 35_000);
    director.pause();
    const frozen = director.getState();
    run(director, 10_000);
    expect(director.getState().actElapsedMs).toBe(frozen.actElapsedMs);
    expect(director.getState().convoys.sultan.position).toEqual(
      frozen.convoys.sultan.position
    );
    director.play();
    run(director, 5_000);
    expect(director.getState().actElapsedMs).toBe(frozen.actElapsedMs + 5_000);
  });

  it("ends after the last act and restarts from Act 1 on play", () => {
    const short: Script = {
      id: "s",
      title: { en: "s", ar: "s" },
      acts: [
        {
          id: "a",
          title: { en: "a", ar: "a" },
          durationMs: 1000,
          setup: [],
          beats: []
        },
        {
          id: "b",
          title: { en: "b", ar: "b" },
          durationMs: 1000,
          setup: [],
          beats: []
        }
      ]
    };
    director.load(short);
    director.play();
    run(director, 2500);
    expect(director.getState().status).toBe("ended");
    expect(director.getState().totalElapsedMs).toBe(2000);
    director.play();
    expect(director.getState().status).toBe("playing");
    expect(director.getState().actIndex).toBe(0);
  });
});
