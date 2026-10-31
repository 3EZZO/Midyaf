import { Router } from "express";
import {
  ActivityStatus,
  ArrivalStatus,
  CarProfile,
  CompanyReportStatus,
  ContractStatus,
  CoordinatorRequestStatus,
  HotelProfile,
  JourneyStage,
  QuoteStatus,
  Role,
  TicketProfile,
  TransportationProfile
} from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { HttpError, asyncHandler, requireEntity } from "../utils/http.js";
import type { AuthRequest } from "../types/auth.js";
import {
  buildAiPlanFromIntake,
  calculateCommission,
  roundCurrency
} from "../services/logisticsRules.js";
import { generateReportPdf } from "../services/pdf.js";
import { recordAuditLog } from "../services/auditLog.js";
import {
  safeDriverRelation,
  safeGuestRelation,
  safeUserRelation
} from "../utils/safeResponse.js";
import { telemetryBuffer } from "../services/telemetryBuffer.js";
import {
  GeofenceEngine,
  geofenceEngine
} from "../services/geofenceEngine.js";
import {
  EVENT_OPERATOR_ROLES,
  LEGACY_OPERATOR_ROLES,
  assertEventOperatorAccess,
  driverIdsAssignedToEvent,
  isLegacyOperator,
  resolveTelemetryScope,
  type TelemetryScope
} from "../utils/routeAuthorization.js";
import {
  MAX_SUPPLIER_PAGE_SIZE,
  idParamSchema,
  isAllowlistedIntake,
  isOpenedByKeyHolder,
  lockIntake,
  parseIdParam,
  submissionRejectBodySchema,
  toReviewNoteDto,
  toSafeHttpError,
  submissionDecisionBodySchema,
  submissionReviewSelect,
  toSubmissionReviewDto,
  VAULT_KEY_HOLDER_ROLE,
  writeTransactionalAudit
} from "../utils/supplierPortal.js";

const router = Router();
const logisticsRoles: Role[] = [
  Role.LOGISTICS_MANAGER,
  Role.ORGANIZER,
  Role.SUPER_ADMIN
];
const reportMutationRoles: Role[] = [Role.LOGISTICS_MANAGER, Role.SUPER_ADMIN];
/** D-011: the only vault key holder and supplier-quote approver. */
const vaultKeyHolderRoles: Role[] = [Role.SUPER_ADMIN];
const companyRoles: Role[] = [...logisticsRoles, Role.COMPANY_ORGANIZER];
const coordinatorRoles: Role[] = [...logisticsRoles, Role.COORDINATOR];
const journeyUpdateRoles: Role[] = [...coordinatorRoles, Role.GUEST];
const requestCreateRoles: Role[] = [
  ...coordinatorRoles,
  Role.COMPANY_ORGANIZER
];

router.use(requireAuth);

// T-08: live telemetry/geofence reads are limited to LM/SA (legacy global
// policy) and an ORGANIZER for its own explicit eventId, scoped to drivers
// that event's stored tasks assign. Scope is resolved before any cache read.

const MAX_RECENT_GEOFENCE_EVENTS = 100;
const MAX_NEARBY_RADIUS_METERS = 100_000;
const DEMO_DRIVER_ID = "demo-driver-synthetic";
const DEMO_DRIVER_NAME = "Demo Captain (synthetic)";

function inTelemetryScope(
  scope: TelemetryScope,
  frame: { driverId: string; eventId?: string }
) {
  const { eventId, driverIds } = scope;
  if (!eventId || !driverIds) return true;
  return frame.eventId === eventId && driverIds.has(frame.driverId);
}

