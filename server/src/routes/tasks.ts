import { Router } from "express";
import { Role, TaskStatus, TaskType } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import type { Server } from "socket.io";
import { prisma } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { HttpError, asyncHandler, requireEntity } from "../utils/http.js";
import { RIYADH_CENTER, sortDriversByDistance } from "../utils/riyadh.js";
import { safeDriverRelation, safeGuestRelation } from "../utils/safeResponse.js";
import type { AuthRequest } from "../types/auth.js";
import { recordAuditLog } from "../services/auditLog.js";
import {
  HANDOVER_ACTOR_ROLES,
  HANDOVER_CLOSED_STATUSES,
  HANDOVER_RECIPIENT_ROLES,
  handoverBodySchema,
  handoverNotification,
  handoverReturnBodySchema,
  handoverRights,
  isEligibleRecipient,
  planHandover,
  type HandoverPlan
} from "../utils/taskDelegation.js";
import { toSafeHttpError, writeTransactionalAudit } from "../utils/supplierPortal.js";

const router = Router();
const fullAccessRoles: Role[] = [
  Role.LOGISTICS_MANAGER,
  Role.ORGANIZER,
  Role.SUPER_ADMIN
];
const operationalAccessRoles: Role[] = [...fullAccessRoles, Role.COORDINATOR];

type AuthUser = NonNullable<AuthRequest["user"]>;

/** Name and role only: who is accountable for, or acting on, a task. */
const taskPersonSelect = { select: { id: true, name: true, role: true } } as const;

const taskResponseInclude = {
  event: true,
  driver: safeDriverRelation,
  guest: safeGuestRelation,
  responsibleUser: taskPersonSelect,
  delegateUser: taskPersonSelect
} as const;

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

router.use(requireAuth);

// ---------------------------------------------------------------------------
// OPS-COLLAB-001: delegate, transfer or return a task's operational
// responsibility. Registered before /:id.
// ---------------------------------------------------------------------------

