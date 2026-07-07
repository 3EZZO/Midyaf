import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import type { AuthRequest } from "../types/auth.js";
import { asyncHandler, requireEntity } from "../utils/http.js";

const router = Router();

router.use(requireAuth);

router.get(
  "/:guestId",
  asyncHandler(async (req: AuthRequest, res) => {
    const rider = await prisma.hospitalityRider.findUnique({
      where: { guestId: req.params.guestId }
    });
    res.json({ rider });
  })
);

router.put(
  "/:id",
  asyncHandler(async (req: AuthRequest, res) => {
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
      await prisma.hospitalityRider.findUnique({ where: { id: req.params.id } }),
      "Hospitality rider not found"
    );

    const rider = await prisma.hospitalityRider.update({
      where: { id: req.params.id },
      data: {
        ...(body.dietaryNeeds && { dietaryNeeds: body.dietaryNeeds }),
        ...(body.roomPreferences && { roomPreferences: body.roomPreferences }),
        ...(body.vehicleRider && { vehicleRider: body.vehicleRider }),
        ...(body.securityNotes && { securityNotes: body.securityNotes }),
        ...(typeof body.fulfilled === "boolean" && {
          fulfilled: body.fulfilled,
          fulfilledBy: body.fulfilled ? req.user!.email : null
        })
      }
    });

    const io = req.app.get("io");
    if (io) {
      io.emit("rider:update", { rider });
    }

    res.json({ rider });
  })
);

export default router;
