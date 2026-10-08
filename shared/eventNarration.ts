/**
 * Deterministic, event-specific narration for the scripted assistant
 * replies (server `resolveSmartQuery` and the client `localAiReply`
 * fallback). It renders only what the caller already holds — the briefing
 * snapshot from `client/src/lib/aiBriefs.ts`, or the reduced context the
 * server authorized — and says "not available" for everything else. It
 * never fetches data and grants nothing: an empty or minimal context
 * yields an honest generic reply, never another event's details.
 *
 * A metric group (fleet, tasks, SLA, guests, finance, geofences) is used
 * only when every figure it reports is present and valid; a partial or
 * malformed group is "not available", never filled in with zeros. Real
 * zeros from a complete group are reported as zeros.
 */

import type { TaskStatus } from "./domain.js";

export type NarrationScenario =
  | "vendors"
  | "vault"
  | "arrivals"
  | "hospitality"
  | "driver"
  | "schedule"
  | "catering"
  | "report"
  | "network"
  | "dining"
  | "welcome";

export type NarrationSnapshot = {
  event: {
    name: string;
    venue: string | null;
    date: string | null;
    status: string | null;
  } | null;
  fleet: {
    total: number;
    active: number;
    idle: number;
    offline: number;
    utilisationPercent: number;
  } | null;
  tasks: {
    total: number;
    completed: number;
    inProgress: number;
    delayed: number;
    pending: number;
  } | null;
  sla: { onTimePercent: number; measured: number } | null;
  guests: { total: number; vip: number; arrived: number } | null;
  finance: { contractedSpendSAR: number; commissionSAR: number } | null;
  /** `null` when the context carries no geofence data at all. */
  geofences: Array<{ site: string; inside: number; docked: number }> | null;
};

