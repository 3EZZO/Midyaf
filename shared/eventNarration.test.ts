import { describe, expect, it } from "vitest";
import {
  narrateEventScenario,
  readNarrationSnapshot,
  type NarrationScenario
} from "./eventNarration.js";

const SCENARIOS: NarrationScenario[] = [
  "vendors",
  "vault",
  "arrivals",
  "hospitality",
  "driver",
  "schedule",
  "catering",
  "report",
  "network",
  "dining",
  "welcome"
];

/** Fixed sample content that must never appear in contextual narration. */
const FABRICATED =
  /FII|Future Investment|مستقبل الاستثمار|Ritz|الريتز|SV102|Maybach|مايباخ|Al-Faisal|الفيصل|SaudiVision2030|NPS|145,000|Bujairi|البجيري/;
const ARABIC_LETTER = /[ء-ي]/;
const MOJIBAKE = /[ØÙÃÂ]|â€/;

/** The shape `buildBriefingContext` produces, trimmed to what narration reads. */
function briefing(overrides: {
  name: string;
  venue: string;
  date: string;
  fleetTotal?: number;
  active?: number;
  delayed?: number;
  guests?: number;
}) {
  return {
    demo: false,
    event: {
      id: `evt-${overrides.name}`,
      name: overrides.name,
      venue: overrides.venue,
      date: overrides.date,
      status: "LIVE"
    },
    fleet: {
      total: overrides.fleetTotal ?? 4,
      active: overrides.active ?? 2,
      idle: 1,
      offline: 1,
      utilisationPercent: 66.7
    },
    sla: {
      onTimePercent: 80,
      completed: 4,
      delayed: overrides.delayed ?? 1,
      totalTasks: 9
    },
    tasks: {
      PENDING: 2,
      ASSIGNED: 1,
      ACCEPTED: 0,
      EN_ROUTE: 1,
      ARRIVED: 0,
      PICKED_UP: 0,
      COMPLETED: 4,
      DELAYED: overrides.delayed ?? 1,
      CANCELLED: 0
    },
    guests: { total: overrides.guests ?? 12, vip: 3, arrived: 5 },
    finance: { commissionSAR: 3690, contractedSpendSAR: 0, marginPercent: 12 },
    geofences: [{ site: "Airport Gate", inside: 2, docked: 1 }],
    recentEvents: []
  };
}

const harbour = briefing({
  name: "Harbour Tech Forum",
  venue: "Jeddah Waterfront Hall",
  date: "2027-03-14T09:00:00.000Z"
});
const desert = briefing({
  name: "Desert Arts Week",
  venue: "AlUla Old Town",
  date: "2027-11-02T00:00:00.000Z",
  fleetTotal: 9,
  active: 7,
  delayed: 3,
  guests: 40
});

describe("narrateEventScenario", () => {
  for (const scenario of SCENARIOS) {
    it(`grounds ${scenario} in the current event, in both languages`, () => {
      for (const isArabic of [false, true]) {
        const a = narrateEventScenario(scenario, harbour, isArabic);
        const b = narrateEventScenario(scenario, desert, isArabic);

        expect(a).toContain("Harbour Tech Forum");
        expect(a).toContain("Jeddah Waterfront Hall");
        expect(a).toContain("2027-03-14");
        expect(a).not.toContain("Desert Arts Week");
        expect(b).toContain("Desert Arts Week");
        expect(b).toContain("AlUla Old Town");
        expect(b).toContain("2027-11-02");
        expect(b).not.toContain("Harbour Tech Forum");
        for (const body of [a, b]) {
          expect(body).not.toMatch(FABRICATED);
          expect(body).not.toMatch(MOJIBAKE);
          if (isArabic) expect(body).toMatch(ARABIC_LETTER);
          else expect(body).not.toMatch(ARABIC_LETTER);
        }
      }
    });

    it(`is honest about a missing context: ${scenario}`, () => {
      for (const context of [undefined, null, {}, "text", []]) {
        const en = narrateEventScenario(scenario, context, false);
        const ar = narrateEventScenario(scenario, context, true);
        expect(en).toContain("event details are not available");
        expect(ar).toContain("تفاصيل الفعالية غير متوفرة");
        expect(en).not.toMatch(FABRICATED);
        expect(ar).not.toMatch(FABRICATED);
        expect(en).not.toMatch(/\d/);
      }
    });
  }

  it("reports the current numbers and follows a changed snapshot", () => {
    expect(narrateEventScenario("driver", harbour, false)).toContain(
      "Fleet: 2 active, 1 idle and 1 offline of 4 captains (66.7% utilisation)."
    );
    expect(narrateEventScenario("driver", desert, false)).toContain(
      "Fleet: 7 active, 1 idle and 1 offline of 9 captains"
    );
    expect(narrateEventScenario("driver", harbour, false)).toContain(
      "Airport Gate (2, 1 docked)"
    );
    expect(narrateEventScenario("vendors", desert, false)).toContain(
      "3 delayed"
    );
    expect(narrateEventScenario("arrivals", desert, true)).toContain(
      "وصل 5 من أصل 40"
    );
    expect(narrateEventScenario("report", harbour, false)).toContain(
      "commission SAR 3,690"
    );
    expect(narrateEventScenario("schedule", harbour, true)).toContain(
      "حالة الفعالية: مباشرة."
    );
  });

  it("names unavailable venue and date instead of inventing them", () => {
    const body = narrateEventScenario(
      "schedule",
      { event: { name: "Pop-up Gala" } },
      false
    );
    expect(body).toContain("Pop-up Gala, venue not available, date not available");
    expect(body).toContain("Task data is not available");
    expect(body).toContain("A detailed agenda is not available");
  });

  it("separates an empty geofence list from absent geofence data", () => {
    expect(
      narrateEventScenario("driver", { ...harbour, geofences: [] }, false)
    ).toContain("No captain is inside a geofenced site");
    expect(
      narrateEventScenario("driver", { ...harbour, geofences: undefined }, false)
    ).toContain("Geofence data is not available");
  });

  it("explains an unmeasured on-time rate rather than claiming 100%", () => {
    const body = narrateEventScenario(
      "report",
      { ...harbour, sla: { onTimePercent: 100, completed: 0, delayed: 0 } },
      false
    );
    expect(body).toContain("on-time rate is not measured");
    expect(body).not.toContain("100%");
  });
});