function finiteQueryNumber(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

router.get(
  "/operations/telemetry/snapshot",
  requireRole(EVENT_OPERATOR_ROLES),
  asyncHandler(async (req: AuthRequest, res) => {
    const scope = await resolveTelemetryScope(req.user!, req.query.eventId);
    const snapshot = telemetryBuffer
      .getSnapshot(scope.eventId)
      .filter((frame) => inTelemetryScope(scope, frame));
    res.json({
      count: snapshot.length,
      snapshot,
      timestamp: new Date().toISOString()
    });
  })
);

router.get(
  "/operations/telemetry/buffer-stats",
  // Global cache counters cannot be scoped to an event.
  requireRole(LEGACY_OPERATOR_ROLES),
  asyncHandler(async (_req: AuthRequest, res) => {
    const stats = telemetryBuffer.getStats();
    res.json({ stats });
  })
);

router.get(
  "/operations/telemetry/nearby",
  requireRole(EVENT_OPERATOR_ROLES),
  asyncHandler(async (req: AuthRequest, res) => {
    const lat = finiteQueryNumber(req.query.lat);
    const lng = finiteQueryNumber(req.query.lng);
    const radius =
      req.query.radius === undefined
        ? 5000
        : finiteQueryNumber(req.query.radius);

    if (
      lat === undefined ||
      lng === undefined ||
      Math.abs(lat) > 90 ||
      Math.abs(lng) > 180
    ) {
      throw new HttpError(
        400,
        "Latitude and longitude query params are required"
      );
    }

    if (
      radius === undefined ||
      radius <= 0 ||
      radius > MAX_NEARBY_RADIUS_METERS
    ) {
      throw new HttpError(400, "Radius must be between 0 and 100000 meters");
    }

    const scope = await resolveTelemetryScope(req.user!, req.query.eventId);
    const nearby = telemetryBuffer
      .findDriversWithinRadius(lat, lng, radius, scope.eventId)
      .filter((match) => inTelemetryScope(scope, match.driver));
    res.json({
      origin: { lat, lng },
      radiusMeters: radius,
      matchesCount: nearby.length,
      matches: nearby
    });
  })
);

router.get(
  "/operations/geofences",
  requireRole(EVENT_OPERATOR_ROLES),
  asyncHandler(async (req: AuthRequest, res) => {
    const scope = await resolveTelemetryScope(req.user!, req.query.eventId);
    const all = geofenceEngine.getGeofences();
    // Scoped counts are recomputed from permitted drivers' states; the
    // engine's global counts are never returned for an event scope.
    const { driverIds } = scope;
    const scopedStates = driverIds
      ? [...driverIds].flatMap((id) => geofenceEngine.getDriverState(id))
      : [];
    const geofences = driverIds
      ? all.map((geo) => {
          const ringCounts = Object.fromEntries(
            Object.keys(geo.ringCounts).map((ring) => [ring, 0])
          ) as typeof geo.ringCounts;
          let activeVehiclesCount = 0;
          for (const state of scopedStates) {
            if (state.geofenceId !== geo.id || state.currentRing === "OUTSIDE") {
              continue;
            }
            ringCounts[state.currentRing] += 1;
            activeVehiclesCount += 1;
          }
          return { ...geo, activeVehiclesCount, ringCounts };
        })
      : all;
    res.json({
      count: geofences.length,
      geofences,
      timestamp: new Date().toISOString()
    });
  })
);

router.get(
  "/operations/geofences/recent-events",
  requireRole(EVENT_OPERATOR_ROLES),
  asyncHandler(async (req: AuthRequest, res) => {
    const requested = finiteQueryNumber(req.query.limit);
    const limit =
      requested !== undefined && requested >= 1
        ? Math.min(Math.floor(requested), MAX_RECENT_GEOFENCE_EVENTS)
        : 50;
    const scope = await resolveTelemetryScope(req.user!, req.query.eventId);
    // History carries no event attribution: an event scope filters by the
    // drivers currently assigned to it, before the limit is applied.
    const { driverIds } = scope;
    const events = driverIds
      ? geofenceEngine
          .getRecentEvents(MAX_RECENT_GEOFENCE_EVENTS)
          .filter((event) => driverIds.has(event.driverId))
          .slice(0, limit)
      : geofenceEngine.getRecentEvents(limit);
    res.json({
      count: events.length,
      events
    });
  })
);

router.get(
  "/operations/geofences/driver/:driverId",
  requireRole([...EVENT_OPERATOR_ROLES, Role.DRIVER]),
  asyncHandler(async (req: AuthRequest, res) => {
    const user = req.user!;
    const { driverId } = req.params;

    if (isLegacyOperator(user) || user.role === Role.DRIVER) {
      const driver = await prisma.driver.findUnique({
        where: { id: driverId },
        select: { userId: true }
      });
      if (user.role === Role.DRIVER && driver?.userId !== user.id) {
        throw new HttpError(403, "Drivers can only view their own state");
      }
      requireEntity(driver, "Driver not found");
    } else {
      const eventId = req.query.eventId;
      if (typeof eventId !== "string" || !eventId) {
        throw new HttpError(400, "An eventId query parameter is required");
      }
      await assertEventOperatorAccess(user, eventId);
      const assigned = await driverIdsAssignedToEvent(eventId);
      if (!assigned.has(driverId)) {
        throw new HttpError(403, "Driver is not assigned to this event");
      }
    }

    const states = geofenceEngine.getDriverState(driverId);
    res.json({
      driverId,
      states
    });
  })
);

const simulateHandshakeSchema = z
  .object({
    demo: z.literal(true),
    geofenceCode: z.string().min(1).max(64).optional()
  })
  .strict();

router.post(
  "/operations/geofences/simulate-handshake",
  requireRole(EVENT_OPERATOR_ROLES),
  asyncHandler(async (req: AuthRequest, res) => {
    // Demo-only: a strict allowlist rejects caller-chosen drivers, names and
    // events. A fresh engine keeps the live singleton, its driver states and
    // its transition callbacks untouched.
    const body = simulateHandshakeSchema.parse(req.body ?? {});
    const engine = new GeofenceEngine();
    const geofenceCode = body.geofenceCode ?? "KKIA_ROYAL_T5";
    const geofence = engine.getGeofenceById(geofenceCode);
    if (!geofence) {
      throw new HttpError(400, "Unknown geofence");
    }

    const events = engine.simulateHandshakeSequence(
      DEMO_DRIVER_ID,
      geofence.code,
      DEMO_DRIVER_NAME
    );

    await recordAuditLog({
      req,
      action: "geofence.simulate_handshake",
      entityType: "DRIVER",
      entityId: DEMO_DRIVER_ID,
      metadata: {
        demo: true,
        synthetic: true,
        geofenceCode: geofence.code,
        eventsGenerated: events.length
      }
    });

    const io = req.app.get("io");
    if (io) {
      for (const ev of events) {
        io.to(`user:${req.user!.id}`).emit("geofence:transition", ev);
      }
    }

    res.json({
      success: true,
      demo: true,
      driverId: DEMO_DRIVER_ID,
      geofenceCode: geofence.code,
      eventsGenerated: events.length,
      events
    });
  })
);

type AuthUser = NonNullable<AuthRequest["user"]>;

const activityIntakeSchema = z.object({
  eventId: z.string().optional(),
  activityName: z.string().min(2),
  activityPlace: z.string().min(2),
  visitorCount: z.number().int().nonnegative(),
  vipVisitorCount: z.number().int().nonnegative(),
  normalVisitorCount: z.number().int().nonnegative().optional(),
  transportationType: z
    .nativeEnum(TransportationProfile)
    .default(TransportationProfile.MIXED),
  ticketType: z.nativeEnum(TicketProfile).default(TicketProfile.MIXED),
  hotelType: z.nativeEnum(HotelProfile).default(HotelProfile.MIXED),
  carType: z.nativeEnum(CarProfile).default(CarProfile.MIXED),
  status: z.nativeEnum(ActivityStatus).default(ActivityStatus.DRAFT),
  submittedBy: z.string().min(2)
});

router.get(
  "/activity-intakes",
  asyncHandler(async (req: AuthRequest, res) => {
    const activityIntakes = await prisma.activityIntake.findMany({
      where: await buildActivityIntakeVisibilityWhere(req.user!),
      orderBy: { submittedAt: "desc" }
    });
    res.json({ activityIntakes });
  })
);

router.post(
  "/activity-intakes",
  requireRole(companyRoles),
  asyncHandler(async (req: AuthRequest, res) => {
    const body = activityIntakeSchema.parse(req.body);
    const normalVisitorCount =
      body.normalVisitorCount ??
      Math.max(0, body.visitorCount - body.vipVisitorCount);
    const submittedBy =
      req.user!.role === Role.COMPANY_ORGANIZER
        ? await submittedByForUser(req.user!)
        : body.submittedBy;
    const eventId =
      req.user!.role === Role.COMPANY_ORGANIZER
        ? await companyEditableEventId(req.user!, body.eventId)
        : body.eventId;

    const activityIntake = await prisma.activityIntake.create({
      data: {
        ...body,
        eventId,
        submittedBy,
        normalVisitorCount,
        status: ActivityStatus.AI_PLANNING
      }
    });

    await recordAuditLog({
      req,
      action: "activity_intake.create",
      entityType: "ACTIVITY_INTAKE",
      entityId: activityIntake.id,
      eventId: activityIntake.eventId,
      after: activityIntake
    });

    res.status(201).json({ activityIntake });
  })
);

router.get(
  "/activity-intakes/:id",
  asyncHandler(async (req: AuthRequest, res) => {
    const activityIntake = await prisma.activityIntake.findFirst({
      where: {
        AND: [
          { id: req.params.id },
          (await buildActivityIntakeVisibilityWhere(req.user!)) ?? {}
        ]
      }
    });

    res.json({
      activityIntake: requireEntity(activityIntake, "Activity intake not found")
    });
  })
);

router.put(
  "/activity-intakes/:id",
  requireRole(companyRoles),
  asyncHandler(async (req: AuthRequest, res) => {
    const body = activityIntakeSchema.partial().parse(req.body);
    const existingIntake = requireEntity(
      await prisma.activityIntake.findFirst({
        where: {
          AND: [
            { id: req.params.id },
            (await buildActivityIntakeVisibilityWhere(req.user!)) ?? {}
          ]
        }
      }),
      "Activity intake not found"
    );
    const data =
      req.user!.role === Role.COMPANY_ORGANIZER
        ? {
            ...body,
            eventId: undefined,
            status: undefined,
            submittedBy: await submittedByForUser(req.user!)
          }
        : body;

    const activityIntake = await prisma.activityIntake.update({
      where: { id: existingIntake.id },
      data
    });

    await recordAuditLog({
      req,
      action: "activity_intake.update",
      entityType: "ACTIVITY_INTAKE",
      entityId: activityIntake.id,
      eventId: activityIntake.eventId,
      before: existingIntake,
      after: activityIntake
    });

    res.json({ activityIntake });
  })
);

router.delete(
  "/activity-intakes/:id",
  requireRole([Role.LOGISTICS_MANAGER, Role.SUPER_ADMIN]),
  asyncHandler(async (req: AuthRequest, res) => {
    const existingIntake = requireEntity(
      await prisma.activityIntake.findUnique({ where: { id: req.params.id } }),
      "Activity intake not found"
    );

    // Supplier submissions and notes are retained history (SUPPLIER-001).
    const [ownedQuote, supplierNote] = await Promise.all([
      prisma.vendorQuote.findFirst({
        where: { intakeId: existingIntake.id, supplierId: { not: null } },
        select: { id: true }
      }),
      prisma.supplierRequestNote.findFirst({
        where: { intakeId: existingIntake.id },
        select: { id: true }
      })
    ]);
    if (ownedQuote || supplierNote) {
      throw new HttpError(
        409,
        "This intake has supplier submissions or notes and cannot be deleted"
      );
    }

    await prisma.activityIntake.delete({ where: { id: existingIntake.id } });
    await recordAuditLog({
      req,
      action: "activity_intake.delete",
      entityType: "ACTIVITY_INTAKE",
      entityId: existingIntake.id,
      eventId: existingIntake.eventId,
      before: existingIntake
    });
    res.status(204).send();
  })
);

router.post(
  "/activity-intakes/:id/analyze",
  requireRole(companyRoles),
  asyncHandler(async (req: AuthRequest, res) => {
    const intake = requireEntity(
      await prisma.activityIntake.findFirst({
        where: {
          AND: [
            { id: req.params.id },
            (await buildActivityIntakeVisibilityWhere(req.user!)) ?? {}
          ]
        }
      }),
      "Activity intake not found"
    );
    const plan = buildAiPlanFromIntake(intake);

    const aiPlan = await prisma.aiLogisticsPlan.create({
      data: {
        intakeId: intake.id,
        ...plan,
        confirmed: false
      }
    });

    await prisma.activityIntake.update({
      where: { id: intake.id },
      data: { status: ActivityStatus.AI_PLANNING }
    });

    await recordAuditLog({
      req,
      action: "ai_plan.generate",
      entityType: "AI_PLAN",
      entityId: aiPlan.id,
      eventId: intake.eventId,
      after: aiPlan,
      metadata: { intakeId: intake.id }
    });

    res.status(201).json({ aiPlan });
  })
);

const aiPlanSchema = z.object({
  intakeId: z.string(),
  summary: z.string().min(10),
  assumptions: z.array(z.string()).default([]),
  visitorGrouping: z.string().min(2),
  vipCars: z.number().int().nonnegative(),
  shuttleVehicles: z.number().int().nonnegative(),
  hotelRooms: z.number().int().nonnegative(),
  firstClassTickets: z.number().int().nonnegative(),
  normalTickets: z.number().int().nonnegative(),
  phases: z.array(z.record(z.unknown())).default([]),
  risks: z.array(z.string()).default([]),
  confirmed: z.boolean().default(false)
});

router.get(
  "/ai-plans",
  asyncHandler(async (req: AuthRequest, res) => {
    const aiPlans = await prisma.aiLogisticsPlan.findMany({
      where: await buildAiPlanVisibilityWhere(req.user!),
      orderBy: { createdAt: "desc" }
    });
    res.json({ aiPlans });
  })
);

router.post(
  "/ai-plans",
  requireRole(logisticsRoles),
  asyncHandler(async (req: AuthRequest, res) => {
    const body = aiPlanSchema.parse(req.body);
    await assertCanMutateIntakeId(req.user!, body.intakeId);
    const aiPlan = await prisma.aiLogisticsPlan.create({
      data: {
        ...body,
        assumptions: body.assumptions as Prisma.InputJsonValue,
        phases: body.phases as Prisma.InputJsonValue,
        risks: body.risks as Prisma.InputJsonValue
      }
    });
    await recordAuditLog({
      req,
      action: "ai_plan.create",
      entityType: "AI_PLAN",
      entityId: aiPlan.id,
      after: aiPlan,
      metadata: { intakeId: aiPlan.intakeId }
    });
    res.status(201).json({ aiPlan });
  })
);

router.put(
  "/ai-plans/:id/confirm",
  requireRole(logisticsRoles),
  asyncHandler(async (req: AuthRequest, res) => {
    const existingPlan = requireEntity(
      await prisma.aiLogisticsPlan.findUnique({ where: { id: req.params.id } }),
      "AI plan not found"
    );
    await assertCanMutateIntakeId(req.user!, existingPlan.intakeId);

    const aiPlan = await prisma.aiLogisticsPlan.update({
      where: { id: existingPlan.id },
      data: { confirmed: true }
    });

    await prisma.activityIntake.updateMany({
      where: { id: aiPlan.intakeId },
      data: { status: ActivityStatus.PLAN_CONFIRMED }
    });

    await recordAuditLog({
      req,
      action: "ai_plan.confirm",
      entityType: "AI_PLAN",
      entityId: aiPlan.id,
      before: existingPlan,
      after: aiPlan,
      metadata: { intakeId: aiPlan.intakeId }
    });

    res.json({ aiPlan });
  })
);

const vendorQuoteSchema = z.object({
  intakeId: z.string(),
  category: z.string().min(2),
  vendorName: z.string().min(2),
  item: z.string().min(2),
  quantity: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
  totalPrice: z.number().nonnegative().optional(),
  commissionPercent: z.number().min(0).max(100),
  score: z.number().int().min(0).max(100).default(70),
  status: z.nativeEnum(QuoteStatus).default(QuoteStatus.REQUESTED)
});

router.get(
  "/vendor-quotes",
  asyncHandler(async (req: AuthRequest, res) => {
    // SUPPLIER-001: supplier-owned submissions never enter this raw numeric
    // legacy list; logistics review them through /supplier-submissions.
    const vendorQuotes = await prisma.vendorQuote.findMany({
      where: logisticsRoles.includes(req.user!.role)
        ? { supplierId: null }
        : { id: "__no_quote_access__" },
      orderBy: [{ status: "asc" }, { score: "desc" }]
    });
    res.json({ vendorQuotes });
  })
);

router.post(
  "/vendor-quotes",
  requireRole(logisticsRoles),
  asyncHandler(async (req: AuthRequest, res) => {
    const body = vendorQuoteSchema.parse(req.body);
    await assertCanMutateIntakeId(req.user!, body.intakeId);
    const totalPrice =
      body.totalPrice ?? roundCurrency(body.quantity * body.unitPrice);
    const commissionAmount = calculateCommission(
      totalPrice,
      body.commissionPercent
    );

    const vendorQuote = await prisma.vendorQuote.create({
      data: {
        ...body,
        totalPrice,
        commissionAmount
      }
    });

    await prisma.activityIntake.updateMany({
      where: { id: body.intakeId },
      data: { status: ActivityStatus.QUOTING }
    });

    await recordAuditLog({
      req,
      action: "vendor_quote.create",
      entityType: "VENDOR_QUOTE",
      entityId: vendorQuote.id,
      after: vendorQuote,
      metadata: { intakeId: vendorQuote.intakeId }
    });

    res.status(201).json({ vendorQuote });
  })
);

router.put(
  "/vendor-quotes/:id",
  requireRole(logisticsRoles),
  asyncHandler(async (req: AuthRequest, res) => {
    const body = vendorQuoteSchema.partial().parse(req.body);
    const data = { ...body } as Record<string, unknown>;
    const current = requireEntity(
      await prisma.vendorQuote.findUnique({ where: { id: req.params.id } }),
      "Vendor quote not found"
    );

    // Reparenting needs access to BOTH the current and the proposed intake.
    await assertCanMutateIntakeId(req.user!, current.intakeId);
    if (body.intakeId && body.intakeId !== current.intakeId) {
      await assertCanMutateIntakeId(req.user!, body.intakeId);
    }
    assertLegacyQuote(current);

    if (
      typeof body.quantity === "number" ||
      typeof body.unitPrice === "number" ||
      typeof body.totalPrice === "number" ||
      typeof body.commissionPercent === "number"
    ) {
      const quantity = body.quantity ?? current.quantity;
      const unitPrice = body.unitPrice ?? Number(current.unitPrice);
      const totalPrice = body.totalPrice ?? roundCurrency(quantity * unitPrice);
      const commissionPercent =
        body.commissionPercent ?? Number(current.commissionPercent);

      data.totalPrice = totalPrice;
      data.commissionAmount = calculateCommission(
        totalPrice,
        commissionPercent
      );
    }

    const vendorQuote = await prisma.vendorQuote.update({
      where: { id: req.params.id },
      data
    });

    await recordAuditLog({
      req,
      action: "vendor_quote.update",
      entityType: "VENDOR_QUOTE",
      entityId: vendorQuote.id,
      before: current,
      after: vendorQuote,
      metadata: { intakeId: vendorQuote.intakeId }
    });

    res.json({ vendorQuote });
  })
);

// D-011: approving a quote is the Super Admin's decision, also for legacy
// manual quotes. Logistics roles still create and edit legacy quotes.
router.put(
  "/vendor-quotes/:id/approve",
  requireRole(vaultKeyHolderRoles),
  asyncHandler(async (req: AuthRequest, res) => {
    const existingQuote = requireEntity(
      await prisma.vendorQuote.findUnique({ where: { id: req.params.id } }),
      "Vendor quote not found"
    );
    await assertCanMutateIntakeId(req.user!, existingQuote.intakeId);
    assertLegacyQuote(existingQuote);

    const vendorQuote = await prisma.vendorQuote.update({
      where: { id: existingQuote.id },
      data: { status: QuoteStatus.APPROVED }
    });
    await recordAuditLog({
      req,
      action: "vendor_quote.approve",
      entityType: "VENDOR_QUOTE",
      entityId: vendorQuote.id,
      before: existingQuote,
      after: vendorQuote,
      metadata: { intakeId: vendorQuote.intakeId }
    });
    res.json({ vendorQuote });
  })
);

router.delete(
  "/vendor-quotes/:id",
  requireRole(logisticsRoles),
  asyncHandler(async (req: AuthRequest, res) => {
    const existingQuote = requireEntity(
      await prisma.vendorQuote.findUnique({ where: { id: req.params.id } }),
      "Vendor quote not found"
    );
    await assertCanMutateIntakeId(req.user!, existingQuote.intakeId);
    assertLegacyQuote(existingQuote);

    await prisma.vendorQuote.delete({ where: { id: existingQuote.id } });
    await recordAuditLog({
      req,
      action: "vendor_quote.delete",
      entityType: "VENDOR_QUOTE",
      entityId: existingQuote.id,
      before: existingQuote,
      metadata: { intakeId: existingQuote.intakeId }
    });
    res.status(204).send();
  })
);

// D-011 (approved 2026-10-31): the Midyaf Super Admin is the single key
// holder of every intake vault and the only approver of supplier-portal
// quotes. One audited Super Admin action opens an intake. Reads still need a
// logistics role and access to the intake's event; no other role ever sees
// supplier prices. A session opened any other way (the retired multi-key
// flow, a stored flag) grants no authority.

const vaultOpenSchema = z
  .object({
    // Accepted from older clients and ignored: one Super Admin key opens the
    // vault, and a caller-supplied role label is never authorization.
    keyNumber: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
    roleName: z.string().max(120).optional()
  })
  .strict();

const CLOSED_VAULT_FIELDS = {
  key1User: null,
  key1Role: null,
  key1ApprovedAt: null,
  key2User: null,
  key2Role: null,
  key2ApprovedAt: null,
  key3User: null,
  key3Role: null,
  key3ApprovedAt: null,
  unlockedAt: null
} as const;

router.get(
  "/vault/:intakeId",
  requireRole(logisticsRoles),
  asyncHandler(async (req: AuthRequest, res) => {
    const { intakeId } = req.params;
    await assertIntakeOperatorAccess(req.user!, intakeId);
    // A read never creates a session: a missing one is reported as LOCKED.
    const stored = await prisma.vaultSession.findUnique({ where: { intakeId } });
    const vaultSession = stored ?? {
      id: null,
      intakeId,
      status: "LOCKED",
      ...CLOSED_VAULT_FIELDS
    };

    res.json({
      vaultSession,
      keyHolder: "SUPER_ADMIN",
      opened: isOpenedByKeyHolder(stored),
      canOpen: req.user!.role === Role.SUPER_ADMIN,
      hasSupplierTerms: await hasSupplierSealedTerms(intakeId)
    });
  })
);

router.post(
  "/vault/:intakeId/authorize",
  requireRole(vaultKeyHolderRoles),
  asyncHandler(async (req: AuthRequest, res) => {
    const { intakeId } = req.params;
    await assertIntakeOperatorAccess(req.user!, intakeId);
    vaultOpenSchema.parse(req.body ?? {});

    const existing = await prisma.vaultSession.findUnique({ where: { intakeId } });
    if (isOpenedByKeyHolder(existing)) {
      res.json({ vaultSession: existing, isFullyUnlocked: true, opened: true });
      return;
    }

    const now = new Date();
    const openFields = {
      ...CLOSED_VAULT_FIELDS,
      status: "UNLOCKED",
      key1User: req.user!.email,
      key1Role: VAULT_KEY_HOLDER_ROLE,
      key1ApprovedAt: now,
      unlockedAt: now
    };
    const vaultSession = await prisma.vaultSession.upsert({
      where: { intakeId },
      create: { intakeId, ...openFields },
      update: openFields
    });

    // Legacy manual quotes carry their own flag. Supplier-portal terms keep
    // isVaultSealed=true: they are revealed only to the key holder through
    // the opened session, never by a stored flag.
    await prisma.vendorQuote.updateMany({
      where: { intakeId, supplierId: null },
      data: { isVaultSealed: false }
    });

    await recordAuditLog({
      req,
      action: "vault.opened_by_super_admin",
      entityType: "VAULT_SESSION",
      entityId: vaultSession.id,
      metadata: { intakeId, keyHolder: "SUPER_ADMIN" }
    });

    res.json({ vaultSession, isFullyUnlocked: true, opened: true });
  })
);

router.post(
  "/vault/:intakeId/reset",
  requireRole(vaultKeyHolderRoles),
  asyncHandler(async (req: AuthRequest, res) => {
    const { intakeId } = req.params;
    await assertIntakeOperatorAccess(req.user!, intakeId);
    const session = await prisma.vaultSession.upsert({
      where: { intakeId },
      create: { intakeId, status: "LOCKED" },
      update: { status: "LOCKED", ...CLOSED_VAULT_FIELDS }
    });

    await prisma.vendorQuote.updateMany({
      where: { intakeId },
      data: { isVaultSealed: true }
    });

    await recordAuditLog({
      req,
      action: "vault.reset_sealed",
      entityType: "VAULT_SESSION",
      entityId: session.id,
      metadata: { intakeId }
    });

    res.json({ vaultSession: session });
  })
);

// ---------------------------------------------------------------------------
// SUPPLIER-001 logistics review: origin, item, quantity, status and notes of
// supplier-portal submissions. Never prices, scores or commission.
// ---------------------------------------------------------------------------

router.get(
  "/supplier-submissions",
  requireRole(logisticsRoles),
  asyncHandler(async (req: AuthRequest, res) => {
    const { intakeId } = z
      .object({ intakeId: idParamSchema })
      .strict()
      .parse(req.query);
    await assertIntakeOperatorAccess(req.user!, intakeId);

    const [quotes, notes, session] = await Promise.all([
      prisma.vendorQuote.findMany({
        where: { intakeId, supplierId: { not: null } },
        select: submissionReviewSelect,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: MAX_SUPPLIER_PAGE_SIZE
      }),
      prisma.supplierRequestNote.findMany({
        where: { intakeId },
        select: {
          id: true,
          text: true,
          createdAt: true,
          supplier: { select: { id: true, name: true } },
          author: { select: { id: true, name: true } }
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: MAX_SUPPLIER_PAGE_SIZE
      }),
      prisma.vaultSession.findUnique({ where: { intakeId } })
    ]);

    const opened = isOpenedByKeyHolder(session);
    const isKeyHolder = req.user!.role === Role.SUPER_ADMIN;
    // D-011: terms only for the key holder on a vault opened by that key.
    const revealTerms = isKeyHolder && opened;
    const contracts = quotes.length
      ? await prisma.vendorContract.findMany({
          where: { quoteId: { in: quotes.map((quote) => quote.id) } },
          select: { id: true, quoteId: true, status: true },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }]
        })
      : [];
    const contractByQuote = new Map(
      contracts.map((contract) => [contract.quoteId, { id: contract.id, status: contract.status }])
    );

    res.json({
      intakeId,
      vault: {
        keyHolder: "SUPER_ADMIN",
        opened,
        canOpen: isKeyHolder,
        canApprove: revealTerms
      },
      sealedCount: revealTerms ? 0 : quotes.length,
      submissions: quotes.map((quote) =>
        toSubmissionReviewDto(quote, {
          revealTerms,
          contract: contractByQuote.get(quote.id) ?? null
        })
      ),
      notes: notes.map(toReviewNoteDto)
    });
  })
);

