import type { CorridorCode, CorridorState } from "@shared/constants";
import { CONCENTRIC_GEOFENCES } from "@shared/constants";
import type {
  Driver,
  GeofenceRingType,
  GeofenceTransitionEvent,
  Guest,
  Task,
  TaskStatus
} from "@shared/domain";
import {
  distanceMeters,
  lerpLatLng,
  type LatLngTuple
} from "../../components/map/geometry";
import { SIM_TICK_MS } from "../../components/map/constants";
import { getMapController } from "../../components/map/MapController";
import {
  liveEvents,
  type LiveEventName,
  type LiveEventPayload
} from "../liveEvents";
import { tacticalAudio, type AudioCue } from "../tacticalAudio";
import {
  DEMO_DRIVER_KEYS,
  DEMO_DRIVER_ROUTES,
  DEMO_VIP_GUESTS,
  type Bilingual,
  type DemoDriverKey,
  type FlightPhase,
  type Waypoint
} from "./data";

/**
 * The demo director: a scripted, act-based player that drives the very same
 * event bus the socket does. It owns a clock, five convoy motions and a small
 * geofence engine that mirrors the server's — so a rehearsal produces
 * `driver:location_update` and `geofence:transition` exactly as a real
 * captain's phone would. Nothing in here touches React; `useDemoDirector`
 * binds it to the workspace state.
 */

// ── Script shape ─────────────────────────────────────────────────────────

/**
 * A path along a captain's route: waypoint indices, an explicit point list,
 * or `toward` — a straight run from wherever the convoy currently is to one
 * waypoint. `stopShortMeters` trims the end so the convoy parks inside a
 * ring instead of on top of the site marker.
 */
export type PathSpec =
  | { from: number; to: number; stopShortMeters?: number }
  | { toward: number; stopShortMeters?: number }
  | { points: Waypoint[]; stopShortMeters?: number };

export type Ring = GeofenceRingType | "OUTSIDE";

export type Command =
  | { type: "convoy.place"; driver: DemoDriverKey; path: PathSpec }
  | {
      type: "convoy.moveAlong";
      driver: DemoDriverKey;
      path: PathSpec;
      durationMs: number;
    }
  | {
      type: "geofence.transition";
      driver: DemoDriverKey;
      site: string;
      ring: Ring;
      previousRing: Ring;
    }
  | {
      type: "task.setStatus";
      task: "airport" | "venue" | number;
      status: TaskStatus;
    }
  | { type: "guest.arrived"; vipId: string }
  | {
      type: "corridor.setState";
      code: CorridorCode;
      state: CorridorState;
      reason?: Bilingual;
    }
  | { type: "fleet.diverted"; message: Bilingual }
  | { type: "camera.focusConvoy"; driver: DemoDriverKey; zoom?: number }
  | { type: "camera.frameCorridor"; code: CorridorCode }
  | { type: "camera.overview" }
  | { type: "ticker.push"; text: Bilingual; tag?: string }
  | {
      type: "toast";
      tone: "success" | "info" | "warning" | "alert";
      title: Bilingual;
      message?: Bilingual;
    }
  | { type: "audio.cue"; cue: AudioCue }
  | { type: "highlight"; panelId: string; durationMs?: number }
  | { type: "ai.brief"; promptId: string }
  | { type: "flight.setPhase"; flightNo: string; phase: FlightPhase }
  | { type: "scorecard"; visible: boolean }
  | { type: "tminus.set"; inMs: number | null };

export type Beat = { at: number; cmd: Command };

export type Act = {
  id: string;
  title: Bilingual;
  subtitle?: Bilingual;
  durationMs: number;
  /** Runs instantly on every entry (play-through or jump) so each act is self-contained. */
  setup: Command[];
  beats: Beat[];
};

export type Script = { id: string; title: Bilingual; acts: Act[] };

// ── Runtime state ────────────────────────────────────────────────────────

export type DirectorStatus = "idle" | "playing" | "paused" | "ended";

export type ConvoySnapshot = {
  driver: DemoDriverKey;
  driverId: string | null;
  position: LatLngTuple | null;
  speedKmh: number;
  moving: boolean;
  /** 0–1 along the current motion; 1 when parked. */
  progress: number;
  /** Demo-clock seconds until the current motion ends; 0 when parked. */
  etaSeconds: number;
  remainingMeters: number;
  location: Bilingual | null;
  /** Innermost ring at the nearest site, as the built-in geofence engine sees it. */
  ring: Ring;
  siteCode: string | null;
};

