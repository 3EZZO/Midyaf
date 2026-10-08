import { Router } from "express";
import { Role } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { recordAuditLog } from "../services/auditLog.js";
import type { AuthRequest } from "../types/auth.js";
import { HttpError, asyncHandler, requireEntity } from "../utils/http.js";
import {
  EVENT_OPERATOR_ROLES,
  assertRole,
  isLegacyOperator
} from "../utils/routeAuthorization.js";

const router = Router();

// GUEST reads only its own rider; COORDINATOR has no event assignment model
// yet and is denied (T-08). Mutations stay with LM/SA and the owning ORGANIZER.
const riderReadRoles: Role[] = [...EVENT_OPERATOR_ROLES, Role.GUEST];

const guestOwnershipSelect = {
  id: true,
  userId: true,
  eventId: true,
  event: { select: { organizerId: true } }
} as const;

router.use(requireAuth);

router.get(
  "/:guestId",
  asyncHandler(async (req: AuthRequest, res) => {
    const user = req.user!;
    assertRole(user, riderReadRoles);

    const guest = await prisma.guest.findUnique({
      where: { id: req.params.guestId },
      select: guestOwnershipSelect
    });

    if (!guest) {
      // Only operators learn whether an unrelated guest ID exists.
      throw isLegacyOperator(user)
        ? new HttpError(404, "Guest not found")
        : new HttpError(403, "Cannot view this hospitality rider");
    }

    const allowed =
      isLegacyOperator(user) ||
      (user.role === Role.ORGANIZER && guest.event.organizerId === user.id) ||
      (user.role === Role.GUEST && guest.userId === user.id);

    if (!allowed) {
      throw new HttpError(403, "Cannot view this hospitality rider");
    }

    const rider = await prisma.hospitalityRider.findUnique({
      where: { guestId: guest.id }
    });
    res.json({ rider });
  })
);

router.put(
  "/:id",
  asyncHandler(async (req: AuthRequest, res) => {
    const user = req.user!;
    assertRole(user, EVENT_OPERATOR_ROLES);

    const body = z
      .object({
        dietaryNeeds: z.array(z.string()).optional(),
        roomPreferences: z.array(z.string()).optional(),
        vehicleRider: z.array(z.string()).optional(),
        securityNotes: z.array(z.string()).optional(),
        fulfilled: z.boolean().optional()
      })
      .parse(req.body);

    const existing = requireEntity(
      await prisma.hospitalityRider.findUnique({
        where: { id: req.params.id },
        select: {
          id: true,
          guestId: true,
          fulfilled: true,
          guest: { select: guestOwnershipSelect }
        }
      }),
      "Hospitality rider not found"
    );

    if (
      !isLegacyOperator(user) &&
      existing.guest.event.organizerId !== user.id
    ) {
      throw new HttpError(403, "Cannot update this hospitality rider");
    }

    const rider = await prisma.hospitalityRider.update({
      where: { id: existing.id },
      data: {
        ...(body.dietaryNeeds && { dietaryNeeds: body.dietaryNeeds }),
        ...(body.roomPreferences && { roomPreferences: body.roomPreferences }),
        ...(body.vehicleRider && { vehicleRider: body.vehicleRider }),
        ...(body.securityNotes && { securityNotes: body.securityNotes }),
        ...(typeof body.fulfilled === "boolean" && {
          fulfilled: body.fulfilled,
          fulfilledBy: body.fulfilled ? user.email : null
        })
      }
    });

    // Rider contents (dietary, security notes) stay out of the audit trail
    // and the broadcast; both record only which fields changed.
    const changedFields = Object.keys(body).filter(
      (key) => body[key as keyof typeof body] !== undefined
    );
    await recordAuditLog({
      req,
      action: "hospitality_rider.update",
      entityType: "GUEST",
      entityId: existing.guestId,
      eventId: existing.guest.eventId,
      before: { riderId: existing.id, fulfilled: existing.fulfilled },
      after: { riderId: rider.id, fulfilled: rider.fulfilled },
      metadata: { riderId: rider.id, changedFields }
    });

    const io = req.app.get("io");
    if (io) {
      io.to(`event:${existing.guest.eventId}`)
        .to(`user:${existing.guest.userId}`)
        .emit("rider:update", {
          rider: {
            id: rider.id,
            guestId: rider.guestId,
            fulfilled: rider.fulfilled
          }
        });
    }

    res.json({ rider });
  })
);

export default router;