router.post(
  "/supplier-submissions/:id/reject",
  requireRole(logisticsRoles),
  asyncHandler(async (req: AuthRequest, res) => {
    const quoteId = parseIdParam(req.params.id);
    const target = await prisma.vendorQuote.findUnique({
      where: { id: quoteId },
      select: { id: true, intakeId: true, supplierId: true }
    });
    if (!target || !target.supplierId) {
      throw new HttpError(404, "Submission not found");
    }
    await assertIntakeOperatorAccess(req.user!, target.intakeId);
    const body = submissionRejectBodySchema.parse(req.body ?? {});
    const context = {
      actor: req.user!,
      ipAddress: req.ip ?? null,
      userAgent: req.get("user-agent") ?? null
    };

    try {
      const rejected = await prisma.$transaction(async (tx) => {
        await lockIntake(tx, target.intakeId);
        const current = await tx.vendorQuote.findUnique({
          where: { id: quoteId },
          select: { id: true, status: true, supplierId: true, intakeId: true }
        });
        if (!current || !current.supplierId || current.intakeId !== target.intakeId) {
          throw new HttpError(404, "Submission not found");
        }
        // Re-check the intake/event authorization under the lock: ownership
        // may have changed since the check above. A closed request stays
        // rejectable by an authorized operator.
        const { eventId } = await assertIntakeOperatorAccess(req.user!, target.intakeId, tx);
        if (current.status !== QuoteStatus.RECEIVED) {
          throw new HttpError(409, "Only a received submission can be rejected");
        }

        // Status only: the supplier's terms are immutable.
        const updated = await tx.vendorQuote.update({
          where: { id: quoteId },
          data: { status: QuoteStatus.REJECTED },
          select: submissionReviewSelect
        });

        await writeTransactionalAudit(tx, context, {
          action: "supplier_quote.reject",
          entityType: "VENDOR_QUOTE",
          entityId: quoteId,
          eventId,
          metadata: {
            intakeId: target.intakeId,
            supplierId: current.supplierId,
            quoteId,
            reasonProvided: Boolean(body.reason),
            reason: body.reason ?? null
          }
        });

        return updated;
      });

      res.json({ submission: toSubmissionReviewDto(rejected) });
    } catch (error) {
      throw toSafeHttpError(error);
    }
  })
);

