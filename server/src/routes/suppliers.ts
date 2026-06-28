import { Router } from "express";
import { Role, SupplierCategory } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { HttpError, asyncHandler, requireEntity } from "../utils/http.js";
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

router.get(
  "/",
  asyncHandler(async (req: AuthRequest, res) => {
    const query = z
      .object({
        category: z.nativeEnum(SupplierCategory).optional(),
        search: z.string().optional()
      })
      .parse(req.query);

    const suppliers = await prisma.supplier.findMany({
      where: {
        AND: [
          {
            category: query.category,
            OR: query.search
              ? [
                  { name: { contains: query.search, mode: "insensitive" } },
                  {
                    services: {
                      some: {
                        name: { contains: query.search, mode: "insensitive" }
                      }
                    }
                  }
                ]
              : undefined
          },
          buildSupplierVisibilityWhere(req.user!) ?? {}
        ]
      },
      include: { services: true, city: true },
      orderBy: [
        { sponsoredRank: { sort: "asc", nulls: "last" } },
        { rating: "desc" }
      ]
    });

    res.json({ suppliers });
  })
);

router.post(
  "/",
  requireRole([
    Role.SUPER_ADMIN,
    Role.SUPPLIER,
    Role.ORGANIZER,
    Role.LOGISTICS_MANAGER
  ]),
  asyncHandler(async (req: AuthRequest, res) => {
    const body = z
      .object({
        name: z.string().min(2),
        category: z.nativeEnum(SupplierCategory),
        rating: z.number().min(0).max(5).default(4.5),
        verified: z.boolean().default(false),
        crNumber: z.string().min(10).optional(),
        commissionPercent: z.number().min(10).max(15).default(12),
        sponsoredRank: z.number().int().positive().optional(),
        cityCode: z.string().default("riyadh"),
        services: z
          .array(
            z.object({
              name: z.string().min(2),
              price: z.number().positive(),
              unit: z.string().min(1),
              description: z.string().optional()
            })
          )
          .default([])
      })
      .parse(req.body);

    if (req.user!.role === Role.SUPPLIER) {
      const existingSupplier = await prisma.supplier.findUnique({
        where: { userId: req.user!.id },
        select: { id: true }
      });

      if (existingSupplier) {
        throw new HttpError(409, "Supplier profile already exists for this account");
      }
    }

    const city = await prisma.cityConfig.findUnique({
      where: { code: body.cityCode }
    });

    const supplier = await prisma.supplier.create({
      data: {
        userId: req.user!.role === Role.SUPPLIER ? req.user!.id : undefined,
        name: body.name,
        category: body.category,
        rating: req.user!.role === Role.SUPPLIER ? 0 : body.rating,
        verified: req.user!.role === Role.SUPPLIER ? false : body.verified,
        crNumber: body.crNumber,
        commissionPercent:
          req.user!.role === Role.SUPPLIER ? 12 : body.commissionPercent,
        sponsoredRank:
          req.user!.role === Role.SUPPLIER ? undefined : body.sponsoredRank,
        cityId: city?.id,
        services: {
          create: body.services
        }
      },
      include: { services: true, city: true }
    });

    await recordAuditLog({
      req,
      action: "supplier.create",
      entityType: "SUPPLIER",
      entityId: supplier.id,
      after: supplier,
      metadata: {
        category: supplier.category,
        serviceCount: supplier.services.length
      }
    });

    res.status(201).json({ supplier });
  })
);

router.get(
  "/:id",
  asyncHandler(async (req: AuthRequest, res) => {
    const supplier = await prisma.supplier.findFirst({
      where: {
        AND: [{ id: req.params.id }, buildSupplierVisibilityWhere(req.user!) ?? {}]
      },
      include: {
        services: true,
        bookings: {
          include: { event: true, service: true },
          orderBy: { createdAt: "desc" }
        },
        city: true
      }
    });

    res.json({ supplier: requireEntity(supplier, "Supplier not found") });
  })
);

export default router;

function buildSupplierVisibilityWhere(
  user: AuthUser
): Prisma.SupplierWhereInput | undefined {
  if (fullAccessRoles.includes(user.role)) {
    return undefined;
  }

  if (user.role === Role.SUPPLIER) {
    return { userId: user.id };
  }

  return { id: "__no_supplier_access__" };
}
