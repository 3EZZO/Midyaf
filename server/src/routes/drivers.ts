import { Router } from "express";
import bcrypt from "bcryptjs";
import { CaptainType, DriverStatus, DriverZone, Role } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import type { Server } from "socket.io";
import { prisma } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler, requireEntity } from "../utils/http.js";
import { inferRiyadhZone } from "../utils/riyadh.js";
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
    const drivers = await prisma.driver.findMany({
      where: buildDriverVisibilityWhere(req.user!),
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
        tasks: {
          where: { status: { notIn: ["COMPLETED", "CANCELLED"] } },
          orderBy: { scheduledAt: "asc" }
        }
      },
      orderBy: [{ status: "asc" }, { zone: "asc" }]
    });

    res.json({ drivers });
  })
);

router.post(
  "/",
  requireRole([Role.SUPER_ADMIN, Role.ORGANIZER, Role.LOGISTICS_MANAGER]),
  asyncHandler(async (req: AuthRequest, res) => {
    const body = z
      .object({
        userId: z.string().optional(),
        name: z.string().min(2).optional(),
        email: z.string().email().toLowerCase().optional(),
        phone: z.string().regex(/^\+9665\d{8}$/).optional(),
        licenseNo: z.string().min(3),
        nationalIdIqama: z.string().regex(/^[12]\d{9}$/),
        zone: z.nativeEnum(DriverZone).default(DriverZone.CENTRAL_RIYADH),
        captainType: z.nativeEnum(CaptainType).default(CaptainType.SHUTTLE),
        overtimeAvailable: z.boolean().default(false),
        active: z.boolean().default(true),
        currentLat: z.number().optional(),
        currentLng: z.number().optional(),
        shiftStart: z.coerce.date().optional(),
        shiftEnd: z.coerce.date().optional()
      })
      .parse(req.body);

    let userId = body.userId;

    if (!userId) {
      if (!body.name || !body.email || !body.phone) {
        throw new Error("Driver name, email, and phone are required");
      }

      const user = await prisma.user.create({
        data: {
          name: body.name,
          email: body.email,
          phone: body.phone,
          role: Role.DRIVER,
          language: "ar",
          passwordHash: await bcrypt.hash("Midyaf@2026", 12)
        }
      });
      userId = user.id;
    }

    const driver = await prisma.driver.create({
      data: {
        userId,
        licenseNo: body.licenseNo,
        nationalIdIqama: body.nationalIdIqama,
        zone: body.zone,
        captainType: body.captainType,
        overtimeAvailable: body.overtimeAvailable,
        active: body.active,
        currentLat: body.currentLat,
        currentLng: body.currentLng,
        shiftStart: body.shiftStart,
        shiftEnd: body.shiftEnd,
        status: DriverStatus.AVAILABLE
      },
      include: { user: true }
    });

    await recordAuditLog({
      req,
      action: "driver.create",
      entityType: "DRIVER",
      entityId: driver.id,
      after: driver
    });

    res.status(201).json({ driver });
  })
);

router.put(
  "/:id/location",
  asyncHandler(async (req: AuthRequest, res) => {
    const body = z
      .object({
        lat: z.number(),
        lng: z.number(),
        eventId: z.string().optional()
      })
      .parse(req.body);
    const existingDriver = requireEntity(
      await prisma.driver.findFirst({
        where: {
          AND: [
            { id: req.params.id },
            buildDriverLocationUpdateWhere(req.user!) ?? {}
          ]
        }
      }),
      "Driver not found"
    );

    const zone = inferRiyadhZone({ lat: body.lat, lng: body.lng });
    const driver = await prisma.driver.update({
      where: { id: existingDriver.id },
      data: {
        currentLat: body.lat,
        currentLng: body.lng,
        zone,
        lastLocationAt: new Date(),
        status: DriverStatus.EN_ROUTE
      },
      include: {
        user: { select: { id: true, name: true, phone: true } }
      }
    });

    const io = req.app.get("io") as Server | undefined;
    io?.to(body.eventId ? `event:${body.eventId}` : "organizers").emit(
      "driver:location_update",
      {
        driverId: driver.id,
        userId: driver.userId,
        name: driver.user.name,
        lat: body.lat,
        lng: body.lng,
        zone,
        updatedAt: driver.lastLocationAt
      }
    );

    await recordAuditLog({
      req,
      action: "driver.location_update",
      entityType: "DRIVER",
      entityId: driver.id,
      eventId: body.eventId,
      before: existingDriver,
      after: driver,
      metadata: { lat: body.lat, lng: body.lng, zone }
    });

    res.json({ driver });
  })
);

router.get(
  "/:id/tasks",
  asyncHandler(async (req: AuthRequest, res) => {
    const driver = requireEntity(
      await prisma.driver.findFirst({
        where: {
          AND: [{ id: req.params.id }, buildDriverVisibilityWhere(req.user!) ?? {}]
        }
      }),
      "Driver not found"
    );
    const tasks = await prisma.task.findMany({
      where: {
        AND: [{ driverId: driver.id }, buildDriverTaskVisibilityWhere(req.user!) ?? {}]
      },
      include: {
        event: true,
        guest: { include: { user: true } }
      },
      orderBy: { scheduledAt: "asc" }
    });

    res.json({ tasks });
  })
);

export default router;

export function buildDriverVisibilityWhere(
  user: AuthUser
): Prisma.DriverWhereInput | undefined {
  if (operationalAccessRoles.includes(user.role)) {
    return undefined;
  }

  if (user.role === Role.DRIVER) {
    return { userId: user.id };
  }

  if (user.role === Role.GUEST) {
    return { tasks: { some: { guest: { userId: user.id } } } };
  }

  return { id: "__no_driver_access__" };
}

export function buildDriverLocationUpdateWhere(
  user: AuthUser
): Prisma.DriverWhereInput | undefined {
  if (operationalAccessRoles.includes(user.role)) {
    return undefined;
  }

  if (user.role === Role.DRIVER) {
    return { userId: user.id };
  }

  return { id: "__no_driver_location_access__" };
}

function buildDriverTaskVisibilityWhere(
  user: AuthUser
): Prisma.TaskWhereInput | undefined {
  if (operationalAccessRoles.includes(user.role)) {
    return undefined;
  }

  if (user.role === Role.DRIVER) {
    return { driver: { userId: user.id } };
  }

  if (user.role === Role.GUEST) {
    return { guest: { userId: user.id } };
  }

  return { id: "__no_driver_task_access__" };
}
