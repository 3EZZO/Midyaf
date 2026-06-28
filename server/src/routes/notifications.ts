import { Router } from "express";
import { Role } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import type { AuthRequest } from "../types/auth.js";
import { HttpError, asyncHandler, requireEntity } from "../utils/http.js";

const router = Router();
const notificationManagerRoles: Role[] = [
  Role.LOGISTICS_MANAGER,
  Role.ORGANIZER,
  Role.SUPER_ADMIN,
  Role.COORDINATOR
];

router.use(requireAuth);

router.get(
  "/",
  asyncHandler(async (req: AuthRequest, res) => {
    const query = z
      .object({
        userId: z.string().optional(),
        all: z.coerce.boolean().optional()
      })
      .parse(req.query);
    const canViewAll = notificationManagerRoles.includes(req.user!.role);

    const userId = canViewAll && query.all ? undefined : query.userId ?? req.user!.id;

    const notifications = await prisma.notification.findMany({
      where: userId ? { userId } : undefined,
      orderBy: { createdAt: "desc" },
      take: 50
    });

    res.json({ notifications });
  })
);

router.put(
  "/:id/read",
  asyncHandler(async (req: AuthRequest, res) => {
    const existing = requireEntity(
      await prisma.notification.findUnique({ where: { id: req.params.id } }),
      "Notification not found"
    );
    const canManage = notificationManagerRoles.includes(req.user!.role);

    if (existing.userId !== req.user!.id && !canManage) {
      throw new HttpError(403, "Cannot update another user's notification");
    }

    const notification = await prisma.notification.update({
      where: { id: req.params.id },
      data: { read: true }
    });

    res.json({ notification });
  })
);

export default router;
