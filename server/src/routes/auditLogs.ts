import { Router } from "express";
import { Role } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/http.js";

const router = Router();
const auditReadRoles = [
  Role.LOGISTICS_MANAGER,
  Role.ORGANIZER,
  Role.SUPER_ADMIN
];

router.use(requireAuth);

router.get(
  "/",
  requireRole(auditReadRoles),
  asyncHandler(async (req, res) => {
    const query = z
      .object({
        eventId: z.string().optional(),
        entityType: z.string().optional(),
        action: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(200).default(100)
      })
      .parse(req.query);

    const auditLogs = await prisma.auditLog.findMany({
      where: {
        eventId: query.eventId,
        entityType: query.entityType,
        action: query.action
      },
      include: {
        actor: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true
          }
        }
      },
      orderBy: { createdAt: "desc" },
      take: query.limit
    });

    res.json({ auditLogs });
  })
);

export default router;