export type DirectorState = {
  status: DirectorStatus;
  scriptId: string | null;
  actIndex: number;
  actCount: number;
  actId: string | null;
  actTitle: Bilingual | null;
  actSubtitle: Bilingual | null;
  actElapsedMs: number;
  actDurationMs: number;
  totalElapsedMs: number;
  totalDurationMs: number;
  convoys: Record<DemoDriverKey, ConvoySnapshot>;
  flights: Record<string, FlightPhase>;
  landingAt: number | null;
  scorecardVisible: boolean;
  /** Bumps whenever an act is (re)entered, so title cards replay on jumps. */
  actEntryToken: number;
};

export type DirectorContext = {
  drivers: Driver[];
  tasks: Task[];
  guests: Guest[];
};

export type DirectorHooks = {
  toast?: (
    tone: "success" | "info" | "warning" | "alert",
    title: Bilingual,
    message?: Bilingual
  ) => void;
  now?: () => number;
};

type Motion = {
  points: LatLngTuple[];
  speeds: number[];
  labels: Bilingual[];
  cumulative: number[];
  totalMeters: number;
  startAt: number;
  durationMs: number;
  lastEmitAt: number;
  done: boolean;
};

type ConvoyRuntime = {
  key: DemoDriverKey;
  position: LatLngTuple | null;
  speedKmh: number;
  location: Bilingual | null;
  motion: Motion | null;
  ring: Ring;
  siteCode: string | null;
  seeded: boolean;
};

const emptyConvoy = (key: DemoDriverKey): ConvoySnapshot => ({
  driver: key,
  driverId: null,
  position: null,
  speedKmh: 0,
  moving: false,
  progress: 1,
  etaSeconds: 0,
  remainingMeters: 0,
  location: null,
  ring: "OUTSIDE",
  siteCode: null
});

const RING_ORDER: Ring[] = [
  "OUTSIDE",
  "OUTER_APPROACH",
  "STAGING_HOLD",
  "CURBSIDE_GATE",
  "DOCKED_BAY"
];

export class Director {
  private script: Script | null = null;
  private context: DirectorContext = { drivers: [], tasks: [], guests: [] };
  private hooks: DirectorHooks = {};
  private listeners = new Set<() => void>();
  private state: DirectorState;
  private convoys: Record<DemoDriverKey, ConvoyRuntime>;
  private actElapsed = 0;
  private firedBeats = 0;
  private frame: number | null = null;
  private lastFrameAt = 0;
  private driverIdCache = new Map<DemoDriverKey, string | null>();

  constructor(hooks: DirectorHooks = {}) {
    this.hooks = hooks;
    this.convoys = Object.fromEntries(
      DEMO_DRIVER_KEYS.map((key) => [
        key,
        {
          key,
          position: null,
          speedKmh: 0,
          location: null,
          motion: null,
          ring: "OUTSIDE",
          siteCode: null,
          seeded: false
        }
      ])
    ) as Record<DemoDriverKey, ConvoyRuntime>;
    this.state = {
      status: "idle",
      scriptId: null,
      actIndex: 0,
      actCount: 0,
      actId: null,
      actTitle: null,
      actSubtitle: null,
      actElapsedMs: 0,
      actDurationMs: 0,
      totalElapsedMs: 0,
      totalDurationMs: 0,
      convoys: Object.fromEntries(
        DEMO_DRIVER_KEYS.map((k) => [k, emptyConvoy(k)])
      ) as Record<DemoDriverKey, ConvoySnapshot>,
      flights: {},
      landingAt: null,
      scorecardVisible: false,
      actEntryToken: 0
    };
  }

  // ── Store API ──────────────────────────────────────────────────────────

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getState = (): DirectorState => this.state;

