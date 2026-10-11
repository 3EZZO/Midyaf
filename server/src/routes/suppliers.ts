import { Router } from "express";
import type { NextFunction, Response } from "express";
import { QuoteStatus, Role, SupplierCategory } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { HttpError, asyncHandler, requireEntity } from "../utils/http.js";
import type { AuthRequest } from "../types/auth.js";
import { recordAuditLog } from "../services/auditLog.js";
import {
  MAX_SUPPLIER_PAGE_SIZE,
  SUPPLIER_DEMO_REQUESTS,
  SUPPLIER_REQUEST_CURRENCY,
  computeQuoteTerms,
  evaluateSupplierRequest,
  idParamSchema,
  lockIntake,
  opaqueReference,
  parseIdParam,
  requestNotFound,
  supplierListQuerySchema,
  supplierNoteBodySchema,
  supplierQuoteBodySchema,
  toOwnNoteDto,
  toOwnQuoteDto,
  toSafeHttpError,
  toSupplierBookingDto,
  toSupplierProfileDto,
  toSupplierRequestDto,
  toSupplierServiceDto,
  writeTransactionalAudit,
  type AuditContext,
  type EligibleRequest,
  type OwnNoteRow,
  type SupplierBookingRow
} from "../utils/supplierPortal.js";

const router = Router();
const fullAccessRoles: Role[] = [
  Role.LOGISTICS_MANAGER,
  Role.ORGANIZER,
  Role.SUPER_ADMIN
];

type AuthUser = NonNullable<AuthRequest["user"]>;

router.use(requireAuth);

// ---------------------------------------------------------------------------
// SUPPLIER-001: the supplier's own workspace. Registered before /:id. Every
// lookup starts from Supplier.userId = the verified token subject; nothing in
// the request can name another supplier, category or event.
// ---------------------------------------------------------------------------

const supplierOnly = requireRole([Role.SUPPLIER]);

const ownEventSelect = {
  id: true,
  date: true,
  currency: true,
  timezone: true
} as const;

const ownQuoteSelect = {
  id: true,
  intakeId: true,
  category: true,
  item: true,
  quantity: true,
  unitPrice: true,
  totalPrice: true,
  status: true,
  createdAt: true
} as const;

async function findOwnSupplier(user: AuthUser) {
  return prisma.supplier.findUnique({
    where: { userId: user.id },
    select: { id: true, name: true, category: true, commissionPercent: true }
  });
}

async function requireOwnSupplier(user: AuthUser) {
  const supplier = await findOwnSupplier(user);
  if (!supplier) {
    throw new HttpError(403, "No supplier profile is linked to this account");
  }
  return supplier;
}

function auditContext(req: AuthRequest): AuditContext {
  return {
    actor: req.user!,
    ipAddress: req.ip ?? null,
    userAgent: req.get("user-agent") ?? null
  };
}

