import { Router } from "express";
import { Role } from "@prisma/client";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/http.js";
import { sendNotification } from "../services/notificationDelivery.js";

const router = Router();

router.use(requireAuth);

router.post(
  "/communications/send",
  requireRole([
    Role.LOGISTICS_MANAGER,
    Role.ORGANIZER,
    Role.SUPER_ADMIN,
    Role.COORDINATOR
  ]),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        channel: z.enum(["SMS", "WHATSAPP", "FCM", "IN_APP"]),
        userId: z.string().optional(),
        phone: z.string().optional(),
        title: z.string().min(2),
        body: z.string().min(2),
        metadata: z.record(z.unknown()).optional()
      })
      .parse(req.body);

    const delivery = await sendNotification(body);
    res.status(202).json({ delivery });
  })
);

export default router;