  private set(patch: Partial<DirectorState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn());
  }

  setHooks(hooks: DirectorHooks) {
    this.hooks = { ...this.hooks, ...hooks };
  }

  /** Workspace snapshot the script resolves names against. Cheap; call on every data change. */
  setContext(context: DirectorContext) {
    this.context = context;
    this.driverIdCache.clear();
    let changed = false;
    const convoys = { ...this.state.convoys };
    for (const key of DEMO_DRIVER_KEYS) {
      const driverId = this.driverId(key);
      if (convoys[key].driverId === driverId) continue;
      convoys[key] = { ...convoys[key], driverId };
      changed = true;
    }
    if (changed) this.set({ convoys });
  }

  /** Ids of the drivers the script controls — the socket gate drops live telemetry for these. */
  controlledDriverIds(): Set<string> {
    const ids = new Set<string>();
    for (const key of DEMO_DRIVER_KEYS) {
      const id = this.driverId(key);
      if (id) ids.add(id);
    }
    return ids;
  }

  load(script: Script) {
    this.stopClock();
    this.script = script;
    this.set({
      status: "idle",
      scriptId: script.id,
      actCount: script.acts.length,
      totalDurationMs: script.acts.reduce(
        (sum, act) => sum + act.durationMs,
        0
      ),
      totalElapsedMs: 0
    });
    this.enterAct(0);
  }

  // ── Transport ──────────────────────────────────────────────────────────

  play() {
    if (!this.script) return;
    if (this.state.status === "ended") {
      this.enterAct(0);
    }
    this.set({ status: "playing" });
    this.startClock();
  }

  pause() {
    if (this.state.status !== "playing") return;
    this.stopClock();
    this.set({ status: "paused" });
  }

  toggle() {
    if (this.state.status === "playing") this.pause();
    else this.play();
  }

  seekAct(index: number) {
    if (!this.script) return;
    const clamped = Math.max(0, Math.min(this.script.acts.length - 1, index));
    this.enterAct(clamped);
    if (this.state.status === "ended") this.set({ status: "paused" });
  }

  next() {
    if (!this.script) return;
    if (this.state.actIndex >= this.script.acts.length - 1) this.finish();
    else this.seekAct(this.state.actIndex + 1);
  }

  prev() {
    this.seekAct(this.state.actIndex - 1);
  }

  restart() {
    this.seekAct(0);
    if (this.state.status !== "playing") this.play();
  }

  dispose() {
    this.stopClock();
    this.listeners.clear();
  }

  /** Advance the demo clock by `dtMs`. The rAF loop calls this; tests call it directly. */
  tick(dtMs: number) {
    if (!this.script || this.state.status !== "playing") return;
    const act = this.script.acts[this.state.actIndex];
    if (!act) return;
    this.actElapsed = Math.min(act.durationMs, this.actElapsed + dtMs);

    while (
      this.firedBeats < act.beats.length &&
      act.beats[this.firedBeats].at <= this.actElapsed
    ) {
      this.execute(act.beats[this.firedBeats].cmd);
      this.firedBeats++;
    }
    this.advanceMotions();

    const before = this.script.acts
      .slice(0, this.state.actIndex)
      .reduce((s, a) => s + a.durationMs, 0);
    this.set({
      actElapsedMs: this.actElapsed,
      totalElapsedMs: before + this.actElapsed
    });

    if (this.actElapsed >= act.durationMs) {
      if (this.state.actIndex >= this.script.acts.length - 1) this.finish();
      else this.enterAct(this.state.actIndex + 1);
    }
  }

  // ── Internals ──────────────────────────────────────────────────────────

  private now() {
    return this.hooks.now?.() ?? Date.now();
  }

  private startClock() {
    if (this.frame !== null || typeof requestAnimationFrame === "undefined")
      return;
    this.lastFrameAt = performance.now();
    const loop = (t: number) => {
      // A hidden tab starves rAF; on return the whole gap is replayed in
      // order (beats fire, convoys catch up) instead of being lost.
      const dt = Math.min(t - this.lastFrameAt, 120_000);
      this.lastFrameAt = t;
      this.tick(dt);
      if (this.state.status === "playing")
        this.frame = requestAnimationFrame(loop);
      else this.frame = null;
    };
    this.frame = requestAnimationFrame(loop);
  }

  private stopClock() {
    if (this.frame !== null && typeof cancelAnimationFrame !== "undefined")
      cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  private finish() {
    this.stopClock();
    for (const key of DEMO_DRIVER_KEYS) this.convoys[key].motion = null;
    this.set({
      status: "ended",
      actElapsedMs: this.state.actDurationMs,
      totalElapsedMs: this.state.totalDurationMs
    });
  }

  private enterAct(index: number) {
    if (!this.script) return;
    const act = this.script.acts[index];
    this.actElapsed = 0;
    this.firedBeats = 0;
    for (const key of DEMO_DRIVER_KEYS) this.convoys[key].motion = null;
    const before = this.script.acts
      .slice(0, index)
      .reduce((s, a) => s + a.durationMs, 0);
    this.set({
      actIndex: index,
      actId: act.id,
      actTitle: act.title,
      actSubtitle: act.subtitle ?? null,
      actElapsedMs: 0,
      actDurationMs: act.durationMs,
      totalElapsedMs: before,
      actEntryToken: this.state.actEntryToken + 1
    });
    for (const cmd of act.setup) this.execute(cmd);
    this.publishConvoys();
    this.emit("demo:act", {
      index,
      id: act.id,
      title: act.title,
      total: this.script.acts.length
    });
  }

  private emit<K extends LiveEventName>(name: K, payload: LiveEventPayload<K>) {
    liveEvents.emit(name, payload, "director");
  }

  private driverId(key: DemoDriverKey): string | null {
    if (this.driverIdCache.has(key)) return this.driverIdCache.get(key) ?? null;
    const taken = new Set(
      [...this.driverIdCache.values()].filter(Boolean) as string[]
    );
    const byName = this.context.drivers.find((d) => {
      const name = (d.user?.name ?? "").toLowerCase();
      return (
        !taken.has(d.id) &&
        (name.includes(key) || (key === "fahad" && name.includes("driver")))
      );
    });
    const fallback =
      byName ?? this.context.drivers.find((d) => !taken.has(d.id));
    const id = fallback?.id ?? null;
    this.driverIdCache.set(key, id);
    return id;
  }

  private resolveTask(ref: "airport" | "venue" | number): Task | undefined {
    const tasks = this.context.tasks;
    if (typeof ref === "number") return tasks[ref];
    const match = (needles: string[]) =>
      tasks.find((t) =>
        needles.some(
          (n) =>
            String(t.type).includes(n) ||
            String(t.pickupLocation ?? "")
              .toUpperCase()
              .includes(n)
        )
      );
    if (ref === "airport") return match(["AIRPORT", "CHAUFFEUR"]) ?? tasks[0];
    return match(["VENUE", "SHUTTLE", "PLENARY"]) ?? tasks[1] ?? tasks[0];
  }

  private resolveGuest(vipId: string): Guest | undefined {
    const vip = DEMO_VIP_GUESTS.find((g) => g.id === vipId);
    const guests = this.context.guests;
    if (vip) {
      const last = vip.nameEn.split(" ").pop()?.toLowerCase() ?? "";
      const byName = guests.find((g) =>
        (g.user?.name ?? "").toLowerCase().includes(last)
      );
      if (byName) return byName;
    }
    const idx = Number(vipId.replace(/\D/g, "")) - 1;
    return guests.filter((g) => g.isVIP)[idx] ?? guests[idx] ?? guests[0];
  }

  private resolvePath(key: DemoDriverKey, spec: PathSpec): Waypoint[] {
    let points: Waypoint[];
    if ("points" in spec) {
      points = [...spec.points];
    } else if ("toward" in spec) {
      const route = DEMO_DRIVER_ROUTES[key];
      const target =
        route[Math.max(0, Math.min(route.length - 1, spec.toward))];
      const here = this.convoys[key].position;
      points = here
        ? [{ ...target, lat: here[0], lng: here[1] }, target]
        : [target];
    } else {
      const route = DEMO_DRIVER_ROUTES[key];
      const step = spec.to >= spec.from ? 1 : -1;
      points = [];
      for (let i = spec.from; step > 0 ? i <= spec.to : i >= spec.to; i += step)
        points.push(route[Math.max(0, Math.min(route.length - 1, i))]);
    }
    // A stop-short is a trim of the final metres, so the convoy parks inside a ring rather than on the site marker.
    const stopShort = spec.stopShortMeters ?? 0;
    if (stopShort <= 0 || points.length < 2) return points;
    let remaining = stopShort;
    const trimmed = [...points];
    while (trimmed.length >= 2 && remaining > 0) {
      const a = trimmed[trimmed.length - 2];
      const b = trimmed[trimmed.length - 1];
      const seg = distanceMeters([a.lat, a.lng], [b.lat, b.lng]);
      if (seg <= remaining) {
        remaining -= seg;
        trimmed.pop();
      } else {
        const t = 1 - remaining / seg;
        const [lat, lng] = lerpLatLng([a.lat, a.lng], [b.lat, b.lng], t);
        trimmed[trimmed.length - 1] = { ...b, lat, lng };
        remaining = 0;
      }
    }
    return trimmed;
  }

  private buildMotion(points: Waypoint[], durationMs: number): Motion {
    const latlngs = points.map((p): LatLngTuple => [p.lat, p.lng]);
    const cumulative = [0];
    for (let i = 1; i < latlngs.length; i++)
      cumulative.push(
        cumulative[i - 1] + distanceMeters(latlngs[i - 1], latlngs[i])
      );
    return {
      points: latlngs,
      speeds: points.map((p) => p.speed),
      labels: points.map((p) => ({ en: p.locationEn, ar: p.locationAr })),
      cumulative,
      totalMeters: cumulative[cumulative.length - 1],
      startAt: this.actElapsed,
      durationMs: Math.max(1, durationMs),
      lastEmitAt: -Infinity,
      done: false
    };
  }

  /** Position, scripted speed and label at `metersAlong` a motion. */
  private sample(motion: Motion, metersAlong: number) {
    const m = Math.max(0, Math.min(motion.totalMeters, metersAlong));
    let i = 1;
    while (i < motion.cumulative.length - 1 && motion.cumulative[i] < m) i++;
    const a = motion.cumulative[i - 1];
    const b = motion.cumulative[i];
    const t = b > a ? (m - a) / (b - a) : 1;
    const position = lerpLatLng(motion.points[i - 1], motion.points[i], t);
    const speedKmh = Math.round(
      motion.speeds[i - 1] + (motion.speeds[i] - motion.speeds[i - 1]) * t
    );
    return { position, speedKmh, label: motion.labels[i] };
  }

  private place(key: DemoDriverKey, points: Waypoint[]) {
    const convoy = this.convoys[key];
    const last = points[points.length - 1];
    if (!last) return;
    convoy.motion = null;
    convoy.position = [last.lat, last.lng];
    convoy.speedKmh = 0;
    convoy.location = { en: last.locationEn, ar: last.locationAr };
    this.publishFix(convoy);
  }

  private advanceMotions() {
    let changed = false;
    for (const key of DEMO_DRIVER_KEYS) {
      const convoy = this.convoys[key];
      const motion = convoy.motion;
      if (!motion || motion.done) continue;
      const t = Math.min(
        1,
        (this.actElapsed - motion.startAt) / motion.durationMs
      );
      const due = this.actElapsed - motion.lastEmitAt >= SIM_TICK_MS || t >= 1;
      if (!due) continue;
      const s = this.sample(motion, t * motion.totalMeters);
      convoy.position = s.position;
      convoy.speedKmh = t >= 1 ? 0 : s.speedKmh;
      convoy.location = s.label;
      motion.lastEmitAt = this.actElapsed;
      if (t >= 1) motion.done = true;
      this.publishFix(convoy);
      changed = true;
    }
    if (changed) this.publishConvoys();
  }

  /** One location fix → bus, plus the ring check the server would run on it. */
  private publishFix(convoy: ConvoyRuntime) {
    const id = this.driverId(convoy.key);
    if (!id || !convoy.position) return;
    this.emit("driver:location_update", {
      driverId: id,
      lat: convoy.position[0],
      lng: convoy.position[1],
      speedKmh: convoy.speedKmh,
      updatedAt: new Date(this.now()).toISOString()
    });
    this.checkGeofence(convoy, id);
  }

  private checkGeofence(convoy: ConvoyRuntime, driverId: string) {
    if (!convoy.position) return;
    let best: {
      site: (typeof CONCENTRIC_GEOFENCES)[number];
      ring: Ring;
      distance: number;
    } | null = null;
    for (const site of CONCENTRIC_GEOFENCES) {
      const distance = distanceMeters(convoy.position, [
        site.centerLat,
        site.centerLng
      ]);
      const rings = [...site.rings].sort(
        (a, b) => a.radiusMeters - b.radiusMeters
      );
      const inner = rings.find((r) => distance <= r.radiusMeters);
      const ring: Ring = inner ? inner.ring : "OUTSIDE";
      if (ring === "OUTSIDE") continue;
      if (!best || RING_ORDER.indexOf(ring) > RING_ORDER.indexOf(best.ring))
        best = { site, ring, distance };
    }
    const nextRing: Ring = best?.ring ?? "OUTSIDE";
    const nextSite = best?.site.code ?? convoy.siteCode;
    const previousRing = convoy.ring;
    const previousSite = convoy.siteCode;
    convoy.ring = nextRing;
    convoy.siteCode = nextSite;
    if (!convoy.seeded) {
      convoy.seeded = true;
      return;
    }
    if (nextRing === previousRing && nextSite === previousSite) return;
    const site =
      best?.site ??
      CONCENTRIC_GEOFENCES.find((s) => s.code === (nextSite ?? previousSite));
    if (!site) return;
    const approaching =
      RING_ORDER.indexOf(nextRing) > RING_ORDER.indexOf(previousRing);
    const event: GeofenceTransitionEvent = {
      id: `dir-${this.now().toString(36)}-${convoy.key}`,
      driverId,
      driverName: this.context.drivers.find((d) => d.id === driverId)?.user
        ?.name,
      geofenceId: site.id,
      geofenceCode: site.code,
      geofenceNameEn: site.nameEn,
      geofenceNameAr: site.nameAr,
      previousRing,
      currentRing: nextRing,
      distanceMeters: Math.round(
        best?.distance ??
          distanceMeters(convoy.position, [site.centerLat, site.centerLng])
      ),
      direction: approaching ? "APPROACHING" : "DEPARTING",
      timestamp: new Date(this.now()).toISOString(),
      automatedActionsTaken: approaching
        ? [
            site.rings.find((r) => r.ring === nextRing)?.autoAction ??
              "RING_ENTRY"
          ]
        : []
    };
    this.emit("geofence:transition", event);
    if (approaching)
      tacticalAudio.cue(nextRing === "DOCKED_BAY" ? "handshake" : "ring");
  }

  private publishConvoys() {
    const convoys = { ...this.state.convoys };
    for (const key of DEMO_DRIVER_KEYS) {
      const c = this.convoys[key];
      const m = c.motion;
      const t = m
        ? Math.min(1, (this.actElapsed - m.startAt) / m.durationMs)
        : 1;
      convoys[key] = {
        driver: key,
        driverId: this.driverId(key),
        position: c.position,
        speedKmh: c.speedKmh,
        moving: Boolean(m && !m.done),
        progress: t,
        etaSeconds:
          m && !m.done
            ? Math.max(
                0,
                Math.round(
                  (m.durationMs - (this.actElapsed - m.startAt)) / 1000
                )
              )
            : 0,
        remainingMeters: m && !m.done ? Math.round(m.totalMeters * (1 - t)) : 0,
        location: c.location,
        ring: c.ring,
        siteCode: c.siteCode
      };
    }
    this.set({ convoys });
  }

  execute(cmd: Command) {
    switch (cmd.type) {
      case "convoy.place":
        this.place(cmd.driver, this.resolvePath(cmd.driver, cmd.path));
        return;
      case "convoy.moveAlong": {
        const points = this.resolvePath(cmd.driver, cmd.path);
        const convoy = this.convoys[cmd.driver];
        // Start from wherever the convoy is, so a jump mid-act never snaps it to the path start.
        const first = points[0];
        if (
          convoy.position &&
          first &&
          distanceMeters(convoy.position, [first.lat, first.lng]) > 25
        ) {
          points.unshift({
            ...first,
            lat: convoy.position[0],
            lng: convoy.position[1]
          });
        }
        convoy.motion = this.buildMotion(points, cmd.durationMs);
        this.publishConvoys();
        return;
      }
      case "geofence.transition": {
        const id = this.driverId(cmd.driver);
        const site = CONCENTRIC_GEOFENCES.find(
          (s) => s.code === cmd.site || s.id === cmd.site
        );
        if (!id || !site) return;
        const approaching =
          RING_ORDER.indexOf(cmd.ring) > RING_ORDER.indexOf(cmd.previousRing);
        this.convoys[cmd.driver].ring = cmd.ring;
        this.convoys[cmd.driver].siteCode = site.code;
        this.emit("geofence:transition", {
          id: `dir-${this.now().toString(36)}-${cmd.driver}`,
          driverId: id,
          driverName: this.context.drivers.find((d) => d.id === id)?.user?.name,
          geofenceId: site.id,
          geofenceCode: site.code,
          geofenceNameEn: site.nameEn,
          geofenceNameAr: site.nameAr,
          previousRing: cmd.previousRing,
          currentRing: cmd.ring,
          distanceMeters:
            site.rings.find((r) => r.ring === cmd.ring)?.radiusMeters ?? 0,
          direction: approaching ? "APPROACHING" : "DEPARTING",
          timestamp: new Date(this.now()).toISOString(),
          automatedActionsTaken: []
        });
        if (approaching)
          tacticalAudio.cue(cmd.ring === "DOCKED_BAY" ? "handshake" : "ring");
        this.publishConvoys();
        return;
      }
      case "task.setStatus": {
        const task = this.resolveTask(cmd.task);
        if (!task) return;
        if (cmd.status === "DELAYED")
          this.emit("alert:delay", { taskId: task.id });
        else
          this.emit("task:status_change", {
            taskId: task.id,
            status: cmd.status
          });
        return;
      }
      case "guest.arrived": {
        const guest = this.resolveGuest(cmd.vipId);
        const vip = DEMO_VIP_GUESTS.find((g) => g.id === cmd.vipId);
        this.emit("guest:arrived", {
          guestId: guest?.id ?? cmd.vipId,
          guestName: guest?.user?.name ?? vip?.nameEn
        });
        tacticalAudio.cue("chime");
        return;
      }
      case "corridor.setState":
        this.emit("corridor:state", {
          code: cmd.code,
          state: cmd.state,
          reason: cmd.reason
        });
        getMapController()?.setCorridorState(cmd.code, cmd.state);
        return;
      case "fleet.diverted":
        this.emit("fleet:diverted", { message: cmd.message.en });
        tacticalAudio.cue("alert");
        return;
      case "camera.focusConvoy": {
        const id = this.driverId(cmd.driver);
        if (id) getMapController()?.focusConvoy(`driver:${id}`, cmd.zoom);
        return;
      }
      case "camera.frameCorridor":
        getMapController()?.frameCorridor(cmd.code);
        return;
      case "camera.overview":
        getMapController()?.overview();
        return;
      case "ticker.push":
        this.emit("demo:ticker", { ...cmd.text, tag: cmd.tag });
        return;
      case "toast":
        this.hooks.toast?.(cmd.tone, cmd.title, cmd.message);
        return;
      case "audio.cue":
        tacticalAudio.cue(cmd.cue);
        return;
      case "highlight":
        this.emit("demo:highlight", {
          panelId: cmd.panelId,
          durationMs: cmd.durationMs ?? 2400
        });
        return;
      case "ai.brief":
        this.emit("demo:brief", { promptId: cmd.promptId });
        return;
      case "flight.setPhase":
        this.set({
          flights: { ...this.state.flights, [cmd.flightNo]: cmd.phase }
        });
        this.emit("demo:flight", { flightNo: cmd.flightNo, phase: cmd.phase });
        return;
      case "scorecard":
        this.set({ scorecardVisible: cmd.visible });
        this.emit("demo:scorecard", { visible: cmd.visible });
        return;
      case "tminus.set": {
        const landingAt = cmd.inMs === null ? null : this.now() + cmd.inMs;
        this.set({ landingAt });
        this.emit("demo:tminus", { landingAt });
        return;
      }
    }
  }
}

// ── Singleton ────────────────────────────────────────────────────────────

let instance: Director | null = null;

/** One director per page. Panels read it through `useDirectorState`. */
export function getDirector(): Director {
  if (!instance) instance = new Director();
  return instance;
}

/** Test seam. */
export function resetDirector() {
  instance?.dispose();
  instance = null;
}