router.get(
  "/me/dashboard",
  supplierOnly,
  asyncHandler(async (req: AuthRequest, res) => {
    const supplier = await prisma.supplier.findUnique({
      where: { userId: req.user!.id },
      select: {
        id: true,
        name: true,
        category: true,
        verified: true,
        city: { select: { code: true, nameEn: true, nameAr: true } },
        services: {
          select: {
            id: true,
            name: true,
            description: true,
            unit: true,
            available: true,
            price: true
          },
          orderBy: [{ name: "asc" }, { id: "asc" }],
          take: MAX_SUPPLIER_PAGE_SIZE
        },
        bookings: {
          select: {
            id: true,
            quantity: true,
            totalPrice: true,
            status: true,
            service: { select: { name: true, unit: true } },
            event: { select: ownEventSelect }
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: MAX_SUPPLIER_PAGE_SIZE
        }
      }
    });

    if (!supplier) {
      res.json({ linked: false, profile: null, services: [], bookings: [] });
      return;
    }

    res.json({
      linked: true,
      profile: toSupplierProfileDto(supplier),
      services: supplier.services.map(toSupplierServiceDto),
      bookings: supplier.bookings.map(toSupplierBookingDto)
    });
  })
);

router.get(
  "/me/requests",
  supplierOnly,
  asyncHandler(async (req: AuthRequest, res) => {
    const supplier = await findOwnSupplier(req.user!);
    if (!supplier) {
      res.json({ linked: false, requests: [] });
      return;
    }

    const requests = [];
    for (const entry of SUPPLIER_DEMO_REQUESTS) {
      const intake = await prisma.activityIntake.findUnique({
        where: { id: entry.intakeId }
      });
      const event = intake?.eventId
        ? await prisma.event.findUnique({
            where: { id: intake.eventId },
            select: ownEventSelect
          })
        : null;
      const eligible = evaluateSupplierRequest(intake, event, supplier.category);
      if (!eligible) continue;

      const [ownQuote, notes] = await Promise.all([
        prisma.vendorQuote.findFirst({
          where: {
            supplierId: supplier.id,
            intakeId: eligible.intakeId,
            category: supplier.category
          },
          select: ownQuoteSelect
        }),
        prisma.supplierRequestNote.findMany({
          where: { supplierId: supplier.id, intakeId: eligible.intakeId },
          select: { id: true, text: true, createdAt: true },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          take: MAX_SUPPLIER_PAGE_SIZE
        })
      ]);
      requests.push(toSupplierRequestDto(eligible, ownQuote, notes));
    }

    res.json({ linked: true, requests });
  })
);

router.post(
  "/me/requests/:intakeId/quotes",
  supplierOnly,
  asyncHandler(async (req: AuthRequest, res) => {
    const intakeId = parseIdParam(req.params.intakeId);
    const supplier = await requireOwnSupplier(req.user!);
    const body = supplierQuoteBodySchema.parse(req.body);
    const terms = computeQuoteTerms(body.quantity, body.unitPrice, supplier.commissionPercent);
    const context = auditContext(req);

    try {
      const quote = await prisma.$transaction(async (tx) => {
        await lockIntake(tx, intakeId);
        const intake = await tx.activityIntake.findUnique({ where: { id: intakeId } });
        const event = intake?.eventId
          ? await tx.event.findUnique({ where: { id: intake.eventId }, select: ownEventSelect })
          : null;
        const eligible = evaluateSupplierRequest(intake, event, supplier.category);
        if (!eligible) throw requestNotFound();

        const existing = await tx.vendorQuote.findFirst({
          where: { supplierId: supplier.id, intakeId, category: supplier.category },
          select: { id: true }
        });
        if (existing) {
          throw new HttpError(409, "An initial quote was already submitted for this request");
        }

        const created = await tx.vendorQuote.create({
          data: {
            intakeId,
            supplierId: supplier.id,
            category: supplier.category,
            vendorName: supplier.name,
            item: body.item,
            quantity: body.quantity,
            unitPrice: terms.unitPrice,
            totalPrice: terms.totalPrice,
            commissionPercent: terms.commissionPercent,
            commissionAmount: terms.commissionAmount,
            // 0 = unassessed; no weighted evaluation exists (D-005 deferred).
            score: 0,
            status: QuoteStatus.RECEIVED,
            isVaultSealed: true
          },
          select: ownQuoteSelect
        });

        await writeTransactionalAudit(tx, context, {
          action: "supplier_quote.submit",
          entityType: "VENDOR_QUOTE",
          entityId: created.id,
          eventId: eligible.eventId,
          metadata: { intakeId, supplierId: supplier.id, quoteId: created.id }
        });

        return created;
      });

      res.status(201).json({ quote: toOwnQuoteDto(quote) });
    } catch (error) {
      throw toSafeHttpError(error);
    }
  })
);

router.post(
  "/me/requests/:intakeId/notes",
  supplierOnly,
  asyncHandler(async (req: AuthRequest, res) => {
    const intakeId = parseIdParam(req.params.intakeId);
    const supplier = await requireOwnSupplier(req.user!);
    const body = supplierNoteBodySchema.parse(req.body);
    const context = auditContext(req);

    try {
      const note = await prisma.$transaction(async (tx) => {
        await lockIntake(tx, intakeId);
        const intake = await tx.activityIntake.findUnique({ where: { id: intakeId } });
        const event = intake?.eventId
          ? await tx.event.findUnique({ where: { id: intake.eventId }, select: ownEventSelect })
          : null;
        const eligible = evaluateSupplierRequest(intake, event, supplier.category);
        if (!eligible) throw requestNotFound();

        const created = await tx.supplierRequestNote.create({
          data: {
            intakeId,
            supplierId: supplier.id,
            authorUserId: req.user!.id,
            text: body.text
          },
          select: { id: true, text: true, createdAt: true }
        });

        await writeTransactionalAudit(tx, context, {
          action: "supplier_note.append",
          entityType: "SUPPLIER_NOTE",
          entityId: created.id,
          eventId: eligible.eventId,
          metadata: { intakeId, supplierId: supplier.id, noteId: created.id }
        });

        return created;
      });

      res.status(201).json({ note: toOwnNoteDto(note) });
    } catch (error) {
      throw toSafeHttpError(error);
    }
  })
);

router.get(
  "/me/quotes",
  supplierOnly,
  asyncHandler(async (req: AuthRequest, res) => {
    const query = supplierListQuerySchema.parse(req.query);
    const supplier = await findOwnSupplier(req.user!);
    if (!supplier) {
      res.json({ linked: false, quotes: [], nextCursor: null });
      return;
    }

    if (query.cursor) {
      const anchor = await prisma.vendorQuote.findFirst({
        where: { id: query.cursor, supplierId: supplier.id },
        select: { id: true }
      });
      if (!anchor) throw new HttpError(400, "Invalid cursor");
    }

    // Ownership is the stored supplierId, never a vendorName match.
    const rows = await prisma.vendorQuote.findMany({
      where: { supplierId: supplier.id },
      select: ownQuoteSelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {})
    });
    const page = rows.slice(0, query.limit);

    res.json({
      linked: true,
      quotes: page.map(toOwnQuoteDto),
      nextCursor: rows.length > query.limit ? page[page.length - 1]?.id ?? null : null
    });
  })
);

