import { Router } from "express";
import { Role } from "@prisma/client";
import type { Notification, Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import type { AuthRequest } from "../types/auth.js";
import { HttpError, asyncHandler, requireEntity } from "../utils/http.js";
import { canSeeNotification, opaqueLegacyScopeNotification } from "../utils/messagingPolicy.js";

const router = Router();
const notificationManagerRoles: Role[] = [
  Role.LOGISTICS_MANAGER,
  Role.ORGANIZER,
  Role.SUPER_ADMIN,
  Role.COORDINATOR
];

export const NOTIFICATION_PAGE = 50;
const NOTIFICATION_SCAN_BATCH = 100;
const NOTIFICATION_SCAN_BATCHES = 10;

/**
 * Newest notifications matching `where` that this viewer may see. Managers
 * keep their legacy view of other users' operational notifications, but a
 * private-message notification (subject, sender, conversation) is returned
 * to its recipient only. The scan is bounded so a long run of hidden rows
 * cannot make one request unbounded.
 */
export async function loadVisibleNotifications(
  viewerId: string,
  where: Prisma.NotificationWhereInput | undefined,
  limit = NOTIFICATION_PAGE
) {
  const visible: Notification[] = [];
  let cursor: string | undefined;
  for (let batch = 0; batch < NOTIFICATION_SCAN_BATCHES && visible.length < limit; batch += 1) {
    const rows = await prisma.notification.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: NOTIFICATION_SCAN_BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
    });
    visible.push(...rows.filter((row) => canSeeNotification(row, viewerId)).map(opaqueLegacyScopeNotification));
    if (rows.length < NOTIFICATION_SCAN_BATCH) break;
    cursor = rows[rows.length - 1].id;
  }
  return visible.slice(0, limit);
}

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
    const viewer = req.user!;
    const canViewOthers = notificationManagerRoles.includes(viewer.role);

    if (!canViewOthers && query.userId !== undefined && query.userId !== viewer.id) {
      throw new HttpError(403, "Cannot view another user's notifications");
    }

    const userId = canViewOthers && query.all ? undefined : query.userId ?? viewer.id;
    const notifications = await loadVisibleNotifications(
      viewer.id,
      userId ? { userId } : undefined
    );

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
    // Another user's private-message notification is not acknowledged at all.
    if (!canSeeNotification(existing, req.user!.id)) {
      throw new HttpError(404, "Notification not found");
    }
    const canManage = notificationManagerRoles.includes(req.user!.role);

    if (existing.userId !== req.user!.id && !canManage) {
      throw new HttpError(403, "Cannot update another user's notification");
    }

    const notification = await prisma.notification.update({
      where: { id: req.params.id },
      data: { read: true }
    });

    res.json({ notification: opaqueLegacyScopeNotification(notification) });
  })
);

export default router;
