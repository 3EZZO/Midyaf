import { Router } from "express";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import type { AuthRequest } from "../types/auth.js";
import { HttpError, asyncHandler, requireEntity } from "../utils/http.js";
import { recordAuditLog } from "../services/auditLog.js";

const router = Router();

const phoneSchema = z.string().regex(/^\+9665\d{8}$/, {
  message: "Phone must use Saudi +9665XXXXXXXX format"
});

const userSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  language: true,
  avatar: true,
  createdAt: true
} as const;

const managementRoles = [
  Role.LOGISTICS_MANAGER,
  Role.ORGANIZER,
  Role.SUPER_ADMIN
];

router.use(requireAuth);

router.get(
  "/",
  requireRole(managementRoles),
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({
      select: userSelect,
      orderBy: [{ role: "asc" }, { createdAt: "desc" }]
    });

    res.json({ users });
  })
);

router.post(
  "/",
  requireRole(managementRoles),
  asyncHandler(async (req: AuthRequest, res) => {
    const body = z
      .object({
        name: z.string().min(2),
        email: z.string().email().toLowerCase(),
        phone: phoneSchema,
        role: z.nativeEnum(Role),
        language: z.enum(["ar", "en"]).default("ar"),
        avatar: z.string().optional(),
        password: z.string().min(8).default("Midyaf@2026")
      })
      .parse(req.body);

    assertCanAssignRole(req.user!.role, body.role);

    const user = await prisma.user.create({
      data: {
        name: body.name,
        email: body.email,
        phone: body.phone,
        role: body.role,
        language: body.language,
        avatar: body.avatar,
        passwordHash: await bcrypt.hash(body.password, 12)
      },
      select: userSelect
    });

    await recordAuditLog({
      req,
      action: "user.create",
      entityType: "USER",
      entityId: user.id,
      after: user,
      metadata: { assignedRole: user.role }
    });

    res.status(201).json({ user, initialPassword: body.password });
  })
);

router.put(
  "/:id",
  requireRole(managementRoles),
  asyncHandler(async (req: AuthRequest, res) => {
    const body = z
      .object({
        name: z.string().min(2).optional(),
        email: z.string().email().toLowerCase().optional(),
        phone: phoneSchema.optional(),
        role: z.nativeEnum(Role).optional(),
        language: z.enum(["ar", "en"]).optional(),
        avatar: z.string().nullable().optional(),
        password: z.string().min(8).optional()
      })
      .parse(req.body);

    if (body.role) {
      assertCanAssignRole(req.user!.role, body.role);
    }

    const existingUser = requireEntity(
      await prisma.user.findUnique({
        where: { id: req.params.id },
        select: userSelect
      }),
      "User not found"
    );

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        name: body.name,
        email: body.email,
        phone: body.phone,
        role: body.role,
        language: body.language,
        avatar: body.avatar,
        passwordHash: body.password
          ? await bcrypt.hash(body.password, 12)
          : undefined
      },
      select: userSelect
    });

    await recordAuditLog({
      req,
      action: "user.update",
      entityType: "USER",
      entityId: user.id,
      before: existingUser,
      after: user,
      metadata: { roleChanged: existingUser.role !== user.role }
    });

    res.json({ user });
  })
);

function assertCanAssignRole(actorRole: Role, targetRole: Role) {
  if (actorRole === Role.SUPER_ADMIN) {
    return;
  }

  if (targetRole === Role.SUPER_ADMIN || targetRole === Role.LOGISTICS_MANAGER) {
    throw new HttpError(403, "Only a super admin can assign this role");
  }
}

export default router;