describe("readNarrationSnapshot", () => {
  it("reads only known briefing fields from a personal, minimal context", () => {
    // What the server forwards for non-operational roles: validated ids only.
    const snapshot = readNarrationSnapshot({
      eventId: "evt_1",
      guestIds: ["g_1"],
      taskIds: ["t_1"]
    });
    expect(snapshot).toEqual({
      event: null,
      fleet: null,
      tasks: null,
      sla: null,
      guests: null,
      finance: null,
      geofences: null
    });
  });

  it("treats the server's synthetic demo context as having no event details", () => {
    const snapshot = readNarrationSnapshot({
      demo: true,
      note: "Scripted showcase simulation. All figures are synthetic."
    });
    expect(snapshot.event).toBeNull();
    expect(snapshot.fleet).toBeNull();
  });

  it("ignores malformed values and caps long caller text", () => {
    const snapshot = readNarrationSnapshot({
      event: { name: "x".repeat(500), venue: 7, date: null },
      fleet: { total: "4" },
      guests: { total: -1 },
      geofences: [{ site: "", inside: 3, docked: 0 }, { site: "Gate", inside: 0, docked: 0 }]
    });
    expect(snapshot.event?.name.length).toBe(120);
    expect(snapshot.event?.venue).toBeNull();
    expect(snapshot.fleet).toBeNull();
    expect(snapshot.guests).toBeNull();
    // A dropped entry must not turn into "no captain is inside".
    expect(snapshot.geofences).toBeNull();
  });

  it("drops only zero-occupancy sites from a well-formed geofence list", () => {
    expect(
      readNarrationSnapshot({
        geofences: [
          { site: "Gate", inside: 0, docked: 0 },
          { site: "Hall", inside: 2, docked: 0 }
        ]
      }).geofences
    ).toEqual([{ site: "Hall", inside: 2, docked: 0 }]);
  });
});

