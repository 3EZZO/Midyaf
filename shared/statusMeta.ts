/**
 * Single registry for every status / severity / priority enum in the domain.
 *
 * UI colour (tone), icon and bilingual label are decided here once, so a
 * status looks the same on every screen. Consumed by <StatusPill> and by
 * chart legends; never hand-pick a tone at a call site.
 */

export type StatusTone = "ok" | "warn" | "danger" | "info" | "neutral" | "gold";

/** Lucide icon names, resolved by the client. */
export type StatusIcon =
  | "circle"
  | "clock"
  | "check"
  | "check-circle"
  | "x-circle"
  | "alert-triangle"
  | "navigation"
  | "map-pin"
  | "user-check"
  | "pause"
  | "play"
  | "send"
  | "file-text"
  | "file-check"
  | "sparkles"
  | "shield-check"
  | "radio"
  | "plane"
  | "luggage"
  | "door-open"
  | "car"
  | "eye"
  | "crown"
  | "flame";

export type StatusMeta = {
  tone: StatusTone;
  icon: StatusIcon;
  en: string;
  ar: string;
  /** True for terminal states (done/cancelled) — used to dim in lists. */
  terminal?: boolean;
  /** True for states that should draw attention (pulse in live views). */
  attention?: boolean;
};

const m = (
  tone: StatusTone,
  icon: StatusIcon,
  en: string,
  ar: string,
  extra: Partial<Pick<StatusMeta, "terminal" | "attention">> = {}
): StatusMeta => ({ tone, icon, en, ar, ...extra });

/**
 * Keys are the raw enum strings used across `shared/domain.ts`. Where the
 * same word means slightly different things in two entities (e.g. ASSIGNED
 * for a task vs a driver) the meaning is shared and the label generic.
 */
export const STATUS_META = {
  // ── Task / driver / delegation lifecycle ──
  PENDING: m("neutral", "clock", "Pending", "قيد الانتظار"),
  ASSIGNED: m("info", "user-check", "Assigned", "تم التكليف"),
  ACCEPTED: m("info", "check", "Accepted", "تم القبول"),
  ACKNOWLEDGED: m("info", "check", "Acknowledged", "تم الاستلام"),
  EN_ROUTE: m("gold", "navigation", "En route", "في الطريق", { attention: true }),
  ARRIVED: m("ok", "map-pin", "Arrived", "وصل"),
  PICKED_UP: m("ok", "car", "Picked up", "تم الاستلام"),
  IN_PROGRESS: m("gold", "play", "In progress", "قيد التنفيذ", { attention: true }),
  COMPLETED: m("ok", "check-circle", "Completed", "مكتملة", { terminal: true }),
  DELAYED: m("danger", "alert-triangle", "Delayed", "متأخر", { attention: true }),
  CANCELLED: m("neutral", "x-circle", "Cancelled", "ملغاة", { terminal: true }),
  CLOSED: m("neutral", "check-circle", "Closed", "مغلق", { terminal: true }),

  // ── Driver presence ──
  OFFLINE: m("neutral", "circle", "Offline", "غير متصل"),
  AVAILABLE: m("ok", "circle", "Available", "متاح"),
  BUSY: m("warn", "clock", "Busy", "مشغول"),
  ON_MISSION: m("gold", "navigation", "On mission", "في مهمة", { attention: true }),
  BREAK: m("neutral", "pause", "On break", "في استراحة"),

  // ── Guest RSVP / journey ──
  INVITED: m("neutral", "send", "Invited", "مدعو"),
  CONFIRMED: m("info", "check", "Confirmed", "مؤكد"),
  DECLINED: m("danger", "x-circle", "Declined", "اعتذر", { terminal: true }),
  PRE_ARRIVAL: m("neutral", "plane", "Pre-arrival", "قبل الوصول"),
  PASSPORT: m("info", "shield-check", "Passport control", "الجوازات"),
  LUGGAGE: m("info", "luggage", "Luggage", "الأمتعة"),
  GATE: m("gold", "door-open", "At gate", "عند البوابة", { attention: true }),

  // ── Event ──
  DRAFT: m("neutral", "file-text", "Draft", "مسودة"),
  PUBLISHED: m("info", "send", "Published", "منشور"),
  LIVE: m("ok", "radio", "Live", "مباشر", { attention: true }),

  // ── Activity intake ──
  AI_PLANNING: m("gold", "sparkles", "AI planning", "تخطيط ذكي", { attention: true }),
  PLAN_CONFIRMED: m("info", "file-check", "Plan confirmed", "خطة معتمدة"),
  QUOTING: m("warn", "file-text", "Quoting", "استدراج العروض"),
  CONTRACTING: m("warn", "file-text", "Contracting", "إبرام العقود"),
  OPERATIONS_OPEN: m("ok", "radio", "Operations active", "العمليات جارية", { attention: true }),

  // ── Plan / quote / contract ──
  APPROVED: m("ok", "check-circle", "Approved", "معتمد"),
  REJECTED: m("danger", "x-circle", "Rejected", "مرفوض", { terminal: true }),
  REQUESTED: m("neutral", "send", "Requested", "مطلوب"),
  RECEIVED: m("info", "file-text", "Received", "مستلم"),
  RECOMMENDED: m("gold", "sparkles", "Recommended", "موصى به"),
  UNDER_REVIEW: m("warn", "eye", "Under review", "قيد المراجعة"),
  PENDING_SIGNATURE: m("warn", "file-text", "Pending signature", "بانتظار التوقيع"),
  SIGNED: m("ok", "file-check", "Signed", "موقّع"),
  ACTIVE: m("ok", "radio", "Active", "نشط"),

  // ── Complaints ──
  NEW: m("info", "circle", "New", "جديد"),
  OPEN: m("warn", "eye", "Open", "مفتوح"),
  IN_REVIEW: m("warn", "eye", "In review", "قيد التحقيق"),
  RESOLVED: m("ok", "check-circle", "Resolved", "تم الحل", { terminal: true }),

  // ── Coordinator requests / reports ──
  SENT_TO_SUPERVISOR: m("info", "send", "Sent to supervisor", "أُرسل للمشرف"),
  MANAGER_CONFIRMED: m("ok", "shield-check", "Manager confirmed", "معتمد من المدير"),
  SENT_TO_COMPANY: m("info", "send", "Sent to client", "مرسل للشركة"),

  // ── Severity / priority ──
  LOW: m("neutral", "circle", "Low", "منخفضة"),
  NORMAL: m("info", "circle", "Normal", "عادية"),
  HIGH: m("warn", "alert-triangle", "High", "عالية"),
  URGENT: m("danger", "flame", "Urgent", "عاجلة", { attention: true }),
  CRITICAL: m("danger", "flame", "Critical", "حرجة", { attention: true }),
  VIP: m("gold", "crown", "VIP", "كبار الشخصيات")
} as const satisfies Record<string, StatusMeta>;

export type StatusKey = keyof typeof STATUS_META;

const FALLBACK: StatusMeta = m("neutral", "circle", "Unknown", "غير معروف");

export function statusMeta(status: string | null | undefined): StatusMeta {
  if (!status) return FALLBACK;
  const key = status.toUpperCase() as StatusKey;
  return STATUS_META[key] ?? { ...FALLBACK, en: status, ar: status };
}

export function statusLabel(status: string | null | undefined, isArabic: boolean): string {
  const meta = statusMeta(status);
  return isArabic ? meta.ar : meta.en;
}

export function statusTone(status: string | null | undefined): StatusTone {
  return statusMeta(status).tone;
}