/** Longest event/venue/site text echoed back; context is caller-supplied. */
const MAX_TEXT = 120;
const MAX_SITES = 5;
const TASK_STATUSES: readonly TaskStatus[] = [
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
const IN_PROGRESS: readonly TaskStatus[] = ["ASSIGNED", "ACCEPTED", "EN_ROUTE", "ARRIVED", "PICKED_UP"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed ? trimmed.slice(0, MAX_TEXT) : null;
}

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function dateText(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : raw;
}

/** Reads the known briefing fields only; anything else in `context` is ignored. */
export function readNarrationSnapshot(context: unknown): NarrationSnapshot {
  const ctx = isRecord(context) ? context : {};

  const rawEvent = isRecord(ctx.event) ? ctx.event : null;
  const name = rawEvent ? text(rawEvent.name) : null;
  const event =
    rawEvent && name
      ? {
          name,
          venue: text(rawEvent.venue),
          date: dateText(rawEvent.date),
          status: text(rawEvent.status)
        }
      : null;

  const fleetCounts = counts(ctx.fleet, [
    "total",
    "active",
    "idle",
    "offline",
    "utilisationPercent"
  ] as const);
  const fleet = fleetCounts && {
    total: fleetCounts.total,
    active: fleetCounts.active,
    idle: fleetCounts.idle,
    offline: fleetCounts.offline,
    utilisationPercent: fleetCounts.utilisationPercent
  };

  const slaCounts = counts(ctx.sla, ["onTimePercent", "completed", "delayed"] as const);
  const sla = slaCounts && {
    onTimePercent: slaCounts.onTimePercent,
    measured: slaCounts.completed + slaCounts.delayed
  };

  const guestCounts = counts(ctx.guests, ["total", "vip", "arrived"] as const);
  const guests = guestCounts && {
    total: guestCounts.total,
    vip: guestCounts.vip,
    arrived: guestCounts.arrived
  };

  const financeCounts = counts(ctx.finance, ["contractedSpendSAR", "commissionSAR"] as const);
  const finance = financeCounts && {
    contractedSpendSAR: financeCounts.contractedSpendSAR,
    commissionSAR: financeCounts.commissionSAR
  };

  return {
    event,
    fleet,
    tasks: readTasks(ctx.tasks),
    sla,
    guests,
    finance,
    geofences: readGeofences(ctx.geofences)
  };
}

/** Every listed key as a valid count, or `null` if any is missing/malformed. */
function counts<K extends string>(
  group: unknown,
  keys: readonly K[]
): Record<K, number> | null {
  if (!isRecord(group)) return null;
  const out = {} as Record<K, number>;
  for (const key of keys) {
    const value = count(group[key]);
    if (value === null) return null;
    out[key] = value;
  }
  return out;
}

/**
 * A task-status counter map. Only known statuses count (a supplied `total`
 * or other metadata is ignored, never added); an absent status in a map
 * that has at least one known status is zero. A map with no known status,
 * or with a malformed known status, is not task data.
 */
function readTasks(group: unknown): NarrationSnapshot["tasks"] {
  if (!isRecord(group)) return null;
  const present = TASK_STATUSES.filter((key) => key in group);
  if (!present.length) return null;
  const byStatus = {} as Record<TaskStatus, number>;
  for (const key of TASK_STATUSES) {
    const value = key in group ? count(group[key]) : 0;
    if (value === null) return null;
    byStatus[key] = value;
  }
  return {
    total: TASK_STATUSES.reduce((sum, key) => sum + byStatus[key], 0),
    completed: byStatus.COMPLETED,
    inProgress: IN_PROGRESS.reduce((sum, key) => sum + byStatus[key], 0),
    delayed: byStatus.DELAYED,
    pending: byStatus.PENDING
  };
}

/**
 * Sites with at least one captain inside. Any malformed entry makes the
 * whole list unavailable, so a dropped entry can never turn into a false
 * "no captain is inside" claim.
 */
function readGeofences(group: unknown): NarrationSnapshot["geofences"] {
  if (!Array.isArray(group)) return null;
  const sites: Array<{ site: string; inside: number; docked: number }> = [];
  for (const entry of group) {
    if (!isRecord(entry)) return null;
    const site = text(entry.site);
    const inside = count(entry.inside);
    const docked = count(entry.docked);
    if (!site || inside === null || docked === null) return null;
    if (inside > 0) sites.push({ site, inside, docked });
  }
  return sites.slice(0, MAX_SITES);
}

// ── Formatting ─────────────────────────────────────────────────────────────

function num(value: number): string {
  const rounded = Math.round(value);
  return String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function pct(value: number): string {
  return String(Math.round(value * 10) / 10);
}

const EVENT_STATUS: Record<string, { en: string; ar: string }> = {
  DRAFT: { en: "draft", ar: "مسودة" },
  PUBLISHED: { en: "published", ar: "منشورة" },
  LIVE: { en: "live", ar: "مباشرة" },
  COMPLETED: { en: "completed", ar: "مكتملة" },
  CANCELLED: { en: "cancelled", ar: "ملغاة" }
};

function eventPhrase(s: NarrationSnapshot, ar: boolean): string {
  if (!s.event)
    return ar
      ? "تفاصيل الفعالية غير متوفرة في هذا الطلب"
      : "event details are not available in this request";
  const venue = s.event.venue ?? (ar ? "المكان غير متوفر" : "venue not available");
  const date = s.event.date ?? (ar ? "التاريخ غير متوفر" : "date not available");
  return ar
    ? `${s.event.name}، ${venue}، ${date}`
    : `${s.event.name}, ${venue}, ${date}`;
}

function statusSentence(s: NarrationSnapshot, ar: boolean): string {
  const raw = s.event?.status;
  if (!raw) return "";
  const label = EVENT_STATUS[raw.toUpperCase()];
  const value = label ? (ar ? label.ar : label.en) : raw;
  return ar ? `حالة الفعالية: ${value}.` : `Event status: ${value}.`;
}

function fleetSentence(s: NarrationSnapshot, ar: boolean): string {
  const f = s.fleet;
  if (!f)
    return ar
      ? "بيانات الأسطول غير متوفرة في البيانات الحالية."
      : "Fleet data is not available in the current snapshot.";
  return ar
    ? `الأسطول: ${num(f.active)} نشط، ${num(f.idle)} متاح، ${num(f.offline)} غير متصل من أصل ${num(f.total)} كابتن (نسبة التشغيل ${pct(f.utilisationPercent)}%).`
    : `Fleet: ${num(f.active)} active, ${num(f.idle)} idle and ${num(f.offline)} offline of ${num(f.total)} captains (${pct(f.utilisationPercent)}% utilisation).`;
}

function tasksSentence(s: NarrationSnapshot, ar: boolean): string {
  const t = s.tasks;
  if (!t)
    return ar
      ? "بيانات المهام غير متوفرة في البيانات الحالية."
      : "Task data is not available in the current snapshot.";
  return ar
    ? `مهام النقل: ${num(t.total)} إجمالاً — ${num(t.completed)} مكتملة، ${num(t.inProgress)} قيد التنفيذ، ${num(t.delayed)} متأخرة، ${num(t.pending)} بانتظار الإسناد.`
    : `Transport tasks: ${num(t.total)} total — ${num(t.completed)} completed, ${num(t.inProgress)} in progress, ${num(t.delayed)} delayed, ${num(t.pending)} pending.`;
}

function guestsSentence(s: NarrationSnapshot, ar: boolean): string {
  const g = s.guests;
  if (!g)
    return ar
      ? "بيانات الضيوف غير متوفرة في البيانات الحالية."
      : "Guest data is not available in the current snapshot.";
  return ar
    ? `الضيوف: وصل ${num(g.arrived)} من أصل ${num(g.total)}، بينهم ${num(g.vip)} من كبار الشخصيات.`
    : `Guests: ${num(g.arrived)} of ${num(g.total)} arrived, ${num(g.vip)} VIP.`;
}

function slaSentence(s: NarrationSnapshot, ar: boolean): string {
  const sla = s.sla;
  if (!sla)
    return ar
      ? "نسبة الالتزام بالوقت غير متوفرة في البيانات الحالية."
      : "The on-time rate is not available in the current snapshot.";
  if (!sla.measured)
    return ar
      ? "لم تكتمل أو تتأخر أي مهمة بعد، لذا لم تُقَس نسبة الالتزام بالوقت."
      : "No task has completed or been delayed yet, so the on-time rate is not measured.";
  return ar
    ? `نسبة الالتزام بالوقت: ${pct(sla.onTimePercent)}% عبر ${num(sla.measured)} مهمة مُقاسة.`
    : `On-time rate: ${pct(sla.onTimePercent)}% across ${num(sla.measured)} measured tasks.`;
}

function financeSentence(s: NarrationSnapshot, ar: boolean): string {
  const f = s.finance;
  if (!f)
    return ar
      ? "الأرقام المالية غير متوفرة في البيانات الحالية."
      : "Financial figures are not available in the current snapshot.";
  return ar
    ? `الأرقام المسجلة في اللوحة: قيمة العقود ${num(f.contractedSpendSAR)} ر.س، والعمولة ${num(f.commissionSAR)} ر.س.`
    : `Recorded dashboard figures: contracted spend SAR ${num(f.contractedSpendSAR)}, commission SAR ${num(f.commissionSAR)}.`;
}

function geofenceSentence(s: NarrationSnapshot, ar: boolean): string {
  const sites = s.geofences;
  if (!sites)
    return ar
      ? "بيانات النطاقات الجغرافية غير متوفرة في البيانات الحالية."
      : "Geofence data is not available in the current snapshot.";
  if (!sites.length)
    return ar
      ? "لا يوجد كابتن داخل أي موقع ذي نطاق جغرافي في البيانات الحالية."
      : "No captain is inside a geofenced site in the current snapshot.";
  const list = sites
    .map((site) =>
      ar
        ? `${site.site} (${num(site.inside)}، منهم ${num(site.docked)} في الرصيف)`
        : `${site.site} (${num(site.inside)}, ${num(site.docked)} docked)`
    )
    .join(ar ? "؛ " : "; ");
  return ar
    ? `الكباتن داخل المواقع ذات النطاق الجغرافي: ${list}.`
    : `Captains inside geofenced sites: ${list}.`;
}

const join = (...parts: string[]) => parts.filter(Boolean).join(" ");

/**
 * The body of one scripted reply (no persona prefix), grounded in `context`.
 * Unknown or missing context fields are reported as unavailable.
 */
export function narrateEventScenario(
  scenario: NarrationScenario,
  context: unknown,
  isArabic: boolean
): string {
  const s = readNarrationSnapshot(context);
  const ar = isArabic;
  const event = eventPhrase(s, ar);

  switch (scenario) {
    case "vendors":
      return ar
        ? join(
            `فحص الموردين — ${event}.`,
            "سجلات حضور الموردين ووصولهم غير متوفرة في البيانات الحالية، لذلك لا يمكنني تحديد مورد غائب أو متأخر.",
            tasksSentence(s, ar)
          )
        : join(
            `Supplier check — ${event}.`,
            "Vendor check-in and arrival records are not available in the current snapshot, so I cannot name a missing or late supplier.",
            tasksSentence(s, ar)
          );
    case "vault":
      return ar
        ? join(
            `خزنة العروض — ${event}.`,
            "لا تتوفر في البيانات الحالية سجلات للعروض المختومة أو حاملي المفاتيح أو فتح الخزنة، لذلك لا يمكنني تأكيد قيم العروض أو حالة الاعتماد.",
            financeSentence(s, ar)
          )
        : join(
            `Quotation vault — ${event}.`,
            "No sealed-bid, key-holder or unsealing record is available in the current snapshot, so I cannot confirm bid amounts or approval status.",
            financeSentence(s, ar)
          );
    case "arrivals":
      return ar
        ? join(
            `الوصول — ${event}.`,
            "بيانات الرحلات والصالات غير متوفرة في البيانات الحالية.",
            guestsSentence(s, ar),
            fleetSentence(s, ar)
          )
        : join(
            `Arrivals — ${event}.`,
            "Flight and terminal data are not available in the current snapshot.",
            guestsSentence(s, ar),
            fleetSentence(s, ar)
          );
    case "hospitality":
      return ar
        ? join(
            `الضيافة — ${event}.`,
            "مذكرات الضيافة الفردية غير مضمنة في بيانات هذه الإحاطة؛ افتح لوحة مذكرات الضيافة للاطلاع على التفاصيل المسجلة.",
            guestsSentence(s, ar)
          )
        : join(
            `Hospitality — ${event}.`,
            "Individual guest riders are not included in this briefing snapshot; open the hospitality riders panel for the recorded details.",
            guestsSentence(s, ar)
          );
    case "driver":
      return ar
        ? join(
            `الكباتن — ${event}.`,
            fleetSentence(s, ar),
            geofenceSentence(s, ar),
            "بيانات المركبات واللوحات ونقاط الالتقاء غير متوفرة في البيانات الحالية."
          )
        : join(
            `Captains — ${event}.`,
            fleetSentence(s, ar),
            geofenceSentence(s, ar),
            "Vehicle, plate and pickup-point assignments are not available in the current snapshot."
          );
    case "schedule":
      return ar
        ? join(
            `الجدول — ${event}.`,
            statusSentence(s, ar),
            "الأجندة التفصيلية غير متوفرة في البيانات الحالية.",
            tasksSentence(s, ar)
          )
        : join(
            `Schedule — ${event}.`,
            statusSentence(s, ar),
            "A detailed agenda is not available in the current snapshot.",
            tasksSentence(s, ar)
          );
    case "catering":
      return ar
        ? join(
            `التموين — ${event}.`,
            "بيانات مخزون التموين وإشغال الاستراحات غير متوفرة في البيانات الحالية، لذلك لا يمكنني الإفادة بالمخزون أو الازدحام."
          )
        : join(
            `Catering — ${event}.`,
            "Catering stock and lounge occupancy data are not available in the current snapshot, so I cannot report inventory or crowding."
          );
    case "report":
      return ar
        ? join(
            `ملخص الأداء — ${event}.`,
            slaSentence(s, ar),
            tasksSentence(s, ar),
            guestsSentence(s, ar),
            financeSentence(s, ar),
            "مؤشرات الرضا والوفورات غير متوفرة في البيانات الحالية."
          )
        : join(
            `Performance summary — ${event}.`,
            slaSentence(s, ar),
            tasksSentence(s, ar),
            guestsSentence(s, ar),
            financeSentence(s, ar),
            "Satisfaction scores and cost savings are not available in the current snapshot."
          );
    case "network":
      return ar
        ? join(
            `الشبكة — ${event}.`,
            "أسماء شبكات الواي فاي وكلمات المرور غير متوفرة في البيانات الحالية؛ يرجى تأكيدها مع فريق المكان."
          )
        : join(
            `Network access — ${event}.`,
            "Wi-Fi names and passwords are not available in the current snapshot; please confirm them with the venue team."
          );
    case "dining":
      return ar
        ? join(
            `المطاعم — ${event}.`,
            "خيارات المطاعم والحجوزات غير متوفرة في البيانات الحالية، لذلك لا يمكنني ترشيح طاولة أو حجزها."
          )
        : join(
            `Dining — ${event}.`,
            "Restaurant options and reservations are not part of the current snapshot, so I cannot recommend or book a table."
          );
    case "welcome":
      return ar
        ? join(
            `أهلاً بك في منصة مِضياف الذكية للعمليات. البيانات الحالية — ${event}.`,
            fleetSentence(s, ar),
            tasksSentence(s, ar),
            guestsSentence(s, ar),
            "اسألني عن الموردين أو خزنة العروض أو الوصول أو الضيافة أو الكباتن."
          )
        : join(
            `Welcome to Midyaf AI Operations Brain. Current snapshot — ${event}.`,
            fleetSentence(s, ar),
            tasksSentence(s, ar),
            guestsSentence(s, ar),
            "Ask about suppliers, the quotation vault, arrivals, hospitality or captains."
          );
  }
}
