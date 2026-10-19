import { Router } from "express";
import type { Server } from "socket.io";
import {
  EventMemberRole,
  EventPermission,
  MembershipStatus,
  MessageClass,
  Prisma,
  TaskStatus,
  TripStatus
} from "@prisma/client";
import {
  DISPATCH_FLOW_SPECS,
  deriveMessageClass,
  dispatchCreateSchema,
  dispatchRecipientsQuerySchema,
  inboxQuerySchema,
  type DispatchFlow,
  type DispatchResultDto,
  type InboxItemDto
} from "../../../shared/overhaul.js";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import type { AuthRequest } from "../types/auth.js";
import { HttpError, asyncHandler } from "../utils/http.js";
import { MESSAGE_NOTIFICATION_KIND, previewText } from "../utils/messagingPolicy.js";
import {
  ORGANIZER_SIDE_ROLES,
  WORKSPACE_TRANSACTION,
  hasEventRole,
  loadEventAccess,
  lockRow,
  requireEventOpen,
  requirePermission,
  requirePlanApproved,
  toWorkspaceHttpError,
  writeWorkspaceAudit,
  type EventAccess
} from "../utils/workspacePolicy.js";

/**
 * FULL-OVERHAUL-M2 authorized dispatch (inside /workspace). Six flows:
 *
 *   GUEST_TO_LM, GUEST_TO_SUPERVISOR, GUEST_TO_CAPTAIN  (login guest of the
 *   event; the captain must be linked to the guest by an open trip or task)
 *   ORGANIZER_TO_LM (organization admin or organizer-side event role;
 *   optional CLIENT_TASK)
 *   LM_TO_SUPERVISOR (LOGISTICS_MANAGER event member; optional
 *   LOGISTICS_TEAM_TASK)
 *   LM_TO_CAPTAIN_EMERGENCY (LOGISTICS_MANAGER; required task, assigned to
 *   the captain; an AVAILABLE fleet supervisor receives an ALERT thread)
 *
 * The sender's role is derived from stored memberships, never from the
 * request. Recipients must be ACTIVE members of the same event with the
 * flow's role and receiving enabled; anything else is refused with one
 * message. Threads reuse the existing Conversation tables, so replies, read
 * marks and their row-lock race protections are those of /messages, and
 * tasks reuse Task (handover/delegation unchanged). The thread, task,
 * supervisor alert, notifications, dispatch record and audit commit in one
 * transaction or not at all. clientRequestId makes a retry idempotent.
 *
 * The inbox lists only conversations the caller participates in; event,
 * class and flow filters can only narrow that set.
 */

const router = Router();
router.use(requireAuth);

const OPEN_TRIP_STATUSES: TripStatus[] = [TripStatus.SCHEDULED, TripStatus.EN_ROUTE_TO_PICKUP, TripStatus.ON_BOARD];
const CLOSED_TASK_STATUSES: TaskStatus[] = [TaskStatus.COMPLETED, TaskStatus.CANCELLED];

type Sender = { roleLabel: string };

function recipientsRefused() {
  return new HttpError(403, "One or more recipients cannot receive this dispatch");
}

/** The sender's standing for this flow, from stored data only. */
export function resolveSender(access: EventAccess, flow: DispatchFlow): Sender {
  if (access.support) throw new HttpError(403, "Support access cannot dispatch");
  const spec = DISPATCH_FLOW_SPECS[flow];
  switch (spec.sender) {
    case "GUEST":
      if (access.guestId) return { roleLabel: "GUEST" };
      break;
    case "ORGANIZER":
      requirePermission(access, EventPermission.VIEW);
      if (hasEventRole(access, ORGANIZER_SIDE_ROLES)) return { roleLabel: access.membership!.role };
      if (access.isOrgAdmin && access.organizationRole) return { roleLabel: `ORGANIZATION_${access.organizationRole}` };
      break;
    case "LOGISTICS_MANAGER":
      requirePermission(access, EventPermission.VIEW);
      requirePermission(access, EventPermission.EDIT);
      if (hasEventRole(access, [EventMemberRole.LOGISTICS_MANAGER])) return { roleLabel: EventMemberRole.LOGISTICS_MANAGER };
      break;
  }
  throw new HttpError(403, "Your role in this event cannot use this dispatch flow");
}