router.get(
  "/handover-candidates",
  requireRole(HANDOVER_ACTOR_ROLES),
  asyncHandler(async (req: AuthRequest, res) => {
    const { eventId } = z
      .object({ eventId: z.string().regex(ID_PATTERN) })
      .strict()
      .parse(req.query);
    const event = requireEntity(
      await prisma.event.findUnique({
        where: { id: eventId },
        select: { id: true, organizerId: true }
      }),
      "Event not found"
    );
    if (req.user!.role === Role.ORGANIZER && event.organizerId !== req.user!.id) {
      throw new HttpError(403, "Event access denied");
    }

    const candidates = await prisma.user.findMany({
      where: {
        OR: [
          {
            role: {
              in: HANDOVER_RECIPIENT_ROLES.filter((role) => role !== Role.ORGANIZER)
            }
          },
          { id: event.organizerId, role: Role.ORGANIZER }
        ]
      },
      select: { id: true, name: true, role: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: 200
    });

    res.json({ candidates });
  })
);

router.get(
  "/:id/handovers",
  requireRole(HANDOVER_ACTOR_ROLES),
  asyncHandler(async (req: AuthRequest, res) => {
    const task = await loadHandoverTask(req.params.id);
    if (req.user!.role === Role.ORGANIZER && task.event.organizerId !== req.user!.id) {
      throw new HttpError(404, "Task not found");
    }

    const handovers = await prisma.taskHandover.findMany({
      where: { taskId: task.id },
      select: {
        id: true,
        kind: true,
        reason: true,
        createdAt: true,
        fromUser: taskPersonSelect,
        toUser: taskPersonSelect,
        actor: taskPersonSelect
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 50
    });

    res.json({ handovers });
  })
);

router.post(
  "/:id/handover",
  requireRole(HANDOVER_ACTOR_ROLES),
  asyncHandler(async (req: AuthRequest, res) => {
    const body = handoverBodySchema.parse(req.body);
    const task = await loadHandoverTask(req.params.id);
    const rights = handoverRights(req.user!, task, task.event.organizerId);
    const allowed = body.mode === "DELEGATE" ? rights.canDelegate : rights.canTransfer;
    if (!allowed) throw handoverDenied(req.user!, task);

    const recipient = await prisma.user.findUnique({
      where: { id: body.toUserId },
      select: { id: true, name: true, role: true }
    });
    if (!recipient || !isEligibleRecipient(recipient, task.event.organizerId)) {
      throw new HttpError(400, "This person cannot take responsibility for the task");
    }

    const plan = planHandover(req.user!, task, body.mode, recipient.id);
    const result = await commitHandover(req, task, plan, body.reason);
    res.status(201).json(result);
  })
);

router.post(
  "/:id/handover/return",
  requireRole(HANDOVER_ACTOR_ROLES),
  asyncHandler(async (req: AuthRequest, res) => {
    const body = handoverReturnBodySchema.parse(req.body ?? {});
    const task = await loadHandoverTask(req.params.id);
    const rights = handoverRights(req.user!, task, task.event.organizerId);
    if (!rights.canReturn) {
      if (!task.delegateUserId && !HANDOVER_CLOSED_STATUSES.includes(task.status)) {
        throw new HttpError(409, "This task has no delegate to return it from");
      }
      throw handoverDenied(req.user!, task);
    }

    const plan = planHandover(req.user!, task, "RETURN");
    const result = await commitHandover(req, task, plan, body.reason);
    res.status(201).json(result);
  })
);

async function loadHandoverTask(rawId: string) {
  if (!ID_PATTERN.test(rawId)) throw new HttpError(404, "Task not found");
  return requireEntity(
    await prisma.task.findUnique({
      where: { id: rawId },
      select: {
        id: true,
        eventId: true,
        type: true,
        status: true,
        pickupLocation: true,
        responsibleUserId: true,
        delegateUserId: true,
        event: { select: { organizerId: true } }
      }
    }),
    "Task not found"
  );
}

type HandoverTask = Awaited<ReturnType<typeof loadHandoverTask>>;

function handoverDenied(user: AuthUser, task: HandoverTask) {
  if (HANDOVER_CLOSED_STATUSES.includes(task.status)) {
    return new HttpError(409, "Completed or cancelled tasks cannot be handed over");
  }
  // Organizers cannot learn about other organizers' tasks.
  if (user.role === Role.ORGANIZER && task.event.organizerId !== user.id) {
    return new HttpError(404, "Task not found");
  }
  return new HttpError(403, "You cannot hand over this task");
}

/**
 * One transaction: compare-and-set the responsibility columns against the
 * state the decision was made on, append history, notify the recipient and
 * write a metadata-only audit. A concurrent handover makes the guard fail.
 */
async function commitHandover(
  req: AuthRequest,
  task: HandoverTask,
  plan: HandoverPlan,
  reason: string | undefined
) {
  const actor = req.user!;
  const actorProfile = await prisma.user.findUnique({
    where: { id: actor.id },
    select: { name: true }
  });
  const taskLabel = `${task.type} · ${task.pickupLocation}`;
  const note = handoverNotification(plan.kind, actorProfile?.name ?? actor.email, taskLabel);

  let handoverId: string;
  try {
    handoverId = await prisma.$transaction(async (tx) => {
      const { count } = await tx.task.updateMany({
        where: {
          id: task.id,
          responsibleUserId: task.responsibleUserId,
          delegateUserId: task.delegateUserId,
          status: { notIn: HANDOVER_CLOSED_STATUSES }
        },
        data: plan.next
      });
      if (count !== 1) {
        throw new HttpError(409, "The task changed meanwhile; refresh and try again");
      }

      const handover = await tx.taskHandover.create({
        data: {
          taskId: task.id,
          kind: plan.kind,
          fromUserId: plan.fromUserId,
          toUserId: plan.toUserId,
          actorUserId: actor.id,
          reason: reason || null
        },
        select: { id: true }
      });

      if (plan.toUserId && plan.toUserId !== actor.id) {
        await tx.notification.create({
          data: {
            userId: plan.toUserId,
            title: note.title,
            body: note.body,
            metadata: { taskId: task.id, handoverId: handover.id, kind: plan.kind }
          }
        });
      }

      await writeTransactionalAudit(
        tx,
        { actor, ipAddress: req.ip ?? null, userAgent: req.get("user-agent") ?? null },
        {
          action: `task.handover.${plan.kind.toLowerCase()}`,
          entityType: "TASK",
          entityId: task.id,
          eventId: task.eventId,
          metadata: {
            handoverId: handover.id,
            kind: plan.kind,
            fromUserId: plan.fromUserId,
            toUserId: plan.toUserId,
            reasonProvided: Boolean(reason)
          }
        }
      );

      return handover.id;
    });
  } catch (error) {
    throw toSafeHttpError(error);
  }

  const updated = await prisma.task.findUnique({
    where: { id: task.id },
    include: taskResponseInclude
  });

  const io = req.app.get("io") as Server | undefined;
  if (updated && plan.toUserId && plan.toUserId !== actor.id) {
    io?.to(`user:${plan.toUserId}`).emit("task:assigned", updated);
  }

  return {
    task: updated,
    handover: {
      id: handoverId,
      kind: plan.kind,
      fromUserId: plan.fromUserId,
      toUserId: plan.toUserId
    }
  };
}

router.get(
  "/",
  asyncHandler(async (req: AuthRequest, res) => {
    const query = z
      .object({
        eventId: z.string().optional(),
        driverId: z.string().optional(),
        status: z.nativeEnum(TaskStatus).optional()
      })
      .parse(req.query);
    const visibilityWhere = buildTaskVisibilityWhere(req.user!);

    const tasks = await prisma.task.findMany({
      where: {
        AND: [query, visibilityWhere ?? {}]
      },
      include: taskResponseInclude,
      orderBy: { scheduledAt: "asc" }
    });

    res.json({ tasks });
  })
);

router.post(
  "/",
  requireRole([Role.ORGANIZER, Role.LOGISTICS_MANAGER, Role.SUPER_ADMIN]),
  asyncHandler(async (req: AuthRequest, res) => {
    const body = z
      .object({
        eventId: z.string(),
        driverId: z.string().optional(),
        guestId: z.string().optional(),
        type: z.nativeEnum(TaskType),
        pickupLocation: z.string().min(2),
        dropoffLocation: z.string().min(2),
        pickupLat: z.number().optional(),
        pickupLng: z.number().optional(),
        dropoffLat: z.number().optional(),
        dropoffLng: z.number().optional(),
        scheduledAt: z.coerce.date(),
        deadlineAt: z.coerce.date().optional(),
        ownerName: z.string().optional()
      })
      .parse(req.body);

    await assertCanMutateEventId(req.user!, body.eventId);
    await assertGuestBelongsToEvent(body.guestId, body.eventId);
    const driverId = body.driverId ?? (await findNearestAvailableDriverId(body));

    const task = await prisma.task.create({
      data: {
        ...body,
        driverId,
        status: driverId ? TaskStatus.ASSIGNED : TaskStatus.PENDING
      },
      include: taskResponseInclude
    });

    if (driverId) {
      await prisma.driver.update({
        where: { id: driverId },
        data: { status: "ASSIGNED" }
      });
    }

    const io = req.app.get("io") as Server | undefined;
    io?.to(`event:${task.eventId}`).emit("task:status_change", {
      taskId: task.id,
      status: task.status,
      driverId: task.driverId,
      guestId: task.guestId
    });

    if (task.driver?.userId) {
      io?.to(`user:${task.driver.userId}`).emit("task:assigned", task);
    }

    await recordAuditLog({
      req,
      action: "task.create",
      entityType: "TASK",
      entityId: task.id,
      eventId: task.eventId,
      after: task
    });

    res.status(201).json({ task });
  })
);

router.put(
  "/:id/status",
  asyncHandler(async (req: AuthRequest, res) => {
    const body = z
      .object({
        status: z.nativeEnum(TaskStatus)
      })
      .parse(req.body);
    const existingTask = requireEntity(
      await prisma.task.findFirst({
        where: {
          AND: [
            { id: req.params.id },
            buildTaskStatusUpdateWhere(req.user!) ?? {}
          ]
        }
      }),
      "Task not found"
    );

    const task = await prisma.task.update({
      where: { id: existingTask.id },
      data: {
        status: body.status,
        completedAt: body.status === TaskStatus.COMPLETED ? new Date() : null
      },
      include: taskResponseInclude
    });

    if (task.driverId && ["COMPLETED", "CANCELLED"].includes(body.status)) {
      await prisma.driver.update({
        where: { id: task.driverId },
        data: { status: "AVAILABLE" }
      });
    }

    const io = req.app.get("io") as Server | undefined;
    io?.to(`event:${task.eventId}`).emit("task:status_change", {
      taskId: task.id,
      status: task.status,
      driverId: task.driverId,
      guestId: task.guestId
    });

    if (task.guest?.userId) {
      io?.to(`user:${task.guest.userId}`).emit("task:status_change", {
        taskId: task.id,
        status: task.status
      });
    }

    if (body.status === TaskStatus.ARRIVED) {
      io?.to(`event:${task.eventId}`).emit("guest:arrived", {
        taskId: task.id,
        guestId: task.guestId,
        guestName: task.guest?.user.name
      });
    }

    await recordAuditLog({
      req,
      action: "task.status_update",
      entityType: "TASK",
      entityId: task.id,
      eventId: task.eventId,
      before: existingTask,
      after: task,
      metadata: { status: body.status }
    });

    res.json({ task });
  })
);

router.put(
  "/:id/assignment",
  requireRole([Role.ORGANIZER, Role.LOGISTICS_MANAGER, Role.SUPER_ADMIN]),
  asyncHandler(async (req: AuthRequest, res) => {
    const body = z
      .object({
        driverId: z.string().nullable().optional(),
        status: z.nativeEnum(TaskStatus).optional(),
        ownerName: z.string().nullable().optional(),
        scheduledAt: z.coerce.date().optional(),
        deadlineAt: z.coerce.date().nullable().optional()
      })
      .parse(req.body);
    const existingTask = await prisma.task.findUnique({
      where: { id: req.params.id }
    });

    if (!existingTask) {
      throw new HttpError(404, "Task not found");
    }

    await assertCanMutateEventId(req.user!, existingTask.eventId);

    if (body.driverId) {
      const driver = await prisma.driver.findUnique({
        where: { id: body.driverId }
      });

      if (!driver || !driver.active) {
        throw new HttpError(409, "Selected driver is not active");
      }
    }

    const nextStatus =
      body.status ??
      (body.driverId === null
        ? TaskStatus.PENDING
        : body.driverId
          ? TaskStatus.ASSIGNED
          : undefined);

    const task = await prisma.task.update({
      where: { id: existingTask.id },
      data: {
        driverId: body.driverId,
        status: nextStatus,
        ownerName: body.ownerName,
        scheduledAt: body.scheduledAt,
        deadlineAt: body.deadlineAt,
        completedAt:
          nextStatus === undefined
            ? undefined
            : nextStatus === TaskStatus.COMPLETED
              ? new Date()
              : null
      },
      include: taskResponseInclude
    });

    if (existingTask.driverId && existingTask.driverId !== task.driverId) {
      await releaseDriverIfIdle(existingTask.driverId);
    }

    if (
      task.driverId &&
      task.status !== TaskStatus.COMPLETED &&
      task.status !== TaskStatus.CANCELLED
    ) {
      await prisma.driver.update({
        where: { id: task.driverId },
        data: { status: "ASSIGNED" }
      });
    }

    const io = req.app.get("io") as Server | undefined;
    io?.to(`event:${task.eventId}`).emit("task:status_change", {
      taskId: task.id,
      status: task.status,
      driverId: task.driverId,
      guestId: task.guestId
    });

    if (task.driver?.userId) {
      io?.to(`user:${task.driver.userId}`).emit("task:assigned", task);
    }

    if (task.guest?.userId) {
      io?.to(`user:${task.guest.userId}`).emit("task:status_change", {
        taskId: task.id,
        status: task.status
      });
    }

    await recordAuditLog({
      req,
      action: "task.assignment_update",
      entityType: "TASK",
      entityId: task.id,
      eventId: task.eventId,
      before: existingTask,
      after: task
    });

    res.json({ task });
  })
);

async function findNearestAvailableDriverId(input: {
  pickupLat?: number;
  pickupLng?: number;
  eventId: string;
}) {
  const event = await prisma.event.findUnique({
    where: { id: input.eventId }
  });

  const target =
    input.pickupLat && input.pickupLng
      ? { lat: input.pickupLat, lng: input.pickupLng }
      : event?.venueLat && event?.venueLng
        ? { lat: event.venueLat, lng: event.venueLng }
        : RIYADH_CENTER;

  const drivers = await prisma.driver.findMany({
    where: { status: "AVAILABLE" }
  });

  return sortDriversByDistance(drivers, target)[0]?.driver.id;
}

async function releaseDriverIfIdle(driverId: string) {
  const activeTaskCount = await prisma.task.count({
    where: {
      driverId,
      status: { notIn: [TaskStatus.COMPLETED, TaskStatus.CANCELLED] }
    }
  });

  if (activeTaskCount === 0) {
    await prisma.driver.update({
      where: { id: driverId },
      data: { status: "AVAILABLE" }
    });
  }
}

router.get(
  "/:id",
  asyncHandler(async (req: AuthRequest, res) => {
    const task = await prisma.task.findFirst({
      where: {
        AND: [{ id: req.params.id }, buildTaskVisibilityWhere(req.user!) ?? {}]
      },
      include: taskResponseInclude
    });

    res.json({ task: requireEntity(task, "Task not found") });
  })
);

router.post(
  "/:id/reassign",
  requireRole([Role.ORGANIZER, Role.LOGISTICS_MANAGER, Role.SUPER_ADMIN]),
  asyncHandler(async (req: AuthRequest, res) => {
    const task = await prisma.task.findUnique({
      where: { id: req.params.id }
    });

    if (!task) {
      throw new HttpError(404, "Task not found");
    }

    await assertCanMutateEventId(req.user!, task.eventId);

    const driverId = await findNearestAvailableDriverId({
      eventId: task.eventId,
      pickupLat: task.pickupLat ?? undefined,
      pickupLng: task.pickupLng ?? undefined
    });

    if (!driverId) {
      throw new HttpError(409, "No available drivers");
    }

    const updatedTask = await prisma.task.update({
      where: { id: task.id },
      data: { driverId, status: TaskStatus.ASSIGNED },
      include: {
        driver: safeDriverRelation,
        guest: safeGuestRelation
      }
    });

    await prisma.driver.update({
      where: { id: driverId },
      data: { status: "ASSIGNED" }
    });

    const io = req.app.get("io") as Server | undefined;
    io?.to(`event:${task.eventId}`).emit("task:status_change", {
      taskId: task.id,
      status: updatedTask.status,
      driverId
    });

    await recordAuditLog({
      req,
      action: "task.reassign",
      entityType: "TASK",
      entityId: updatedTask.id,
      eventId: task.eventId,
      before: task,
      after: updatedTask,
      metadata: { driverId }
    });

    res.json({ task: updatedTask });
  })
);

export default router;

async function assertCanMutateEventId(user: AuthUser, eventId: string) {
  if (user.role === Role.SUPER_ADMIN || user.role === Role.LOGISTICS_MANAGER) {
    return;
  }

  const event = requireEntity(
    await prisma.event.findUnique({
      where: { id: eventId },
      select: { organizerId: true }
    }),
    "Event not found"
  );

  if (user.role === Role.ORGANIZER && event.organizerId === user.id) {
    return;
  }

  throw new HttpError(403, "Cannot mutate tasks for this event");
}

async function assertGuestBelongsToEvent(guestId: string | undefined, eventId: string) {
  if (!guestId) {
    return;
  }

  const guest = requireEntity(
    await prisma.guest.findUnique({
      where: { id: guestId },
      select: { eventId: true }
    }),
    "Guest not found"
  );

  if (guest.eventId !== eventId) {
    throw new HttpError(409, "Guest does not belong to this event");
  }
}

export function buildTaskVisibilityWhere(
  user: AuthUser
): Prisma.TaskWhereInput | undefined {
  if (operationalAccessRoles.includes(user.role)) {
    return undefined;
  }

  if (user.role === Role.GUEST) {
    return { guest: { userId: user.id } };
  }

  if (user.role === Role.DRIVER) {
    return { driver: { userId: user.id } };
  }

  // SUPPLIER-001: suppliers see no tasks (guests, drivers, raw events).
  return { id: "__no_task_access__" };
}

export function buildTaskStatusUpdateWhere(
  user: AuthUser
): Prisma.TaskWhereInput | undefined {
  if (operationalAccessRoles.includes(user.role)) {
    return undefined;
  }

  if (user.role === Role.DRIVER) {
    return { driver: { userId: user.id } };
  }

  return { id: "__no_task_status_access__" };
}
