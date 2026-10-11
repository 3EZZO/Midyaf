import { Role, TaskHandoverKind, TaskStatus } from "@prisma/client";
import { z } from "zod";
import type { AuthenticatedUser } from "../types/auth.js";
import { HttpError } from "./http.js";

/**
 * OPS-COLLAB-001 task handover policy. A task can have an accountable
 * operations user (responsibleUserId) and an optional temporary delegate
 * (delegateUserId):
 *
 * - DELEGATE: someone else acts on the task while the responsible user stays
 *   accountable (for example cover during a break or an incident).
 * - TRANSFER: responsibility moves to someone else for good; any delegate is
 *   cleared.
 * - RETURN: the delegate hands the task back to the responsible user.
 *
 * LM/SA keep their documented legacy global scope, an ORGANIZER acts only on
 * its own events, and a coordinator only on a task they are currently
 * responsible for or delegated (see handoverTaskAccess). This is not
 * organization isolation (D-001).
 */

export const HANDOVER_CLOSED_STATUSES: TaskStatus[] = [
  TaskStatus.COMPLETED,
  TaskStatus.CANCELLED
];

/** Roles that can hold operational responsibility for a task. */
export const HANDOVER_RECIPIENT_ROLES: Role[] = [
  Role.LOGISTICS_MANAGER,
  Role.SUPER_ADMIN,
  Role.COORDINATOR,
  Role.ORGANIZER
];

/** Roles that may use the handover API at all. */
export const HANDOVER_ACTOR_ROLES: Role[] = HANDOVER_RECIPIENT_ROLES;

export const HANDOVER_MAX_REASON = 500;

const reasonSchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(
    z
      .string()
      .max(HANDOVER_MAX_REASON)
      .refine((value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value), {
        message: "Reason contains unsupported characters"
      })
  )
  .optional();

export const handoverBodySchema = z
  .object({
    mode: z.enum(["DELEGATE", "TRANSFER"]),
    toUserId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    reason: reasonSchema
  })
  .strict();

export const handoverReturnBodySchema = z
  .object({ reason: reasonSchema })
  .strict();

export type HandoverTaskState = {
  id: string;
  status: TaskStatus;
  responsibleUserId: string | null;
  delegateUserId: string | null;
};

export type HandoverRights = {
  canDelegate: boolean;
  canTransfer: boolean;
  canReturn: boolean;
};

function isLegacyOperator(actor: AuthenticatedUser) {
  return actor.role === Role.LOGISTICS_MANAGER || actor.role === Role.SUPER_ADMIN;
}

/**
 * Whether the handover endpoints may reveal anything about this task to
 * this actor, decided before any closed/no-delegate state is disclosed:
 *
 * - "allowed": LM/SA (legacy global scope), the event's own organizer, or a
 *   coordinator who is the task's current responsible user or delegate
 *   (also after the task closed, for its history).
 * - "hidden": another organizer's task; answered like a missing task (404).
 * - "forbidden": anyone else (403).
 *
 * Legacy task REST/bootstrap visibility is separate and unchanged.
 */
export type HandoverAccess = "allowed" | "hidden" | "forbidden";

export function handoverTaskAccess(
  actor: AuthenticatedUser,
  task: Pick<HandoverTaskState, "responsibleUserId" | "delegateUserId">,
  eventOrganizerId: string
): HandoverAccess {
  if (!HANDOVER_ACTOR_ROLES.includes(actor.role)) return "forbidden";
  if (isLegacyOperator(actor)) return "allowed";
  if (actor.role === Role.ORGANIZER) {
    return eventOrganizerId === actor.id ? "allowed" : "hidden";
  }
  return task.responsibleUserId === actor.id || task.delegateUserId === actor.id
    ? "allowed"
    : "forbidden";
}