/** R1: unknown figures are unavailable; they never become zeros. */
describe("partial, malformed and zero metric groups", () => {
  const event = harbour.event;
  const UNAVAILABLE = {
    en: {
      fleet: "Fleet data is not available",
      tasks: "Task data is not available",
      sla: "on-time rate is not available",
      guests: "Guest data is not available",
      finance: "Financial figures are not available",
      geofences: "Geofence data is not available"
    },
    ar: {
      fleet: "بيانات الأسطول غير متوفرة",
      tasks: "بيانات المهام غير متوفرة",
      sla: "نسبة الالتزام بالوقت غير متوفرة",
      guests: "بيانات الضيوف غير متوفرة",
      finance: "الأرقام المالية غير متوفرة",
      geofences: "بيانات النطاقات الجغرافية غير متوفرة"
    }
  };

  /** Every group-level sentence, from the two scenarios that cover them all. */
  function bodies(context: unknown, isArabic: boolean) {
    return (
      narrateEventScenario("report", context, isArabic) +
      " " +
      narrateEventScenario("driver", context, isArabic)
    );
  }

  const partial = {
    event,
    fleet: { total: 2 },
    tasks: { total: 5, version: 3 },
    sla: { onTimePercent: 100 },
    guests: { total: 2 },
    finance: { commissionSAR: 3690 },
    geofences: [{ site: "Airport Gate", inside: 2 }]
  };
  const malformed = {
    event,
    fleet: { total: 4, active: "2", idle: 1, offline: 1, utilisationPercent: 50 },
    tasks: { PENDING: "2", COMPLETED: 1 },
    sla: { onTimePercent: 80, completed: Number.NaN, delayed: 1 },
    guests: { total: 12, vip: -1, arrived: 5 },
    finance: { contractedSpendSAR: null, commissionSAR: 3690 },
    geofences: [{ site: "Airport Gate", inside: 2, docked: "1" }]
  };
  const missing = { event };

  for (const [label, context] of [
    ["partial", partial],
    ["malformed", malformed],
    ["missing", missing]
  ] as const) {
    it(`reports ${label} groups as unavailable in both languages`, () => {
      for (const lang of ["en", "ar"] as const) {
        const body = bodies(context, lang === "ar");
        for (const phrase of Object.values(UNAVAILABLE[lang])) {
          expect(body).toContain(phrase);
        }
        expect(body).toContain("Harbour Tech Forum");
        expect(body).not.toMatch(MOJIBAKE);
      }
      // No fabricated zero figures or a 100% claim from the partial SLA.
      const en = bodies(context, false);
      expect(en).not.toMatch(/\b0 (active|idle|offline|arrived|VIP|total|completed|delayed|pending)\b/);
      expect(en).not.toContain("not measured");
      expect(en).not.toContain("100%");
      expect(en).not.toContain("No captain is inside");
      const snapshot = readNarrationSnapshot(context);
      expect(snapshot).toMatchObject({
        fleet: null,
        tasks: null,
        sla: null,
        guests: null,
        finance: null,
        geofences: null
      });
    });
  }

  it("reports real zeros from a complete snapshot as zeros", () => {
    const zero = {
      event,
      fleet: { total: 0, active: 0, idle: 0, offline: 0, utilisationPercent: 0 },
      tasks: {
        PENDING: 0,
        ASSIGNED: 0,
        ACCEPTED: 0,
        EN_ROUTE: 0,
        ARRIVED: 0,
        PICKED_UP: 0,
        COMPLETED: 0,
        DELAYED: 0,
        CANCELLED: 0
      },
      sla: { onTimePercent: 100, completed: 0, delayed: 0, totalTasks: 0 },
      guests: { total: 0, vip: 0, arrived: 0 },
      finance: { contractedSpendSAR: 0, commissionSAR: 0 },
      geofences: []
    };
    const en = bodies(zero, false);
    expect(en).toContain("Fleet: 0 active, 0 idle and 0 offline of 0 captains (0% utilisation).");
    expect(en).toContain("Transport tasks: 0 total — 0 completed, 0 in progress, 0 delayed, 0 pending.");
    expect(en).toContain("Guests: 0 of 0 arrived, 0 VIP.");
    expect(en).toContain("contracted spend SAR 0, commission SAR 0");
    expect(en).toContain("on-time rate is not measured");
    expect(en).toContain("No captain is inside a geofenced site");
    const ar = bodies(zero, true);
    expect(ar).toContain("الأسطول: 0 نشط، 0 متاح، 0 غير متصل من أصل 0 كابتن");
    expect(ar).toContain("مهام النقل: 0 إجمالاً");
    expect(ar).toContain("الضيوف: وصل 0 من أصل 0");
    expect(ar).toContain("لم تُقَس نسبة الالتزام بالوقت");
    expect(ar).toContain("لا يوجد كابتن داخل أي موقع");
    for (const phrase of Object.values(UNAVAILABLE.ar)) expect(ar).not.toContain(phrase);
  });
});

describe("task status counters", () => {
  const tasksOf = (tasks: unknown) => readNarrationSnapshot({ tasks }).tasks;

  it("sums known statuses only, never a supplied total or other metadata", () => {
    expect(
      tasksOf({ PENDING: 2, COMPLETED: 1, DELAYED: 1, total: 4, version: 99, foo: 7 })
    ).toEqual({ total: 4, completed: 1, inProgress: 0, delayed: 1, pending: 2 });
  });

  it("treats an absent status in a recognised counter map as zero", () => {
    expect(tasksOf({ DELAYED: 2, EN_ROUTE: 1 })).toEqual({
      total: 3,
      completed: 0,
      inProgress: 1,
      delayed: 2,
      pending: 0
    });
  });

  it("separates an empty or unknown-only map from real task data", () => {
    expect(tasksOf({})).toBeNull();
    expect(tasksOf({ total: 5, version: 2 })).toBeNull();
    expect(tasksOf(undefined)).toBeNull();
    expect(tasksOf([1, 2])).toBeNull();
    expect(tasksOf({ PENDING: -1, COMPLETED: 2 })).toBeNull();
  });

  it("keeps a valid empty counter as zero tasks", () => {
    expect(tasksOf({ PENDING: 0 })).toEqual({
      total: 0,
      completed: 0,
      inProgress: 0,
      delayed: 0,
      pending: 0
    });
    expect(
      narrateEventScenario("schedule", { event: harbour.event, tasks: { PENDING: 0 } }, false)
    ).toContain("Transport tasks: 0 total");
  });
});