/**
 * Loads a supplier-portal submission for a Super Admin decision: 404 for a
 * missing or legacy quote, then the usual intake access check.
 */
async function loadSubmissionForDecision(req: AuthRequest) {
  const quoteId = parseIdParam(req.params.id);
  const target = await prisma.vendorQuote.findUnique({
    where: { id: quoteId },
    select: { id: true, intakeId: true, supplierId: true }
  });
  if (!target || !target.supplierId) {
    throw new HttpError(404, "Submission not found");
  }
  await assertIntakeOperatorAccess(req.user!, target.intakeId);
  submissionDecisionBodySchema.parse(req.body ?? {});
  return { quoteId, intakeId: target.intakeId };
}

/** Re-checked under the intake lock: the vault must be open by the Super Admin key. */
async function assertVaultOpenedByKeyHolder(tx: Prisma.TransactionClient, intakeId: string) {
  const session = await tx.vaultSession.findUnique({ where: { intakeId } });
  if (!isOpenedByKeyHolder(session)) {
    throw new HttpError(409, "Open the vault with the Super Admin key first");
  }
}

function decisionContext(req: AuthRequest) {
  return {
    actor: req.user!,
    ipAddress: req.ip ?? null,
    userAgent: req.get("user-agent") ?? null
  };
}