/** Captain user ids linked to the guest by an open trip or open task. */
async function captainsLinkedToGuest(eventId: string, guestId: string, db: Prisma.TransactionClient = prisma) {
  const [trips, tasks] = await Promise.all([
    db.trip.findMany({
      where: {
        eventId,
        status: { in: OPEN_TRIP_STATUSES },
        driverId: { not: null },
        passengers: { some: { eventGuest: { guestId } } }
      },
      select: { driver: { select: { userId: true } } },
      take: 50
    }),
    db.task.findMany({
      where: { eventId, guestId, driverId: { not: null }, status: { notIn: CLOSED_TASK_STATUSES } },
      select: { driver: { select: { userId: true } } },
      take: 50
    })
  ]);
  return new Set(
    [...trips, ...tasks].map((row) => row.driver?.userId).filter((id): id is string => Boolean(id))
  );
}

type Candidate = { userId: string; name: string; role: EventMemberRole; createdAt: Date };

/**
 * Recipients this sender may reach in this flow (optionally restricted to
 * `onlyUserIds`): same event, ACTIVE, the flow's role, receiving enabled,
 * not the sender; emergency captains must be available; guest-to-captain
 * needs a stored link.
 */
async function eligibleRecipients(access: EventAccess, flow: DispatchFlow, onlyUserIds?: readonly string[], db: Prisma.TransactionClient = prisma) {
  const spec = DISPATCH_FLOW_SPECS[flow];
  const members = await db.eventMembership.findMany({
    where: {
      eventId: access.event.id,
      role: spec.recipientRole,
      status: MembershipStatus.ACTIVE,
      canReceive: true,
      permissions: { has: EventPermission.VIEW },
      userId: onlyUserIds ? { in: [...onlyUserIds], not: access.actor.id } : { not: access.actor.id },
      ...(spec.emergency ? { available: true } : {})
    },
    select: { userId: true, role: true, createdAt: true, user: { select: { name: true } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 200
  });
  let candidates: Candidate[] = members.map((member) => ({
    userId: member.userId,
    name: member.user.name,
    role: member.role,
    createdAt: member.createdAt
  }));
  if (flow === "GUEST_TO_CAPTAIN") {
    const linked = await captainsLinkedToGuest(access.event.id, access.guestId!, db);
    candidates = candidates.filter((candidate) => linked.has(candidate.userId));
  }
  return candidates;
}

/** Available, receiving fleet supervisors other than the excluded users. */
async function availableSupervisors(eventId: string, exclude: readonly string[], db: Prisma.TransactionClient = prisma) {
  const members = await db.eventMembership.findMany({
    where: {
      eventId,
      role: EventMemberRole.FLEET_SUPERVISOR,
      status: MembershipStatus.ACTIVE,
      canReceive: true,
      permissions: { has: EventPermission.VIEW },
      available: true,
      userId: { notIn: [...exclude] }
    },
    select: { id: true, userId: true, user: { select: { name: true } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 50
  });
  return members;
}

const DISPATCH_SELECT = {
  id: true,
  eventId: true,
  flow: true,
  conversationId: true,
  alertConversationId: true,
  supervisorUserId: true,
  taskId: true,
  task: { select: { source: true } },
  conversation: { select: { messageClass: true } }
} satisfies Prisma.DispatchRecordSelect;

type DispatchRow = Prisma.DispatchRecordGetPayload<{ select: typeof DISPATCH_SELECT }>;

function toDispatchDto(row: DispatchRow, replayed: boolean): DispatchResultDto {
  return {
    dispatchId: row.id,
    flow: row.flow,
    conversationId: row.conversationId,
    messageClass: row.conversation.messageClass,
    taskId: row.taskId,
    taskSource: row.task?.source ?? null,
    supervisorAlert:
      row.supervisorUserId && row.alertConversationId
        ? { userId: row.supervisorUserId, conversationId: row.alertConversationId }
        : null,
    replayed
  };
}

router.get(
  "/events/:eventId/dispatch/recipients",
  asyncHandler(async (req: AuthRequest, res) => {
    const access = await loadEventAccess(req, req.params.eventId);
    requirePlanApproved(access);
    const { flow } = dispatchRecipientsQuerySchema.parse(req.query);
    resolveSender(access, flow);
    const recipients = await eligibleRecipients(access, flow);
    const supervisors = DISPATCH_FLOW_SPECS[flow].emergency
      ? await availableSupervisors(access.event.id, [access.actor.id])
      : [];
    res.json({
      flow,
      recipients: recipients.map((candidate) => ({ id: candidate.userId, name: candidate.name, eventRole: candidate.role })),
      supervisors: supervisors.map((member) => ({ id: member.userId, name: member.user.name }))
    });
  })
);

router.post(
  "/events/:eventId/dispatch",
  asyncHandler(async (req: AuthRequest, res) => {
    const access = await loadEventAccess(req, req.params.eventId);
    requirePlanApproved(access);
    requireEventOpen(access);
    const body = dispatchCreateSchema.parse(req.body);
    const spec = DISPATCH_FLOW_SPECS[body.flow];
    const sender = resolveSender(access, body.flow);

    const eligible = await eligibleRecipients(access, body.flow, body.recipientUserIds);
    if (eligible.length !== body.recipientUserIds.length) throw recipientsRefused();
    const recipients = body.recipientUserIds.map((id) => eligible.find((candidate) => candidate.userId === id)!);

    let captainDriverId: string | null = null;
    let supervisor: { membershipId: string; userId: string; name: string } | null = null;
    if (spec.emergency) {
      const driver = await prisma.driver.findUnique({
        where: { userId: recipients[0].userId },
        select: { id: true, active: true }
      });
      if (!driver || !driver.active) throw recipientsRefused();
      captainDriverId = driver.id;

      const supervisors = await availableSupervisors(access.event.id, [access.actor.id, recipients[0].userId]);
      const chosen = body.supervisorUserId
        ? supervisors.find((member) => member.userId === body.supervisorUserId)
        : supervisors[0];
      if (!chosen) {
        throw new HttpError(409, "No fleet supervisor is available to receive the emergency alert");
      }
      supervisor = { membershipId: chosen.id, userId: chosen.userId, name: chosen.user.name };
    }

    const result = await prisma
      .$transaction(async (tx) => {
        await lockRow(tx, "Event", access.event.id);
        const actorIds = [...new Set([access.actor.id, ...body.recipientUserIds, ...(supervisor ? [supervisor.userId] : [])])].sort();
        const lockedMembers = await tx.eventMembership.findMany({ where: { eventId: access.event.id, userId: { in: actorIds } }, select: { id: true }, orderBy: { id: "asc" } });
        for (const member of lockedMembers) await lockRow(tx, "EventMembership", member.id);
        const fresh = await loadEventAccess(req, access.event.id, tx);
        requirePlanApproved(fresh);
        requireEventOpen(fresh);
        resolveSender(fresh, body.flow);
        const stillEligible = await eligibleRecipients(fresh, body.flow, body.recipientUserIds, tx);
        if (stillEligible.length !== body.recipientUserIds.length) throw recipientsRefused();
        if (captainDriverId) {
          const captain = await tx.driver.findUnique({ where: { id: captainDriverId }, select: { active: true } });
          if (!captain?.active) throw recipientsRefused();
        }
        if (body.clientRequestId) {
          const existing = await tx.dispatchRecord.findUnique({
            where: {
              senderUserId_clientRequestId: { senderUserId: access.actor.id, clientRequestId: body.clientRequestId }
            },
            select: DISPATCH_SELECT
          });
          if (existing) {
            if (existing.eventId !== access.event.id || existing.flow !== body.flow) {
              throw new HttpError(409, "This request id was already used for another dispatch");
            }
            return { replayed: true, record: existing };
          }
        }

        if (supervisor) {
          // The supervisor must still be available when the alert commits.
          await lockRow(tx, "EventMembership", supervisor.membershipId);
          const still = await tx.eventMembership.findFirst({
            where: {
              id: supervisor.membershipId,
              status: MembershipStatus.ACTIVE,
              available: true,
              canReceive: true
            },
            select: { id: true }
          });
          if (!still) throw new HttpError(409, "No fleet supervisor is available to receive the emergency alert");
        }

        const now = new Date();
        const messageClass = deriveMessageClass(body.flow, recipients.length, Boolean(body.task));
        const conversation = await tx.conversation.create({
          data: {
            subject: body.subject,
            createdById: access.actor.id,
            lastMessageAt: now,
            eventId: access.event.id,
            messageClass,
            dispatchFlow: body.flow,
            participants: {
              create: [
                { userId: access.actor.id, lastReadAt: now },
                ...recipients.map((recipient) => ({ userId: recipient.userId }))
              ]
            },
            messages: { create: { senderId: access.actor.id, body: body.body, createdAt: now } }
          },
          select: { id: true }
        });

        let taskId: string | null = null;
        if (body.task && spec.taskSource) {
          const task = await tx.task.create({
            data: {
              eventId: access.event.id,
              guestId: spec.sender === "GUEST" ? access.guestId : null,
              type: body.task.type,
              status: spec.emergency ? TaskStatus.ASSIGNED : TaskStatus.PENDING,
              pickupLocation: body.task.pickupLocation,
              dropoffLocation: body.task.dropoffLocation,
              scheduledAt: body.task.scheduledAt ?? now,
              driverId: captainDriverId,
              responsibleUserId: spec.emergency ? access.actor.id : recipients[0].userId,
              source: spec.taskSource,
              createdById: access.actor.id,
              conversationId: conversation.id
            },
            select: { id: true }
          });
          taskId = task.id;
        }

        let alertConversationId: string | null = null;
        if (supervisor) {
          const alert = await tx.conversation.create({
            data: {
              subject: `Emergency dispatch: ${body.subject}`.slice(0, 150),
              createdById: access.actor.id,
              lastMessageAt: now,
              eventId: access.event.id,
              messageClass: MessageClass.ALERT,
              dispatchFlow: body.flow,
              participants: {
                create: [{ userId: access.actor.id, lastReadAt: now }, { userId: supervisor.userId }]
              },
              messages: {
                create: {
                  senderId: access.actor.id,
                  body: `Emergency task ${taskId ?? ""} dispatched to captain ${recipients[0].name}. ${body.subject}`.slice(0, 5000),
                  createdAt: now
                }
              }
            },
            select: { id: true }
          });
          alertConversationId = alert.id;
        }

        await tx.notification.createMany({
          data: [
            ...recipients.map((recipient) => ({
              userId: recipient.userId,
              title: spec.emergency ? "Emergency task assigned" : "New dispatch",
              body: body.subject,
              metadata: {
                kind: MESSAGE_NOTIFICATION_KIND,
                conversationId: conversation.id,
                dispatchFlow: body.flow,
                eventId: access.event.id
              }
            })),
            ...(supervisor && alertConversationId
              ? [
                  {
                    userId: supervisor.userId,
                    title: "Emergency dispatch alert",
                    body: `Captain ${recipients[0].name}: ${body.subject}`.slice(0, 500),
                    metadata: {
                      kind: MESSAGE_NOTIFICATION_KIND,
                      conversationId: alertConversationId,
                      dispatchFlow: body.flow,
                      eventId: access.event.id
                    }
                  }
                ]
              : [])
          ]
        });

        const record = await tx.dispatchRecord.create({
          data: {
            eventId: access.event.id,
            flow: body.flow,
            senderUserId: access.actor.id,
            senderEventRole: sender.roleLabel,
            recipientUserId: recipients[0].userId,
            recipientCount: recipients.length,
            supervisorUserId: supervisor?.userId ?? null,
            conversationId: conversation.id,
            alertConversationId,
            taskId,
            emergency: spec.emergency,
            clientRequestId: body.clientRequestId ?? null
          },
          select: DISPATCH_SELECT
        });

        await writeWorkspaceAudit(tx, req, {
          action: spec.emergency ? "workspace.dispatch.emergency" : "workspace.dispatch",
          entityType: "DISPATCH",
          entityId: record.id,
          eventId: access.event.id,
          after: {
            flow: body.flow,
            recipientUserIds: recipients.map((recipient) => recipient.userId),
            supervisorUserId: supervisor?.userId ?? null,
            taskId,
            messageClass
          },
          metadata: { senderEventRole: sender.roleLabel }
        });
        return { replayed: false, record };
      }, WORKSPACE_TRANSACTION)
      .catch((error: unknown) => {
        throw toWorkspaceHttpError(error, "This dispatch was already submitted");
      });

    if (!result.replayed) {
      const io = req.app.get("io") as Server | undefined;
      for (const recipient of recipients) {
        io?.to(`user:${recipient.userId}`).emit("message:new", { conversationId: result.record.conversationId });
      }
      if (result.record.supervisorUserId && result.record.alertConversationId) {
        io?.to(`user:${result.record.supervisorUserId}`).emit("message:new", {
          conversationId: result.record.alertConversationId
        });
      }
    }

    res.status(result.replayed ? 200 : 201).json({ dispatch: toDispatchDto(result.record, result.replayed) });
  })
);

router.get(
  "/inbox",
  asyncHandler(async (req: AuthRequest, res) => {
    const user = req.user!;
    const query = inboxQuerySchema.parse(req.query);
    if (query.eventId) {
      const access = await loadEventAccess(req, query.eventId);
      requirePlanApproved(access);
      if (!access.guestId) requirePermission(access, EventPermission.VIEW);
    }
    if (query.cursor) {
      const own = await prisma.conversationParticipant.findUnique({
        where: { conversationId_userId: { conversationId: query.cursor, userId: user.id } },
        select: { id: true }
      });
      if (!own) throw new HttpError(400, "Invalid cursor");
    }

    const rows = await prisma.conversation.findMany({
      where: {
        // Participation is the visibility rule; the filters only narrow it.
        participants: { some: { userId: user.id } },
        ...(query.eventId ? { eventId: query.eventId } : {}),
        ...(query.messageClass ? { messageClass: query.messageClass } : {}),
        ...(query.dispatchFlow ? { dispatchFlow: query.dispatchFlow } : {})
      },
      select: {
        id: true,
        subject: true,
        eventId: true,
        messageClass: true,
        dispatchFlow: true,
        lastMessageAt: true,
        participants: { select: { user: { select: { id: true, name: true, role: true } } } },
        messages: { select: { body: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1 }
      },
      orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {})
    });
    const visible = [];
    for (const row of rows) {
      if (!row.eventId) { visible.push(row); continue; }
      try {
        const access = await loadEventAccess(req, row.eventId);
        requirePlanApproved(access);
        if (!access.guestId) requirePermission(access, EventPermission.VIEW);
        visible.push(row);
      } catch (error) {
        if (!(error instanceof HttpError) || ![403, 404, 423].includes(error.status)) throw error;
      }
    }
    const page = visible.slice(0, query.limit);
    const items: InboxItemDto[] = page.map((row) => ({
      conversationId: row.id,
      subject: row.subject,
      eventId: row.eventId,
      messageClass: row.messageClass,
      dispatchFlow: row.dispatchFlow,
      lastMessageAt: row.lastMessageAt.toISOString(),
      participants: row.participants.map((participant) => participant.user),
      preview: row.messages[0] ? previewText(row.messages[0].body) : null
    }));
    res.json({
      items,
      nextCursor: rows.length > query.limit ? page[page.length - 1]?.id ?? null : null
    });
  })
);

export default router;
