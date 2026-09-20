import type { Driver, Guest, GuestJourney, MidyafData, Task, TaskStatus } from "@shared/domain";
import { CONCENTRIC_GEOFENCES } from "@shared/constants";
import { DEMO_CONTRACTS, DEMO_VIP_GUESTS } from "./useLiveDemoSimulation";

/**
 * Pure selectors over MidyafData. Every number a dashboard shows comes from
 * here — never a literal in JSX. Where the database has no history to draw
 * a trend from, a deterministic series is derived from the real total and
 * tagged `source: "derived"` so the UI can say so.
 */

export type Source = "live" | "derived";

export type Series = {
  /** Oldest → newest. */
  points: number[];
  /** ISO dates, one per point. */
  dates: string[];
  source: Source;
};

export type Kpi = {
  value: number;
  /** Signed percent change vs the previous window. */
  delta?: number;
  series?: Series;
  source: Source;
};

// ── deterministic pseudo-random (mulberry32) so derived series are stable ──
function rng(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function isoDaysAgo(days: number, now: Date) {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * A plausible cumulative ramp that ends exactly at `target`. Growth is
 * front-loaded slightly so the last days look like an active event.
 */
export function deriveSeries(key: string, target: number, points = 30, now = new Date()): Series {
  const random = rng(key);
  const weights: number[] = [];
  for (let i = 0; i < points; i++) {
    const progress = (i + 1) / points;
    weights.push(0.4 + progress * 0.9 + random() * 0.5);
  }
  const total = weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  const out: number[] = [];
  for (let i = 0; i < points; i++) {
    acc += (weights[i] / total) * target;
    out.push(i === points - 1 ? target : Math.round(acc));
  }
  return {
    points: out,
    dates: out.map((_, i) => isoDaysAgo(points - 1 - i, now)),
    source: "derived"
  };
}

/** Percent change of the last `window` increments vs the previous `window`. */
export function windowDelta(series: Series, window = 7): number | undefined {
  const p = series.points;
  if (p.length < window * 2 + 1) return undefined;
  const inc = (from: number, to: number) => p[to] - p[from];
  const recent = inc(p.length - 1 - window, p.length - 1);
  const prior = inc(p.length - 1 - window * 2, p.length - 1 - window);
  if (prior <= 0) return undefined;
  return Math.round(((recent - prior) / prior) * 1000) / 10;
}

/** Cumulative daily series built from dated amounts. */
export function cumulativeByDay(items: Array<{ date: string; amount: number }>, points = 30, now = new Date()): Series {
  const dates = Array.from({ length: points }, (_, i) => isoDaysAgo(points - 1 - i, now));
  const perDay = new Map<string, number>();
  let before = 0;
  for (const it of items) {
    const day = it.date.slice(0, 10);
    if (day < dates[0]) before += it.amount;
    else perDay.set(day, (perDay.get(day) ?? 0) + it.amount);
  }
  let acc = before;
  const out = dates.map((d) => {
    acc += perDay.get(d) ?? 0;
    return Math.round(acc);
  });
  return { points: out, dates, source: "live" };
}

// ── Executive ────────────────────────────────────────────────────────────

export type ExecutiveKpis = {
  commission: Kpi & { series: Series };
  contractedSpend: Kpi & { series: Series; categories: number };
  marginPercent: Kpi;
  pendingReceivables: Kpi & { count: number };
};

export function deriveExecutiveKpis(data: MidyafData, opts: { isDemoMode?: boolean; now?: Date } = {}): ExecutiveKpis {
  const now = opts.now ?? new Date();

  if (opts.isDemoMode) {
    const items = DEMO_CONTRACTS.map((c) => ({ date: c.signedDate, amount: c.commissionAmount }));
    const spendItems = DEMO_CONTRACTS.map((c) => ({ date: c.signedDate, amount: c.amount }));
    const commissionTotal = items.reduce((s, i) => s + i.amount, 0);
    const spendTotal = spendItems.reduce((s, i) => s + i.amount, 0);
    const commissionSeries = cumulativeByDay(items, 30, now);
    const spendSeries = cumulativeByDay(spendItems, 30, now);
    return {
      commission: { value: commissionTotal, delta: windowDelta(commissionSeries), series: commissionSeries, source: "live" },
      contractedSpend: {
        value: spendTotal,
        series: spendSeries,
        categories: new Set(DEMO_CONTRACTS.map((c) => c.categoryEn)).size,
        source: "live"
      },
      marginPercent: { value: Math.round((commissionTotal / spendTotal) * 1000) / 10, source: "live" },
      pendingReceivables: {
        value: DEMO_CONTRACTS.filter((c) => c.status !== "SIGNED").reduce((s, c) => s + c.amount, 0),
        count: DEMO_CONTRACTS.filter((c) => c.status !== "SIGNED").length,
        source: "live"
      }
    };
  }

  const quoteCommission = data.vendorQuotes.reduce((s, q) => s + Number(q.commissionAmount || 0), 0);
  const contractCommission = data.contracts.reduce((s, c) => s + Number(c.commissionAmount || 0), 0);
  const commissionTotal = quoteCommission + contractCommission;
  const spendTotal = data.contracts.reduce((s, c) => s + Number(c.totalValue ?? c.amount ?? 0), 0);

  const datedContracts = data.contracts.filter((c) => c.signedAt || c.createdAt);
  const commissionSeries =
    datedContracts.length >= 3
      ? cumulativeByDay(
          datedContracts.map((c) => ({ date: (c.signedAt ?? c.createdAt)!, amount: Number(c.commissionAmount || 0) })),
          30,
          now
        )
      : deriveSeries("commission", commissionTotal, 30, now);
  const spendSeries =
    datedContracts.length >= 3
      ? cumulativeByDay(
          datedContracts.map((c) => ({ date: (c.signedAt ?? c.createdAt)!, amount: Number(c.totalValue ?? c.amount ?? 0) })),
          30,
          now
        )
      : deriveSeries("spend", spendTotal, 30, now);

  const configuredPercent = Number(data.commission[0]?.defaultPercent ?? 0);
  const marginPercent =
    spendTotal > 0 && commissionTotal > 0
      ? { value: Math.round((commissionTotal / spendTotal) * 1000) / 10, source: "live" as const }
      : { value: configuredPercent, source: "live" as const };

  const unsigned = data.contracts.filter((c) => c.status === "PENDING_SIGNATURE" || c.status === "UNDER_REVIEW" || c.status === "DRAFT");

  return {
    commission: { value: commissionTotal, delta: windowDelta(commissionSeries), series: commissionSeries, source: commissionSeries.source },
    contractedSpend: {
      value: spendTotal,
      series: spendSeries,
      categories: new Set(data.contracts.map((c) => c.category)).size,
      source: spendSeries.source
    },
    marginPercent,
    pendingReceivables: {
      value: unsigned.reduce((s, c) => s + Number(c.totalValue ?? c.amount ?? 0), 0),
      count: unsigned.length,
      source: "live"
    }
  };
}

// ── Fleet ────────────────────────────────────────────────────────────────

export type FleetUtilisation = {
  total: number;
  active: number; // EN_ROUTE | BUSY | ASSIGNED
  idle: number; // AVAILABLE
  offline: number;
  percent: number; // active / (total - offline)
};

export function fleetUtilisation(drivers: Driver[]): FleetUtilisation {
  const total = drivers.length;
  const active = drivers.filter((d) => d.status === "EN_ROUTE" || d.status === "BUSY" || d.status === "ASSIGNED").length;
  const idle = drivers.filter((d) => d.status === "AVAILABLE").length;
  const offline = drivers.filter((d) => d.status === "OFFLINE").length;
  const onShift = total - offline;
  return { total, active, idle, offline, percent: onShift ? Math.round((active / onShift) * 1000) / 10 : 0 };
}

// ── Guests ───────────────────────────────────────────────────────────────

export type FunnelStage = { key: string; en: string; ar: string; count: number };

/** INVITED → CONFIRMED → LANDED → IN_TRANSIT → ARRIVED (each stage includes the later ones). */
export function guestFunnel(guests: Guest[], journeys: GuestJourney[], isDemoMode = false): FunnelStage[] {
  if (isDemoMode) {
    const total = DEMO_VIP_GUESTS.length;
    const stage = (s: string[]) => DEMO_VIP_GUESTS.filter((g) => s.includes(g.stage)).length;
    return [
      { key: "invited", en: "Invited", ar: "مدعوون", count: total },
      { key: "confirmed", en: "Confirmed", ar: "مؤكدون", count: total },
      { key: "landed", en: "Landed", ar: "وصلوا المطار", count: stage(["TOUCHDOWN", "IN_TRANSIT", "CHECKED_IN", "AT_VENUE"]) },
      { key: "in_transit", en: "In transit", ar: "في الطريق", count: stage(["IN_TRANSIT", "CHECKED_IN", "AT_VENUE"]) },
      { key: "arrived", en: "Arrived", ar: "وصلوا", count: stage(["CHECKED_IN", "AT_VENUE"]) }
    ];
  }
  const byGuest = new Map(journeys.map((j) => [j.guestId, j]));
  const invited = guests.length;
  const confirmed = guests.filter((g) => g.rsvpStatus === "CONFIRMED" || g.rsvpStatus === "ARRIVED").length;
  const landed = guests.filter((g) => {
    const j = byGuest.get(g.id);
    return g.rsvpStatus === "ARRIVED" || (j && j.arrivalStatus !== "PRE_ARRIVAL");
  }).length;
  const inTransit = guests.filter((g) => {
    const j = byGuest.get(g.id);
    return g.rsvpStatus === "ARRIVED" || j?.arrivalStatus === "PICKED_UP";
  }).length;
  const arrived = guests.filter((g) => g.rsvpStatus === "ARRIVED").length;
  return [
    { key: "invited", en: "Invited", ar: "مدعوون", count: invited },
    { key: "confirmed", en: "Confirmed", ar: "مؤكدون", count: confirmed },
    { key: "landed", en: "Landed", ar: "وصلوا المطار", count: landed },
    { key: "in_transit", en: "In transit", ar: "في الطريق", count: inTransit },
    { key: "arrived", en: "Arrived", ar: "وصلوا", count: arrived }
  ];
}

// ── Tasks ────────────────────────────────────────────────────────────────

export const TASK_STATUS_ORDER: TaskStatus[] = [
  "PENDING",
  "ASSIGNED",
  "ACCEPTED",
  "EN_ROUTE",
  "ARRIVED",
  "PICKED_UP",
  "COMPLETED",
  "DELAYED",
  "CANCELLED"
];

export type TaskStatusRow = { zone: string } & Record<TaskStatus, number> & { total: number };

export function taskStatusByZone(tasks: Task[], drivers: Driver[]): TaskStatusRow[] {
  const zoneOf = new Map(drivers.map((d) => [d.id, d.zone as string]));
  const rows = new Map<string, TaskStatusRow>();
  for (const t of tasks) {
    const zone = (t.driverId && zoneOf.get(t.driverId)) || "UNASSIGNED";
    if (!rows.has(zone)) {
      const blank = Object.fromEntries(TASK_STATUS_ORDER.map((s) => [s, 0])) as Record<TaskStatus, number>;
      rows.set(zone, { zone, ...blank, total: 0 });
    }
    const row = rows.get(zone)!;
    row[t.status]++;
    row.total++;
  }
  return [...rows.values()].sort((a, b) => b.total - a.total);
}

export function taskStatusCounts(tasks: Task[]): Record<TaskStatus, number> {
  const out = Object.fromEntries(TASK_STATUS_ORDER.map((s) => [s, 0])) as Record<TaskStatus, number>;
  for (const t of tasks) out[t.status]++;
  return out;
}

// ── SLA ──────────────────────────────────────────────────────────────────

export type Sla = { total: number; completed: number; delayed: number; onTimePercent: number };

/** On-time % over tasks that have reached a terminal or delayed state. */
export function slaSample(tasks: Task[]): Sla {
  const completed = tasks.filter((t) => t.status === "COMPLETED").length;
  const delayed = tasks.filter((t) => t.status === "DELAYED").length;
  const measured = completed + delayed;
  return {
    total: tasks.length,
    completed,
    delayed,
    onTimePercent: measured ? Math.round((completed / measured) * 1000) / 10 : 100
  };
}

// ── Geofence rings ───────────────────────────────────────────────────────

export function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export type RingOccupancy = {
  siteId: string;
  siteNameEn: string;
  siteNameAr: string;
  rings: Array<{ type: string; radiusMeters: number; count: number }>;
  outside: number;
};

/** Drivers per concentric ring, per geofenced site (innermost ring wins). */
export function ringOccupancy(drivers: Driver[]): RingOccupancy[] {
  return CONCENTRIC_GEOFENCES.map((site) => {
    const rings = [...site.rings].sort((a, b) => a.radiusMeters - b.radiusMeters);
    const counts = rings.map(() => 0);
    let outside = 0;
    for (const d of drivers) {
      if (d.currentLat == null || d.currentLng == null) continue;
      const dist = haversineMeters(site.centerLat, site.centerLng, d.currentLat, d.currentLng);
      const idx = rings.findIndex((r) => dist <= r.radiusMeters);
      if (idx >= 0) counts[idx]++;
      else outside++;
    }
    return {
      siteId: site.id,
      siteNameEn: site.nameEn,
      siteNameAr: site.nameAr,
      rings: rings.map((r, i) => ({ type: r.ring, radiusMeters: r.radiusMeters, count: counts[i] })),
      outside
    };
  });
}

// ── Client ───────────────────────────────────────────────────────────────

export type ClientKpis = {
  onTimePercent: Kpi;
  guestsServed: { served: number; total: number; source: Source };
  tasksCompleted: { completed: number; total: number; source: Source };
  openIssues: Kpi;
};

export function deriveClientKpis(data: MidyafData, isDemoMode = false): ClientKpis {
  const event = data.events[0];
  const tasks = event?.tasks ?? [];
  const guests = event?.guests ?? [];
  const sla = slaSample(tasks);
  const funnel = guestFunnel(guests, data.guestJourneys, isDemoMode);
  const arrived = funnel.find((f) => f.key === "arrived")?.count ?? 0;
  const invited = funnel[0]?.count ?? 0;
  const openIssues = data.coordinatorRequests.filter((r) => r.status !== "CLOSED").length;
  return {
    onTimePercent: { value: sla.onTimePercent, source: "live" },
    guestsServed: { served: arrived, total: invited, source: "live" },
    tasksCompleted: { completed: sla.completed, total: sla.total, source: "live" },
    openIssues: { value: openIssues, source: "live" }
  };
}