// D-011: the Super Admin approves exactly one supplier quote per intake and
// category. The other received quotes in that category become REJECTED (not
// selected). Terms are never edited.
router.post(
  "/supplier-submissions/:id/approve",
  requireRole(vaultKeyHolderRoles),
  asyncHandler(async (req: AuthRequest, res) => {
    const { quoteId, intakeId } = await loadSubmissionForDecision(req);
    const context = decisionContext(req);

    try {
      const approved = await prisma.$transaction(async (tx) => {
        await lockIntake(tx, intakeId);
        const { eventId } = await assertIntakeOperatorAccess(req.user!, intakeId, tx);
        await assertVaultOpenedByKeyHolder(tx, intakeId);

        const current = await tx.vendorQuote.findUnique({
          where: { id: quoteId },
          select: { id: true, status: true, supplierId: true, intakeId: true, category: true }
        });
        if (!current || !current.supplierId || current.intakeId !== intakeId) {
          throw new HttpError(404, "Submission not found");
        }
        if (current.status !== QuoteStatus.RECEIVED) {
          throw new HttpError(409, "Only a received submission can be approved");
        }
        const awarded = await tx.vendorQuote.findFirst({
          where: {
            intakeId,
            category: current.category,
            supplierId: { not: null },
            status: QuoteStatus.APPROVED
          },
          select: { id: true }
        });
        if (awarded) {
          throw new HttpError(409, "A supplier quote is already approved for this category");
        }

        const others = await tx.vendorQuote.findMany({
          where: {
            intakeId,
            category: current.category,
            supplierId: { not: null },
            status: QuoteStatus.RECEIVED,
            id: { not: quoteId }
          },
          select: { id: true }
        });

        const updated = await tx.vendorQuote.update({
          where: { id: quoteId },
          data: { status: QuoteStatus.APPROVED },
          select: submissionReviewSelect
        });
        if (others.length) {
          await tx.vendorQuote.updateMany({
            where: { id: { in: others.map((other) => other.id) } },
            data: { status: QuoteStatus.REJECTED }
          });
        }

        await writeTransactionalAudit(tx, context, {
          action: "supplier_quote.approve",
          entityType: "VENDOR_QUOTE",
          entityId: quoteId,
          eventId,
          metadata: {
            intakeId,
            supplierId: current.supplierId,
            quoteId,
            category: current.category,
            notSelectedCount: others.length
          }
        });

        return updated;
      });

      res.json({ submission: toSubmissionReviewDto(approved, { revealTerms: true }) });
    } catch (error) {
      throw toSafeHttpError(error);
    }
  })
);

// D-011: the Super Admin drafts the contract of an approved supplier quote.
// Vendor, category and amounts come from the stored quote, never the client.
router.post(
  "/supplier-submissions/:id/contract",
  requireRole(vaultKeyHolderRoles),
  asyncHandler(async (req: AuthRequest, res) => {
    const { quoteId, intakeId } = await loadSubmissionForDecision(req);
    const context = decisionContext(req);

    try {
      const contract = await prisma.$transaction(async (tx) => {
        await lockIntake(tx, intakeId);
        const { eventId } = await assertIntakeOperatorAccess(req.user!, intakeId, tx);
        await assertVaultOpenedByKeyHolder(tx, intakeId);

        const quote = await tx.vendorQuote.findUnique({
          where: { id: quoteId },
          select: {
            id: true,
            intakeId: true,
            supplierId: true,
            status: true,
            category: true,
            totalPrice: true,
            commissionAmount: true,
            supplier: { select: { name: true } }
          }
        });
        if (!quote || !quote.supplierId || quote.intakeId !== intakeId) {
          throw new HttpError(404, "Submission not found");
        }
        if (quote.status !== QuoteStatus.APPROVED) {
          throw new HttpError(409, "Only an approved submission can be contracted");
        }
        const existing = await tx.vendorContract.findFirst({
          where: { quoteId },
          select: { id: true }
        });
        if (existing) {
          throw new HttpError(409, "A contract already exists for this submission");
        }

        const created = await tx.vendorContract.create({
          data: {
            quoteId,
            vendorName: quote.supplier?.name ?? "Supplier",
            category: quote.category,
            amount: quote.totalPrice,
            commissionAmount: quote.commissionAmount,
            status: ContractStatus.DRAFT
          }
        });

        await writeTransactionalAudit(tx, context, {
          action: "supplier_contract.create",
          entityType: "CONTRACT",
          entityId: created.id,
          eventId,
          metadata: { intakeId, supplierId: quote.supplierId, quoteId, contractId: created.id }
        });

        return created;
      });

      res.status(201).json({ contract });
    } catch (error) {
      throw toSafeHttpError(error);
    }
  })
);

const contractSchema = z.object({
  quoteId: z.string(),
  vendorName: z.string().min(2),
  category: z.string().min(2),
  amount: z.number().nonnegative(),
  commissionAmount: z.number().nonnegative(),
  status: z.nativeEnum(ContractStatus).default(ContractStatus.DRAFT),
  signedAt: z.coerce.date().optional()
});

router.get(
  "/contracts",
  asyncHandler(async (req: AuthRequest, res) => {
    const role = req.user!.role;
    let where: Prisma.VendorContractWhereInput | undefined;
    if (!logisticsRoles.includes(role)) {
      where = { id: "__no_contract_access__" };
    } else if (role !== Role.SUPER_ADMIN) {
      // D-011: a supplier contract carries sealed terms; only the key holder
      // lists it. Legacy manual contracts stay visible as before.
      const supplierQuotes = await prisma.vendorQuote.findMany({
        where: { supplierId: { not: null } },
        select: { id: true }
      });
      where = supplierQuotes.length
        ? { quoteId: { notIn: supplierQuotes.map((quote) => quote.id) } }
        : undefined;
    }
    const contracts = await prisma.vendorContract.findMany({
      where,
      orderBy: { updatedAt: "desc" }
    });
    res.json({ contracts });
  })
);

router.post(
  "/contracts",
  requireRole(logisticsRoles),
  asyncHandler(async (req: AuthRequest, res) => {
    const body = contractSchema.parse(req.body);
    await assertCanMutateQuoteId(req.user!, body.quoteId);
    const contract = await prisma.vendorContract.create({ data: body });
    await recordAuditLog({
      req,
      action: "contract.create",
      entityType: "CONTRACT",
      entityId: contract.id,
      after: contract,
      metadata: { quoteId: contract.quoteId }
    });
    res.status(201).json({ contract });
  })
);

router.put(
  "/contracts/:id",
  requireRole(logisticsRoles),
  asyncHandler(async (req: AuthRequest, res) => {
    const body = contractSchema.partial().parse(req.body);
    const existingContract = requireEntity(
      await prisma.vendorContract.findUnique({ where: { id: req.params.id } }),
      "Contract not found"
    );
    await assertCanMutateQuoteId(
      req.user!,
      body.quoteId ?? existingContract.quoteId
    );

    const contract = await prisma.vendorContract.update({
      where: { id: existingContract.id },
      data: body
    });
    await recordAuditLog({
      req,
      action: "contract.update",
      entityType: "CONTRACT",
      entityId: contract.id,
      before: existingContract,
      after: contract,
      metadata: { quoteId: contract.quoteId }
    });
    res.json({ contract });
  })
);

