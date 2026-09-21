import type { MidyafData } from "@shared/domain";
import type { LiveEvent } from "./liveEvents";
import {
  deriveExecutiveKpis,
  fleetUtilisation,
  ringOccupancy,
  slaSample,
  taskStatusCounts
} from "./metrics";

export type Bilingual = { en: string; ar: string };

/**
 * Named briefings the demo director can request (`ai.brief(promptId)`).
 * Each is a question the narrator would ask aloud; the reply streams into
 * the assistant. Keyed so a script never carries prose.
 */
export const BRIEF_PROMPTS: Record<
  string,
  { title: Bilingual; prompt: Bilingual }
> = {
  situation: {
    title: { en: "Situation briefing", ar: "إحاطة الوضع" },
    prompt: {
      en: "Give me a 5-line situation briefing for the operation right now: fleet, on-time SLA, guests, and anything that needs a decision.",
      ar: "أعطني إحاطة من خمسة أسطر عن وضع العملية الآن: الأسطول، الالتزام بالمواعيد، الضيوف، وأي أمر يحتاج إلى قرار."
    }
  },
  sandstorm_reroute: {
    title: { en: "Reroute rationale", ar: "مبررات إعادة التوجيه" },
    prompt: {
      en: "The Sovereign Financial Corridor just closed for a sandstorm. Explain the reroute for Shuttle Charlie via Prince Mohammed bin Salman Road: why that road, the SLA buffer impact, and what the escort should do.",
      ar: "أُغلق الممر المالي السيادي للتو بسبب عاصفة رملية. اشرح إعادة توجيه الحافلة تشارلي عبر طريق الأمير محمد بن سلمان: لماذا هذا الطريق، وأثره على هامش اتفاقية الخدمة، وما الذي ينبغي على المرافقة فعله."
    }
  },
  arrival_scorecard: {
    title: { en: "Arrival scorecard", ar: "بطاقة أداء الوصول" },
    prompt: {
      en: "The VIP has arrived at the delegation base. Summarise the operation's performance in four bullet points for the minister.",
      ar: "وصلت الضيفة إلى مقر الوفود. لخّص أداء العملية في أربع نقاط للوزير."
    }
  }
};

/** The events worth telling a model about; telemetry ticks are noise. */
const NARRATIVE_EVENTS = new Set<LiveEvent["name"]>([
  "geofence:transition",
  "fleet:diverted",
  "task:status_change",
  "alert:delay",
  "guest:arrived",
  "task:assigned"
]);

/**
 * Compact, model-facing snapshot of the room: the same selectors the
 * dashboards render, plus the last few narrative events. Sent as `context`
 * so the answer is grounded in the numbers on screen, not invented.
 */
export function buildBriefingContext(
  data: MidyafData,
  history: readonly LiveEvent[],
  isDemoMode = false
) {
  const event = data.events[0];
  const tasks = event?.tasks ?? [];
  const guests = event?.guests ?? [];
  const fleet = fleetUtilisation(data.drivers);
  const sla = slaSample(tasks);
  const statuses = taskStatusCounts(tasks);
  const kpis = deriveExecutiveKpis(data, { isDemoMode });
  const rings = ringOccupancy(data.drivers)
    .map((site) => ({
      site: site.siteNameEn,
      inside: site.rings.reduce((sum, r) => sum + r.count, 0),
      docked: site.rings.find((r) => r.type === "DOCKED_BAY")?.count ?? 0
    }))
    .filter((s) => s.inside > 0);

  const recent = history
    .filter((e) => NARRATIVE_EVENTS.has(e.name))
    .slice(0, 10)
    .map((e) => ({
      at: new Date(e.at).toISOString(),
      name: e.name,
      payload: e.payload
    }));

  return {
    event: event
      ? {
          name: event.name,
          venue: event.venue,
          date: event.date,
          status: event.status
        }
      : null,
    fleet: {
      total: fleet.total,
      active: fleet.active,
      idle: fleet.idle,
      offline: fleet.offline,
      utilisationPercent: fleet.percent
    },
    sla: {
      onTimePercent: sla.onTimePercent,
      completed: sla.completed,
      delayed: sla.delayed,
      totalTasks: sla.total
    },
    tasks: statuses,
    guests: {
      total: guests.length,
      vip: guests.filter((g) => g.isVIP).length,
      arrived: guests.filter((g) => g.rsvpStatus === "ARRIVED").length
    },
    finance: {
      commissionSAR: kpis.commission.value,
      contractedSpendSAR: kpis.contractedSpend.value,
      marginPercent: kpis.marginPercent.value
    },
    geofences: rings,
    recentEvents: recent
  };
}