// ---------------------------------------------------------------------------
// ADMIN-PORTALS-001: read-only Super Admin view of any supplier workspace.
// Registered before /:id. The supplier is chosen by its database id only;
// nothing from the caller other than the verified token role grants access.
// GETs only: no writes, no audit rows, no approval or unsealing (D-011).
// ---------------------------------------------------------------------------

const superAdminOnly = requireRole([Role.SUPER_ADMIN]);
const noQuerySchema = z.object({}).strict();

/** Quote metadata only: prices, commission and score are never selected. */
const adminQuoteSelect = {
  id: true,
  intakeId: true,
  category: true,
  item: true,
  quantity: true,
  status: true,
  createdAt: true
} as const;

type AdminQuoteRow = {
  id: string;
  intakeId: string;
  category: string;
  item: string;
  quantity: number;
  status: QuoteStatus;
  createdAt: Date;
};

function toAdminQuoteDto(quote: AdminQuoteRow) {
  return {
    id: quote.id,
    requestReference: opaqueReference("REQ", quote.intakeId),
    intakeId: quote.intakeId,
    category: quote.category,
    item: quote.item,
    quantity: quote.quantity,
    currency: SUPPLIER_REQUEST_CURRENCY,
    status: quote.status,
    // Supplier terms stay sealed for every reader except the supplier (D-011).
    sealed: true as const,
    policyPending: true as const,
    submittedAt: new Date(quote.createdAt).toISOString()
  };
}

function toAdminRequestDto(
  request: EligibleRequest,
  quote: AdminQuoteRow | null,
  notes: OwnNoteRow[]
) {
  return {
    intakeId: request.intakeId,
    reference: opaqueReference("REQ", request.intakeId),
    eventCode: request.eventCode,
    category: request.category,
    scope: request.demand.scope,
    estimatedQuantity: request.demand.estimatedQuantity,
    unit: request.demand.unit,
    isEstimate: true as const,
    status: "QUOTING" as const,
    currency: request.currency,
    eventDate: new Date(request.eventDate).toISOString(),
    timezone: request.timezone,
    quote: quote ? toAdminQuoteDto(quote) : null,
    notes: notes.map(toOwnNoteDto)
  };
}

function parseSupplierId(value: unknown) {
  const parsed = idParamSchema.safeParse(value);
  if (!parsed.success) throw new HttpError(404, "Supplier not found");
  return parsed.data;
}

/** A booking whose service or event row is missing is omitted, never filled in. */
function hasBookingRelations(booking: SupplierBookingRow) {
  return Boolean(booking.service && booking.event);
}