/** What this actor may do with this task (before recipient checks). */
export function handoverRights(
  actor: AuthenticatedUser,
  task: HandoverTaskState,
  eventOrganizerId: string
): HandoverRights {
  const none = { canDelegate: false, canTransfer: false, canReturn: false };
  if (handoverTaskAccess(actor, task, eventOrganizerId) !== "allowed") return none;
  if (HANDOVER_CLOSED_STATUSES.includes(task.status)) return none;

  const manages =
    isLegacyOperator(actor) ||
    (actor.role === Role.ORGANIZER && eventOrganizerId === actor.id);
  const isResponsible = task.responsibleUserId === actor.id;
  const isDelegate = task.delegateUserId === actor.id;
  const hasDelegate = Boolean(task.delegateUserId);

  return {
    canDelegate: manages || isResponsible || isDelegate,
    canTransfer: manages || isResponsible,
    canReturn: hasDelegate && (manages || isResponsible || isDelegate)
  };
}

/** Recipients must be operations staff; an organizer only for its own event. */
export function isEligibleRecipient(
  recipient: { id: string; role: Role },
  eventOrganizerId: string
) {
  if (!HANDOVER_RECIPIENT_ROLES.includes(recipient.role)) return false;
  if (recipient.role === Role.ORGANIZER) return recipient.id === eventOrganizerId;
  return true;
}

export type HandoverPlan = {
  kind: TaskHandoverKind;
  fromUserId: string | null;
  toUserId: string | null;
  next: { responsibleUserId: string | null; delegateUserId: string | null };
};

/**
 * The state change for one handover. Throws a 409 for a no-op or an
 * ambiguous request so history only records real changes.
 */
export function planHandover(
  actor: AuthenticatedUser,
  task: HandoverTaskState,
  mode: "DELEGATE" | "TRANSFER" | "RETURN",
  toUserId?: string
): HandoverPlan {
  if (mode === "RETURN") {
    if (!task.delegateUserId) {
      throw new HttpError(409, "This task has no delegate to return it from");
    }
    return {
      kind: TaskHandoverKind.RETURN,
      fromUserId: task.delegateUserId,
      toUserId: task.responsibleUserId,
      next: { responsibleUserId: task.responsibleUserId, delegateUserId: null }
    };
  }

  if (!toUserId) throw new HttpError(400, "A recipient is required");
  const currentHolder = task.delegateUserId ?? task.responsibleUserId;

  if (mode === "TRANSFER") {
    if (toUserId === task.responsibleUserId && !task.delegateUserId) {
      throw new HttpError(409, "This person is already responsible for the task");
    }
    return {
      kind: TaskHandoverKind.TRANSFER,
      fromUserId: currentHolder,
      toUserId,
      next: { responsibleUserId: toUserId, delegateUserId: null }
    };
  }

  // DELEGATE: whoever delegates an unowned task becomes accountable for it.
  const responsible = task.responsibleUserId ?? actor.id;
  if (toUserId === responsible) {
    throw new HttpError(
      409,
      task.delegateUserId
        ? "Use return to hand the task back to the responsible person"
        : "This person is already responsible for the task"
    );
  }
  if (toUserId === task.delegateUserId) {
    throw new HttpError(409, "The task is already delegated to this person");
  }

  return {
    kind: TaskHandoverKind.DELEGATE,
    fromUserId: currentHolder ?? actor.id,
    toUserId,
    next: { responsibleUserId: responsible, delegateUserId: toUserId }
  };
}

/** In-app notification copy for the person receiving the task. */
export function handoverNotification(
  kind: TaskHandoverKind,
  actorName: string,
  taskLabel: string
) {
  switch (kind) {
    case TaskHandoverKind.DELEGATE:
      return {
        title: "Task delegated to you",
        body: `${actorName} delegated "${taskLabel}" to you. The responsible person stays accountable.`
      };
    case TaskHandoverKind.TRANSFER:
      return {
        title: "Task transferred to you",
        body: `${actorName} transferred "${taskLabel}" to you. You are now responsible for it.`
      };
    default:
      return {
        title: "Task returned to you",
        body: `${actorName} returned "${taskLabel}" to you.`
      };
  }
}
