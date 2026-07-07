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

const router = Router();
const logisticsRoles: Role[] = [
  Role.LOGISTICS_MANAGER,
  Role.ORGANIZER,
  Role.SUPER_ADMIN
];
const reportMutationRoles: Role[] = [Role.LOGISTICS_MANAGER, Role.SUPER_ADMIN];
const companyRoles: Role[] = [...logisticsRoles, Role.COMPANY_ORGANIZER];
const coordinatorRoles: Role[] = [...logisticsRoles, Role.COORDINATOR];
const journeyUpdateRoles: Role[] = [...coordinatorRoles, Role.GUEST];
const requestCreateRoles: Role[] = [
  ...coordinatorRoles,
  Role.COMPANY_ORGANIZER
];

router.use(requireAuth);

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
      body.normalVisitorCount ?? Math.max(0, body.visitorCount - body.vipVisitorCount);
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
    const vendorQuotes = await prisma.vendorQuote.findMany({
      where: logisticsRoles.includes(req.user!.role)
        ? undefined
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
    const totalPrice = body.totalPrice ?? roundCurrency(body.quantity * body.unitPrice);
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

    await assertCanMutateIntakeId(req.user!, body.intakeId ?? current.intakeId);

    if (
      typeof body.quantity === "number" ||
      typeof body.unitPrice === "number" ||
      typeof body.totalPrice === "number" ||
      typeof body.commissionPercent === "number"
    ) {
      const quantity = body.quantity ?? current.quantity;
      const unitPrice = body.unitPrice ?? Number(current.unitPrice);
      const totalPrice =
        body.totalPrice ?? roundCurrency(quantity * unitPrice);
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

router.put(
  "/vendor-quotes/:id/approve",
  requireRole(logisticsRoles),
  asyncHandler(async (req: AuthRequest, res) => {
    const existingQuote = requireEntity(
      await prisma.vendorQuote.findUnique({ where: { id: req.params.id } }),
      "Vendor quote not found"
    );
    await assertCanMutateIntakeId(req.user!, existingQuote.intakeId);

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
    const contracts = await prisma.vendorContract.findMany({
      where: logisticsRoles.includes(req.user!.role)
        ? undefined
        : { id: "__no_contract_access__" },
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
    await assertCanMutateQuoteId(req.user!, body.quoteId ?? existingContract.quoteId);

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

router.put(
  "/contracts/:id/approve",
  requireRole(logisticsRoles),
  asyncHandler(async (req: AuthRequest, res) => {
    const existingContract = requireEntity(
      await prisma.vendorContract.findUnique({ where: { id: req.params.id } }),
      "Contract not found"
    );
    await assertCanMutateQuoteId(req.user!, existingContract.quoteId);

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
      await prisma.coordinatorRequest.findUnique({ where: { id: req.params.id } }),
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
  status: z
    .nativeEnum(CompanyReportStatus)
    .default(CompanyReportStatus.DRAFT),
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
    const pdf = await generateReportPdf({
      title: report.title,
      status: report.status,
      updatedAt: report.updatedAt,
      kpis
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

    return { guestId: { in: uniqueStrings(tasks.map((task) => task.guestId)) } };
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
      select: { intakeId: true }
    }),
    "Vendor quote not found"
  );

  await assertCanMutateIntakeId(user, quote.intakeId);
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
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
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
        passwordHash: "$2a$12$e0M2/Wq5y5q5y5q5y5q5yO/e0M2/Wq5y5q5y5q5y5q5yO/e0M2"
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
      include: { user: true }
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
          pickupLocation: "King Khalid International Airport (KKIA) - Royal Terminal",
          dropoffLocation: body.destination,
          scheduledAt: new Date(),
          ownerName: `⚡ VIP WALK-IN: ${body.title ? body.title + ' ' : ''}${body.guestName}`
        },
        include: { driver: { include: { user: true } }, guest: { include: { user: true } } }
      });

      await prisma.driver.update({
        where: { id: assignedDriverId },
        data: { status: "EN_ROUTE" }
      });
    }

    const rider = await prisma.hospitalityRider.create({
      data: {
        guestId: guest.id,
        dietaryNeeds: ["Halal / حلال", "Saudi Coffee & Sukkari Dates / قهوة عربية وتمر سكري", "Evian Still Water / مياه إيفيان"],
        roomPreferences: ["21°C Ambient Temp / حرارة الغرفة 21 مئوية", "King Suite / جناح ملكي", "Express Check-in / دخول سريع"],
        vehicleRider: ["VIP Luxury Sedan / سيارة سيدان فاخرة", "Quiet Driver / سائق هادئ", "Tinted Windows / زجاج مظلل"],
        securityNotes: ["Airport Walk-in VIP Escort / مراقبة أمنية للوصول المباشر"],
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

export default router;