// D-011: only the Super Admin signs contracts.
router.put(
  "/contracts/:id/approve",
  requireRole(vaultKeyHolderRoles),
  asyncHandler(async (req: AuthRequest, res) => {
    const existingContract = requireEntity(
      await prisma.vendorContract.findUnique({ where: { id: req.params.id } }),
      "Contract not found"
    );
    await assertCanSignContractQuote(req.user!, existingContract.quoteId);
    if (existingContract.status === ContractStatus.SIGNED || existingContract.status === ContractStatus.ACTIVE) {
      throw new HttpError(409, "This contract is already signed");
    }

    const contract = await prisma.vendorContract.update({
      where: { id: existingContract.id },
      data: { status: ContractStatus.SIGNED, signedAt: new Date() }
    });
    await recordAuditLog({
      req,
      action: "contract.approve",
      entityType: "CONTRACT",
      entityId: contract.id,
      before: existingContract,
      after: contract,
      metadata: { quoteId: contract.quoteId }
    });
    res.json({ contract });
  })
);

const journeySchema = z.object({
  guestId: z.string(),
  stage: z.nativeEnum(JourneyStage).default(JourneyStage.ARRIVAL),
  visaStatus: z.string().default("READY"),
  ticketStatus: z.string().default("READY"),
  promoVideos: z.array(z.string()).default([]),
  arrivalStatus: z.nativeEnum(ArrivalStatus).default(ArrivalStatus.PRE_ARRIVAL),
  arrivalGate: z.string().default("TBD"),
  luggageStatus: z.string().default("WAITING"),
  driverName: z.string().default("TBD"),
  driverPhoto: z.string().optional(),
  driverPhone: z.string().default("TBD"),
  carDetails: z.string().default("TBD"),
  etaMinutes: z.number().int().nonnegative().default(0),
  personalTripRequests: z.array(z.string()).default([]),
  notes: z.array(z.string()).default([]),
  complaints: z.array(z.string()).default([]),
  departureFlight: z.string().default("TBD"),
  departurePickupTime: z.coerce.date(),
  departureConfirmed: z.boolean().default(false),
  leavingWithMidyaf: z.boolean().default(true)
});

router.get(
  "/guest-journeys",
  asyncHandler(async (req: AuthRequest, res) => {
    const guestJourneys = await prisma.guestJourneyRecord.findMany({
      where: await buildGuestJourneyVisibilityWhere(req.user!),
      orderBy: { updatedAt: "desc" }
    });
    res.json({ guestJourneys });
  })
);

router.post(
  "/guest-journeys",
  requireRole(coordinatorRoles),
  asyncHandler(async (req: AuthRequest, res) => {
    const body = journeySchema.parse(req.body);
    await assertCanMutateGuestJourneyForGuest(req.user!, body.guestId);
    const guestJourney = await prisma.guestJourneyRecord.create({ data: body });
    await recordAuditLog({
      req,
      action: "guest_journey.create",
      entityType: "GUEST_JOURNEY",
      entityId: guestJourney.id,
      after: guestJourney,
      metadata: { guestId: guestJourney.guestId }
    });
    res.status(201).json({ guestJourney });
  })
);

router.put(
  "/guest-journeys/:id",
  requireRole(journeyUpdateRoles),
  asyncHandler(async (req: AuthRequest, res) => {
    const body = journeySchema.partial().parse(req.body);
    const user = req.user;
    const existingJourney = requireEntity(
      await prisma.guestJourneyRecord.findUnique({
        where: { id: req.params.id }
      }),
      "Guest journey not found"
    );
    let data = { ...body };

    if (user?.role === Role.GUEST) {
      const guest = requireEntity(
        await prisma.guest.findUnique({
          where: { id: existingJourney.guestId }
        }),
        "Guest not found"
      );

      if (guest.userId !== user.id) {
        throw new HttpError(403, "Guests can only update their own journey");
      }

      data = sanitizeGuestJourneyUpdate(data);
    } else if (user) {
      await assertCanMutateGuestJourneyForGuest(
        user,
        body.guestId ?? existingJourney.guestId
      );
    }

    const guestJourney = await prisma.guestJourneyRecord.update({
      where: { id: req.params.id },
      data
    });
    await recordAuditLog({
      req,
      action: "guest_journey.update",
      entityType: "GUEST_JOURNEY",
      entityId: guestJourney.id,
      before: existingJourney,
      after: guestJourney,
      metadata: { guestId: guestJourney.guestId }
    });
    res.json({ guestJourney });
  })
);

const coordinatorRequestSchema = z.object({
  guestName: z.string().min(2),
  request: z.string().min(2),
  route: z.string().min(2),
  priority: z.enum(["VIP", "NORMAL"]).default("NORMAL"),
  status: z
    .nativeEnum(CoordinatorRequestStatus)
    .default(CoordinatorRequestStatus.NEW),
  supervisor: z.string().min(2),
  deadline: z.coerce.date()
});

router.get(
  "/coordinator-requests",
  asyncHandler(async (req: AuthRequest, res) => {
    const coordinatorRequests = await prisma.coordinatorRequest.findMany({
      where: await buildCoordinatorRequestVisibilityWhere(req.user!),
      orderBy: { deadline: "asc" }
    });
    res.json({ coordinatorRequests });
  })
);

router.post(
  "/coordinator-requests",
  requireRole(requestCreateRoles),
  asyncHandler(async (req: AuthRequest, res) => {
    const body = coordinatorRequestSchema.parse(req.body);
    const data =
      req.user!.role === Role.COMPANY_ORGANIZER
        ? {
            ...body,
            guestName: await submittedByForUser(req.user!),
            status: CoordinatorRequestStatus.NEW
          }
        : body;
    const coordinatorRequest = await prisma.coordinatorRequest.create({
      data
    });
    await recordAuditLog({
      req,
      action: "coordinator_request.create",
      entityType: "COORDINATOR_REQUEST",
      entityId: coordinatorRequest.id,
      after: coordinatorRequest
    });
    res.status(201).json({ coordinatorRequest });
  })
);

router.put(
  "/coordinator-requests/:id",
  requireRole(coordinatorRoles),
  asyncHandler(async (req: AuthRequest, res) => {
    const body = coordinatorRequestSchema.partial().parse(req.body);
    const existingRequest = requireEntity(
      await prisma.coordinatorRequest.findUnique({
        where: { id: req.params.id }
      }),
      "Coordinator request not found"
    );
    const coordinatorRequest = await prisma.coordinatorRequest.update({
      where: { id: req.params.id },
      data: body
    });
    await recordAuditLog({
      req,
      action: "coordinator_request.update",
      entityType: "COORDINATOR_REQUEST",
      entityId: coordinatorRequest.id,
      before: existingRequest,
      after: coordinatorRequest
    });
    res.json({ coordinatorRequest });
  })
);

const companyReportSchema = z.object({
  title: z.string().min(2),
  status: z.nativeEnum(CompanyReportStatus).default(CompanyReportStatus.DRAFT),
  kpis: z.array(z.object({ label: z.string(), value: z.string() })),
  pdfUrl: z.string().optional()
});

router.get(
  "/company-reports",
  asyncHandler(async (req: AuthRequest, res) => {
    const companyReports = await prisma.companyReport.findMany({
      where: buildCompanyReportVisibilityWhere(req.user!),
      orderBy: { updatedAt: "desc" }
    });
    res.json({ companyReports });
  })
);

router.post(
  "/company-reports",
  requireRole(reportMutationRoles),
  asyncHandler(async (req: AuthRequest, res) => {
    const body = companyReportSchema.parse(req.body);
    const companyReport = await prisma.companyReport.create({ data: body });
    await recordAuditLog({
      req,
      action: "company_report.create",
      entityType: "COMPANY_REPORT",
      entityId: companyReport.id,
      after: companyReport
    });
    res.status(201).json({ companyReport });
  })
);

router.put(
  "/company-reports/:id/confirm",
  requireRole(reportMutationRoles),
  asyncHandler(async (req: AuthRequest, res) => {
    const existingReport = requireEntity(
      await prisma.companyReport.findUnique({ where: { id: req.params.id } }),
      "Company report not found"
    );
    const companyReport = await prisma.companyReport.update({
      where: { id: req.params.id },
      data: { status: CompanyReportStatus.MANAGER_CONFIRMED }
    });
    await recordAuditLog({
      req,
      action: "company_report.confirm",
      entityType: "COMPANY_REPORT",
      entityId: companyReport.id,
      before: existingReport,
      after: companyReport
    });
    res.json({ companyReport });
  })
);

