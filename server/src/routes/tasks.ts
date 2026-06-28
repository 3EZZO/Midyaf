import { Router } from "express";
import { Role, TaskStatus, TaskType } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import type { Server } from "socket.io";
import { prisma } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { HttpError, asyncHandler, requireEntity } from "../utils/http.js";
import { RIYADH_CENTER, sortDriversByDistance } from "../utils/riyadh.js";
import type { AuthRequest } from "../types/auth.js";
import { recordAuditLog } from "../services/auditLog.js";

const router = Router();
const fullAccessRoles: Role[] = [
  Role.LOGISTICS_MANAGER,
  Role.ORGANIZER,
  Role.SUPER_ADMIN
];
const operationalAccessRoles: Role[] = [...fullAccessRoles, Role.COORDINATOR];

type AuthUser = NonNullable<AuthRequest["user"]>;

router.use(requireAuth);

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
      include: {
        event: true,
        driver: { include: { user: true } },
        guest: { include: { user: true } }
      },
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
      include: {
        event: true,
        driver: { include: { user: true } },
        guest: { include: { user: true } }
      }
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
      include: {
        event: true,
        driver: { include: { user: true } },
        guest: { include: { user: true } }
      }
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
      include: {
        event: true,
        driver: { include: { user: true } },
        guest: { include: { user: true } }
      }
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
      include: {
        event: true,
        driver: { include: { user: true } },
        guest: { include: { user: true } }
      }
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
        driver: { include: { user: true } },
        guest: { include: { user: true } }
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

  if (user.role === Role.SUPPLIER) {
    return { event: { bookings: { some: { supplier: { userId: user.id } } } } };
  }

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
