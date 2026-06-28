import { Router } from "express";
import { Role } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { HttpError, asyncHandler } from "../utils/http.js";
import type { AuthRequest } from "../types/auth.js";
import { recordAuditLog } from "../services/auditLog.js";

const router = Router();
const fullAccessRoles: Role[] = [
  Role.LOGISTICS_MANAGER,
  Role.ORGANIZER,
  Role.SUPER_ADMIN
];

type AuthUser = NonNullable<AuthRequest["user"]>;

router.use(requireAuth);

router.post(
  "/",
  requireRole([
    Role.ORGANIZER,
    Role.LOGISTICS_MANAGER,
    Role.SUPER_ADMIN
  ]),
  asyncHandler(async (req: AuthRequest, res) => {
    const body = z
      .object({
        eventId: z.string(),
        supplierId: z.string(),
        serviceId: z.string(),
        quantity: z.number().int().positive()
      })
      .parse(req.body);
    await assertCanBookForEvent(req.user!, body.eventId);

    const service = await prisma.service.findUnique({
      where: { id: body.serviceId },
      include: { supplier: true }
    });

    if (!service || service.supplierId !== body.supplierId) {
      throw new HttpError(404, "Service not found for supplier");
    }
    if (!service.available) {
      throw new HttpError(409, "Service is not currently available");
    }

    const commissionPercent = Number(service.supplier.commissionPercent);
    const totalPrice = Number(service.price) * body.quantity;
    const commissionAmount = (totalPrice * commissionPercent) / 100;

    const booking = await prisma.booking.create({
      data: {
        eventId: body.eventId,
        supplierId: body.supplierId,
        serviceId: body.serviceId,
        quantity: body.quantity,
        totalPrice,
        commissionPercent,
        commissionAmount,
        status: "CONFIRMED"
      },
      include: {
        supplier: true,
        service: true,
        event: true
      }
    });

    await prisma.notification.create({
      data: {
        userId: booking.event.organizerId,
        title: "Supplier booking confirmed",
        body: `${booking.supplier.name} confirmed ${booking.quantity} x ${booking.service.name}.`
      }
    });

    await recordAuditLog({
      req,
      action: "booking.create",
      entityType: "BOOKING",
      entityId: booking.id,
      eventId: booking.eventId,
      after: booking,
      metadata: {
        supplierId: booking.supplierId,
        serviceId: booking.serviceId,
        commissionAmount: booking.commissionAmount
      }
    });

    res.status(201).json({ booking });
  })
);

router.get(
  "/:eventId",
  asyncHandler(async (req: AuthRequest, res) => {
    const bookings = await prisma.booking.findMany({
      where: {
        AND: [
          { eventId: req.params.eventId },
          buildBookingVisibilityWhere(req.user!) ?? {}
        ]
      },
      include: { supplier: true, service: true, event: true },
      orderBy: { createdAt: "desc" }
    });

    res.json({ bookings });
  })
);

export default router;

async function assertCanBookForEvent(user: AuthUser, eventId: string) {
  if (user.role === Role.SUPER_ADMIN || user.role === Role.LOGISTICS_MANAGER) {
    return;
  }

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { organizerId: true }
  });

  if (!event) {
    throw new HttpError(404, "Event not found");
  }

  if (user.role === Role.ORGANIZER && event.organizerId === user.id) {
    return;
  }

  throw new HttpError(403, "Cannot create bookings for this event");
}

export function buildBookingVisibilityWhere(
  user: AuthUser
): Prisma.BookingWhereInput | undefined {
  if (fullAccessRoles.includes(user.role)) {
    return undefined;
  }

  if (user.role === Role.SUPPLIER) {
    return { supplier: { userId: user.id } };
  }

  return { id: "__no_booking_access__" };
}