router.get(
  "/company-reports/:id/pdf",
  asyncHandler(async (req: AuthRequest, res) => {
    const report = requireEntity(
      await prisma.companyReport.findFirst({
        where: {
          AND: [
            { id: req.params.id },
            buildCompanyReportVisibilityWhere(req.user!) ?? {}
          ]
        }
      }),
      "Company report not found"
    );
    const kpis = Array.isArray(report.kpis)
      ? (report.kpis as Array<{ label: string; value: string }>)
      : [];
    // `?lang=ar` from the client; Accept-Language as the fallback.
    const langHint = String(
      req.query.lang ?? req.headers["accept-language"] ?? ""
    );
    const pdf = await generateReportPdf({
      title: report.title,
      status: report.status,
      updatedAt: report.updatedAt,
      kpis,
      language: langHint.toLowerCase().startsWith("ar") ? "ar" : "en"
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=\"midyaf-report-${report.id}.pdf\"`
    );
    res.send(pdf);
  })
);

async function buildActivityIntakeVisibilityWhere(
  user: AuthUser
): Promise<Prisma.ActivityIntakeWhereInput | undefined> {
  if (logisticsRoles.includes(user.role)) {
    return undefined;
  }

  if (user.role === Role.COMPANY_ORGANIZER) {
    return { submittedBy: { in: await submittedByValuesForUser(user) } };
  }

  return { id: "__no_intake_access__" };
}

async function buildAiPlanVisibilityWhere(
  user: AuthUser
): Promise<Prisma.AiLogisticsPlanWhereInput | undefined> {
  if (logisticsRoles.includes(user.role)) {
    return undefined;
  }

  if (user.role === Role.COMPANY_ORGANIZER) {
    const intakes = await prisma.activityIntake.findMany({
      where: await buildActivityIntakeVisibilityWhere(user),
      select: { id: true }
    });

    return { intakeId: { in: intakes.map((intake) => intake.id) } };
  }

  return { id: "__no_ai_plan_access__" };
}

async function buildGuestJourneyVisibilityWhere(
  user: AuthUser
): Promise<Prisma.GuestJourneyRecordWhereInput | undefined> {
  if (coordinatorRoles.includes(user.role)) {
    return undefined;
  }

  if (user.role === Role.GUEST) {
    const guests = await prisma.guest.findMany({
      where: { userId: user.id },
      select: { id: true }
    });

    return { guestId: { in: guests.map((guest) => guest.id) } };
  }

  if (user.role === Role.DRIVER) {
    const driver = await prisma.driver.findUnique({
      where: { userId: user.id },
      select: { id: true }
    });

    if (!driver) {
      return { id: "__no_driver_journey_access__" };
    }

    const tasks = await prisma.task.findMany({
      where: { driverId: driver.id, guestId: { not: null } },
      select: { guestId: true }
    });

    return {
      guestId: { in: uniqueStrings(tasks.map((task) => task.guestId)) }
    };
  }

  return { id: "__no_journey_access__" };
}

async function buildCoordinatorRequestVisibilityWhere(
  user: AuthUser
): Promise<Prisma.CoordinatorRequestWhereInput | undefined> {
  if (coordinatorRoles.includes(user.role)) {
    return undefined;
  }

  if (user.role === Role.COMPANY_ORGANIZER) {
    return { guestName: await submittedByForUser(user) };
  }

  return { id: "__no_request_access__" };
}

function buildCompanyReportVisibilityWhere(
  user: AuthUser
): Prisma.CompanyReportWhereInput | undefined {
  if (logisticsRoles.includes(user.role)) {
    return undefined;
  }

  if (user.role === Role.COMPANY_ORGANIZER) {
    return {
      status: {
        in: [
          CompanyReportStatus.MANAGER_CONFIRMED,
          CompanyReportStatus.SENT_TO_COMPANY
        ]
      }
    };
  }

  return { id: "__no_report_access__" };
}

async function companyEditableEventId(user: AuthUser, eventId?: string) {
  if (!eventId) {
    return undefined;
  }

  const submittedBy = await submittedByValuesForUser(user);
  const existingCompanyEvent = await prisma.activityIntake.findFirst({
    where: {
      submittedBy: { in: submittedBy },
      eventId
    },
    select: { id: true }
  });

  if (existingCompanyEvent) {
    return eventId;
  }

  const ownEvent = await prisma.event.findFirst({
    where: { id: eventId, organizerId: user.id },
    select: { id: true }
  });

  if (ownEvent) {
    return eventId;
  }

  throw new HttpError(403, "Company user cannot attach this event");
}

async function assertCanMutateIntakeId(user: AuthUser, intakeId: string) {
  if (user.role === Role.SUPER_ADMIN || user.role === Role.LOGISTICS_MANAGER) {
    return;
  }

  const intake = requireEntity(
    await prisma.activityIntake.findUnique({
      where: { id: intakeId },
      select: { eventId: true }
    }),
    "Activity intake not found"
  );

  if (!intake.eventId) {
    throw new HttpError(403, "Cannot mutate an unlinked intake");
  }

  const event = requireEntity(
    await prisma.event.findUnique({
      where: { id: intake.eventId },
      select: { organizerId: true }
    }),
    "Event not found"
  );

  if (user.role === Role.ORGANIZER && event.organizerId === user.id) {
    return;
  }

  throw new HttpError(403, "Cannot mutate this planning record");
}

async function assertCanMutateQuoteId(user: AuthUser, quoteId: string) {
  const quote = requireEntity(
    await prisma.vendorQuote.findUnique({
      where: { id: quoteId },
      select: { intakeId: true, supplierId: true }
    }),
    "Vendor quote not found"
  );

  await assertCanMutateIntakeId(user, quote.intakeId);
  // Contracts are a quote-selection outcome; blocked for supplier terms.
  assertLegacyQuote(quote);
}

/**
 * SUPPLIER-001: supplier-portal quotes are immutable on the legacy quote and
 * contract paths. D-011: the Super Admin approves and contracts them through
 * /supplier-submissions/:id/approve and /supplier-submissions/:id/contract.
 */
function assertLegacyQuote(quote: { supplierId: string | null }) {
  if (quote.supplierId) {
    throw new HttpError(
      409,
      "Supplier submissions are immutable here; the Super Admin approves and contracts them from the supplier submissions review"
    );
  }
}

/**
 * Signing (route already limited to the Super Admin, D-011): a legacy
 * contract keeps the intake check; a supplier contract needs intake access
 * and an approved quote.
 */
async function assertCanSignContractQuote(user: AuthUser, quoteId: string) {
  const quote = requireEntity(
    await prisma.vendorQuote.findUnique({
      where: { id: quoteId },
      select: { intakeId: true, supplierId: true, status: true }
    }),
    "Vendor quote not found"
  );
  if (!quote.supplierId) {
    await assertCanMutateIntakeId(user, quote.intakeId);
    return;
  }
  if (user.role !== Role.SUPER_ADMIN) {
    throw new HttpError(403, "Only the Super Admin signs supplier contracts");
  }
  await assertIntakeOperatorAccess(user, quote.intakeId);
  if (quote.status !== QuoteStatus.APPROVED) {
    throw new HttpError(409, "Only an approved supplier quote can be signed");
  }
}

/** Sealed supplier terms exist, or the intake is the allow-listed demo request. */
async function hasSupplierSealedTerms(intakeId: string) {
  if (isAllowlistedIntake(intakeId)) return true;
  const owned = await prisma.vendorQuote.findFirst({
    where: { intakeId, supplierId: { not: null } },
    select: { id: true }
  });
  return Boolean(owned);
}

/**
 * Logistics access to an existing intake: LM/SA under the documented legacy
 * scope; ORGANIZER only through a linked event it owns.
 */
async function assertIntakeOperatorAccess(
  user: AuthUser,
  intakeId: string,
  db: Pick<Prisma.TransactionClient, "activityIntake" | "event"> = prisma
) {
  if (!logisticsRoles.includes(user.role)) {
    throw new HttpError(403, "Insufficient permissions");
  }

  const intake = await db.activityIntake.findUnique({
    where: { id: intakeId },
    select: { id: true, eventId: true }
  });
  if (!intake) {
    throw new HttpError(404, "Activity intake not found");
  }

  if (isLegacyOperator(user)) {
    return { intakeId: intake.id, eventId: intake.eventId };
  }

  if (user.role === Role.ORGANIZER && intake.eventId) {
    const owned = await db.event.findFirst({
      where: { id: intake.eventId, organizerId: user.id },
      select: { id: true }
    });
    if (owned) return { intakeId: intake.id, eventId: intake.eventId };
  }

  throw new HttpError(403, "Cannot access this planning record");
}

async function assertCanMutateGuestJourneyForGuest(
  user: AuthUser,
  guestId: string
) {
  if (user.role === Role.SUPER_ADMIN || user.role === Role.LOGISTICS_MANAGER) {
    return;
  }

  const guest = requireEntity(
    await prisma.guest.findUnique({
      where: { id: guestId },
      include: { event: { select: { organizerId: true } } }
    }),
    "Guest not found"
  );

  if (user.role === Role.COORDINATOR) {
    return;
  }

  if (user.role === Role.ORGANIZER && guest.event.organizerId === user.id) {
    return;
  }

  throw new HttpError(403, "Cannot mutate this guest journey");
}

function sanitizeGuestJourneyUpdate(
  data: Partial<z.infer<typeof journeySchema>>
) {
  return {
    arrivalStatus: data.arrivalStatus,
    luggageStatus: data.luggageStatus,
    personalTripRequests: data.personalTripRequests,
    notes: data.notes,
    complaints: data.complaints,
    departureConfirmed: data.departureConfirmed,
    leavingWithMidyaf: data.leavingWithMidyaf
  };
}

async function submittedByForUser(user: AuthUser) {
  const profile = await prisma.user.findUnique({
    where: { id: user.id },
    select: { name: true }
  });

  return profile?.name ?? user.email;
}

async function submittedByValuesForUser(user: AuthUser) {
  const profileName = await submittedByForUser(user);

  return uniqueStrings([user.email, profileName]);
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [
    ...new Set(values.filter((value): value is string => Boolean(value)))
  ];
}

const expressArrivalSchema = z.object({
  guestName: z.string().min(2),
  title: z.string().optional(),
  destination: z.string().min(2),
  driverId: z.string().optional(),
  eventId: z.string().min(1),
  isVIP: z.boolean().default(true)
});

router.post(
  "/express-arrival",
  requireRole(coordinatorRoles),
  asyncHandler(async (req: AuthRequest, res) => {
    const body = expressArrivalSchema.parse(req.body);
    const event = requireEntity(
      await prisma.event.findUnique({ where: { id: body.eventId } }),
      "Event not found"
    );

    const randomSuffix = Math.floor(100000 + Math.random() * 900000).toString();
    const placeholderEmail = `walkin.vip.${randomSuffix}@midyaf.local`;
    const placeholderPhone = `+9665${randomSuffix}${Math.floor(100 + Math.random() * 900)}`;

    const user = await prisma.user.create({
      data: {
        name: body.title ? `${body.title} - ${body.guestName}` : body.guestName,
        email: placeholderEmail,
        phone: placeholderPhone,
        role: Role.GUEST,
        language: "ar",
        passwordHash:
          "$2a$12$e0M2/Wq5y5q5y5q5y5q5yO/e0M2/Wq5y5q5y5q5y5q5yO/e0M2"
      }
    });

    const qrCode = `MIDYAF-EXPRESS-${randomSuffix}`;

    const guest = await prisma.guest.create({
      data: {
        userId: user.id,
        eventId: event.id,
        isVIP: body.isVIP,
        tier: "Platinum (Walk-in)",
        rsvpStatus: "ARRIVED",
        qrCode
      },
      include: { user: safeUserRelation }
    });

    let assignedDriverId = body.driverId;
    if (!assignedDriverId) {
      const availableDriver = await prisma.driver.findFirst({
        where: { active: true, status: "AVAILABLE" },
        orderBy: { visitsCompleted: "asc" }
      });
      assignedDriverId = availableDriver?.id;
    }

    let task = null;
    if (assignedDriverId) {
      task = await prisma.task.create({
        data: {
          eventId: event.id,
          guestId: guest.id,
          driverId: assignedDriverId,
          type: "AIRPORT_PICKUP",
          status: "EN_ROUTE",
          pickupLocation:
            "King Khalid International Airport (KKIA) - Royal Terminal",
          dropoffLocation: body.destination,
          scheduledAt: new Date(),
          ownerName: `VIP WALK-IN: ${body.title ? body.title + " " : ""}${body.guestName}`
        },
        include: {
          driver: safeDriverRelation,
          guest: safeGuestRelation
        }
      });

      await prisma.driver.update({
        where: { id: assignedDriverId },
        data: { status: "EN_ROUTE" }
      });
    }

    const rider = await prisma.hospitalityRider.create({
      data: {
        guestId: guest.id,
        dietaryNeeds: [
          "Halal / حلال",
          "Saudi Coffee & Sukkari Dates / قهوة عربية وتمر سكري",
          "Evian Still Water / مياه إيفيان"
        ],
        roomPreferences: [
          "21°C Ambient Temp / حرارة الغرفة 21 مئوية",
          "King Suite / جناح ملكي",
          "Express Check-in / دخول سريع"
        ],
        vehicleRider: [
          "VIP Luxury Sedan / سيارة سيدان فاخرة",
          "Quiet Driver / سائق هادئ",
          "Tinted Windows / زجاج مظلل"
        ],
        securityNotes: [
          "Airport Walk-in VIP Escort / مراقبة أمنية للوصول المباشر"
        ],
        fulfilled: false
      }
    });

    const io = req.app.get("io");
    if (io) {
      io.emit("guest:arrived", {
        guestId: guest.id,
        guestName: user.name,
        eventId: event.id,
        isExpress: true,
        destination: body.destination
      });
      if (task) {
        io.emit("task:status_change", {
          taskId: task.id,
          status: "EN_ROUTE",
          driverId: assignedDriverId
        });
      }
      io.emit("rider:update", { rider });
    }

    res.status(201).json({
      ok: true,
      guest,
      task,
      rider,
      qrCode
    });
  })
);

// ══════════════════════════════════════════════════════════
// LIVE COMMAND CENTER (AI Simulation Engine)
// ══════════════════════════════════════════════════════════

router.get(
  "/live-command-center",
  requireRole(logisticsRoles),
  asyncHandler(async (req: AuthRequest, res) => {
    // 1. Simulate fetching live flight data and traffic conditions
    const delayedFlights = Math.floor(Math.random() * 3) + 2; // Always at least 2 delayed for the alert
    const incomingGuests = delayedFlights * 15;
    const availableVans = Math.floor(Math.random() * 3) + 1; // Few vans available

    // 2. Simulate checking "At Risk" tasks where driver is too far
    const atRiskTasks = await prisma.task.findMany({
      where: {
        type: "AIRPORT_PICKUP",
        status: { in: ["PENDING", "ASSIGNED", "EN_ROUTE"] }
      },
      include: {
        guest: safeGuestRelation,
        driver: safeDriverRelation,
        event: true
      },
      take: 3
    });

    const flaggedTasks = atRiskTasks.map((task) => ({
      ...task,
      riskLevel: "HIGH",
      reason: "Flight landed 30 mins ago, but driver is 15 mins away.",
      recommendedAction: "Re-assign to a closer VIP Captain."
    }));

    // 3. Active Alert System logic
    let activeAlert = null;
    if (incomingGuests > availableVans * 4) {
      activeAlert = {
        id: "alert-" + Date.now(),
        type: "FLEET_SHORTAGE",
        title: "Urgent Fleet Re-routing Required",
        message: `Warning: ${delayedFlights} delayed flights just landed at Terminal 2. ${incomingGuests} guests need pickup soon, but we only have ${availableVans} vans assigned there.`,
        actionPrompt: "Should we divert 5 vans from Terminal 1?",
        actionEndpoint: "/api/operations/divert-fleet"
      };
    }

    res.json({
      ok: true,
      timestamp: new Date().toISOString(),
      metrics: {
        activeFlightsTracked: 14,
        trafficDensity: "HEAVY_AROUND_KAFD",
        driversOnDuty: 42
      },
      flaggedTasks,
      activeAlert
    });
  })
);

router.post(
  "/divert-fleet",
  requireRole(logisticsRoles),
  asyncHandler(async (req: AuthRequest, res) => {
    // Simulate diverting the fleet
    const io = req.app.get("io");
    if (io) {
      io.emit("fleet:diverted", {
        message: "5 vans have been diverted to Terminal 2."
      });
    }

    res.json({
      ok: true,
      message:
        "Fleet successfully diverted. Drivers received their new instructions instantly."
    });
  })
);

export default router;