router.get(
  "/admin/workspaces",
  superAdminOnly,
  asyncHandler(async (req: AuthRequest, res) => {
    noQuerySchema.parse(req.query);
    const rows = await prisma.supplier.findMany({
      select: { id: true, name: true, category: true, userId: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: MAX_SUPPLIER_PAGE_SIZE + 1
    });

    res.json({
      suppliers: rows.slice(0, MAX_SUPPLIER_PAGE_SIZE).map((supplier) => ({
        id: supplier.id,
        name: supplier.name,
        category: supplier.category,
        // Link state only: the account id itself is never returned.
        accountLinked: Boolean(supplier.userId)
      })),
      truncated: rows.length > MAX_SUPPLIER_PAGE_SIZE
    });
  })
);

router.get(
  "/admin/workspaces/:supplierId",
  superAdminOnly,
  asyncHandler(async (req: AuthRequest, res) => {
    const supplierId = parseSupplierId(req.params.supplierId);
    noQuerySchema.parse(req.query);

    const supplier = await prisma.supplier.findUnique({
      where: { id: supplierId },
      select: {
        id: true,
        name: true,
        category: true,
        verified: true,
        userId: true,
        city: { select: { code: true, nameEn: true, nameAr: true } },
        services: {
          select: {
            id: true,
            name: true,
            description: true,
            unit: true,
            available: true,
            price: true
          },
          orderBy: [{ name: "asc" }, { id: "asc" }],
          take: MAX_SUPPLIER_PAGE_SIZE
        },
        bookings: {
          select: {
            id: true,
            quantity: true,
            totalPrice: true,
            status: true,
            service: { select: { name: true, unit: true } },
            event: { select: ownEventSelect }
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: MAX_SUPPLIER_PAGE_SIZE
        }
      }
    });
    if (!supplier) throw new HttpError(404, "Supplier not found");

    // Same allow-list and stored-category eligibility the supplier sees.
    const requests: Array<ReturnType<typeof toAdminRequestDto>> = [];
    for (const entry of SUPPLIER_DEMO_REQUESTS) {
      const intake = await prisma.activityIntake.findUnique({
        where: { id: entry.intakeId }
      });
      const event = intake?.eventId
        ? await prisma.event.findUnique({
            where: { id: intake.eventId },
            select: ownEventSelect
          })
        : null;
      const eligible = evaluateSupplierRequest(intake, event, supplier.category);
      if (!eligible) continue;

      const [quote, notes] = await Promise.all([
        prisma.vendorQuote.findFirst({
          where: {
            supplierId: supplier.id,
            intakeId: eligible.intakeId,
            category: supplier.category
          },
          select: adminQuoteSelect
        }),
        prisma.supplierRequestNote.findMany({
          where: { supplierId: supplier.id, intakeId: eligible.intakeId },
          select: { id: true, text: true, createdAt: true },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          take: MAX_SUPPLIER_PAGE_SIZE
        })
      ]);
      requests.push(toAdminRequestDto(eligible, quote, notes));
    }

    const quotes = await prisma.vendorQuote.findMany({
      where: { supplierId: supplier.id },
      select: adminQuoteSelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: MAX_SUPPLIER_PAGE_SIZE
    });

    res.json({
      accountLinked: Boolean(supplier.userId),
      profile: toSupplierProfileDto(supplier),
      services: supplier.services.map(toSupplierServiceDto),
      bookings: supplier.bookings.filter(hasBookingRelations).map(toSupplierBookingDto),
      requests,
      quotes: quotes.map(toAdminQuoteDto),
      policyPending: true
    });
  })
);

// ---------------------------------------------------------------------------
// Operations supplier directory. SUPPLIER accounts use /me above: the raw
// records here carry contacts, CR numbers, commission and booked events.
// ---------------------------------------------------------------------------

function denySupplierRole(req: AuthRequest, _res: Response, next: NextFunction) {
  if (req.user?.role === Role.SUPPLIER) {
    throw new HttpError(403, "Use the supplier workspace");
  }
  next();
}

router.get(
  "/",
  denySupplierRole,
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
  // Supplier self-onboarding is outside SUPPLIER-001's read-only workspace.
  requireRole([Role.SUPER_ADMIN, Role.ORGANIZER, Role.LOGISTICS_MANAGER]),
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

    const city = await prisma.cityConfig.findUnique({
      where: { code: body.cityCode }
    });

    const supplier = await prisma.supplier.create({
      data: {
        name: body.name,
        category: body.category,
        rating: body.rating,
        verified: body.verified,
        crNumber: body.crNumber,
        commissionPercent: body.commissionPercent,
        sponsoredRank: body.sponsoredRank,
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
  denySupplierRole,
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

  return { id: "__no_supplier_access__" };
}
