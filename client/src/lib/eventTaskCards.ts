import type { Driver, Task, TaskStatus } from "@shared/domain";

/**
 * Task cards for the operations dashboard, built only from the current
 * event's tasks and the drivers already in the permission-scoped snapshot.
 * Nothing is invented: no delegating actor, task code or timestamp beyond
 * what a task carries; a missing assignee or time is reported as such.
 */

export type TaskAssignment =
  | { kind: "captain"; name: string }
  | { kind: "owner"; name: string }
  /** A captain is linked but their name is not in this user's snapshot. */
  | { kind: "captain_unnamed" }
  | { kind: "unassigned" };

export type EventTaskCard = {
  /** The task's own id; used as a list key, not displayed. */
  id: string;
  title: string;
  pickup: string | null;
  dropoff: string | null;
  assignment: TaskAssignment;
  /** ISO time: the deadline when set, else the scheduled time. */
  time: string | null;
  timeKind: "deadline" | "scheduled" | null;
  status: TaskStatus;
  guestName: string | null;
  isVip: boolean;
};

/** Cards shown before the "showing N of M" note. */
export const TASK_CARD_LIMIT = 12;

const TASK_TYPE_LABELS: Record<string, { en: string; ar: string }> = {
  AIRPORT_PICKUP: { en: "Airport pickup", ar: "استقبال من المطار" },
  HOTEL_TRANSFER: { en: "Hotel transfer", ar: "نقل إلى الفندق" },
  VENUE_TRANSFER: { en: "Venue transfer", ar: "نقل إلى مقر الفعالية" },
  RESTAURANT_PICKUP: { en: "Restaurant pickup", ar: "توصيل من المطعم" },
  VIP_ESCORT: { en: "VIP escort", ar: "مرافقة كبار الشخصيات" }
};

function clean(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function validTime(value: unknown): string | null {
  const raw = clean(value);
  return raw && !Number.isNaN(Date.parse(raw)) ? raw : null;
}

function assignmentOf(task: Task, drivers: Driver[]): TaskAssignment {
  const captain =
    clean(task.driver?.user?.name) ??
    clean(drivers.find((d) => d.id === task.driverId)?.user?.name);
  if (captain) return { kind: "captain", name: captain };
  if (task.driverId) return { kind: "captain_unnamed" };
  const owner = clean(task.ownerName);
  if (owner) return { kind: "owner", name: owner };
  return { kind: "unassigned" };
}

/** Cards for `tasks`, soonest first; tasks without a time keep their order at the end. */
export function eventTaskCards(
  tasks: readonly Task[] | null | undefined,
  drivers: readonly Driver[] | null | undefined,
  isArabic: boolean
): EventTaskCard[] {
  const scopedDrivers = [...(drivers ?? [])];
  const cards = (tasks ?? []).map((task): EventTaskCard => {
    const deadline = validTime(task.deadlineAt);
    const scheduled = validTime(task.scheduledAt);
    const label = TASK_TYPE_LABELS[task.type];
    return {
      id: task.id,
      title: label ? (isArabic ? label.ar : label.en) : clean(task.type) ?? "—",
      pickup: clean(task.pickupLocation),
      dropoff: clean(task.dropoffLocation),
      assignment: assignmentOf(task, scopedDrivers),
      time: deadline ?? scheduled,
      timeKind: deadline ? "deadline" : scheduled ? "scheduled" : null,
      status: task.status,
      guestName: clean(task.guest?.user?.name),
      isVip: Boolean(task.guest?.isVIP)
    };
  });
  return cards
    .map((card, index) => ({ card, index }))
    .sort((a, b) => {
      const ta = a.card.time ? Date.parse(a.card.time) : Infinity;
      const tb = b.card.time ? Date.parse(b.card.time) : Infinity;
      return ta === tb ? a.index - b.index : ta - tb;
    })
    .map(({ card }) => card);
}
