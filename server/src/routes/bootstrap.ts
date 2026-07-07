import { Router } from "express";
import { Role } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/http.js";
import { RIYADH_CENTER, RIYADH_ZONES } from "../utils/riyadh.js";
import type { AuthRequest } from "../types/auth.js";

const router = Router();
const fullAccessRoles: Role[] = [
  Role.LOGISTICS_MANAGER,
  Role.ORGANIZER,
  Role.SUPER_ADMIN
];
const notificationManagerRoles: Role[] = [
  Role.LOGISTICS_MANAGER,
  Role.ORGANIZER,
  Role.SUPER_ADMIN,
  Role.COORDINATOR
];

router.get(
  "/health",
  asyncHandler(async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({
        ok: true,
        database: "connected",
        city: "riyadh",
        timestamp: new Date()
      });
    } catch {
      res.status(503).json({
        ok: false,
        database: "unavailable",
        city: "riyadh",
        timestamp: new Date()
      });
    }
  })
);

router.get(
  "/bootstrap",
  requireAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    const user = req.user!;
    const isFullAccess = fullAccessRoles.includes(user.role);
    const isCoordinator = user.role === Role.COORDINATOR;
    const isCompanyOrganizer = user.role === Role.COMPANY_ORGANIZER;
    const isGuest = user.role === Role.GUEST;
    const isDriver = user.role === Role.DRIVER;
    const isSupplier = user.role === Role.SUPPLIER;
    const canViewAllNotifications = notificationManagerRoles.includes(
      user.role
    );
    const authUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { name: true }
    });
    const userName = authUser?.name ?? user.email;
    const guestProfiles = isGuest
      ? await prisma.guest.findMany({
          where: { userId: user.id },
          select: { id: true, eventId: true }
        })
      : [];
    const driverProfile = isDriver
      ? await prisma.driver.findUnique({
          where: { userId: user.id },
          select: { id: true }
        })
      : null;
    const companyActivityIntakes = isCompanyOrganizer
      ? await prisma.activityIntake.findMany({
          where: { submittedBy: user.email },
          orderBy: { submittedAt: "desc" }
        })
      : [];
    const companyFallbackIntakes =
      isCompanyOrganizer && companyActivityIntakes.length === 0
        ? await prisma.activityIntake.findMany({
            where: { submittedBy: userName },
            orderBy: { submittedAt: "desc" }
          })
        : [];
    const scopedCompanyIntakes = companyActivityIntakes.length
      ? companyActivityIntakes
      : companyFallbackIntakes;
    const guestIds = guestProfiles.map((guest) => guest.id);
    const guestEventIds = guestProfiles.map((guest) => guest.eventId);
    const driverId = driverProfile?.id;
    const driverTaskRows = driverId
      ? await prisma.task.findMany({
          where: { driverId },
          select: { guestId: true, eventId: true }
        })
      : [];
    const driverGuestIds = driverTaskRows
      .map((task) => task.guestId)
      .filter((id): id is string => Boolean(id));
    const driverEventIds = [...new Set(driverTaskRows.map((task) => task.eventId))];
    const guestTaskRows = guestIds.length
      ? await prisma.task.findMany({
          where: { guestId: { in: guestIds } },
          select: { driverId: true }
        })
      : [];
    const assignedDriverIds = [
      ...new Set(
        guestTaskRows
          .map((task) => task.driverId)
          .filter((id): id is string => Boolean(id))
      )
    ];
    const companyEventIds = scopedCompanyIntakes
      .map((intake) => intake.eventId)
      .filter((id): id is string => Boolean(id));
    const eventWhere = buildEventWhere({
      role: user.role,
      userId: user.id,
      guestEventIds,
      driverEventIds,
      companyEventIds
    });
    const eventGuestWhere = buildEventGuestWhere({
      role: user.role,
      guestIds,
      driverId
    });
    const eventTaskWhere = buildEventTaskWhere({
      role: user.role,
      guestIds,
      driverId
    });
    const driverWhere = buildDriverWhere({
      role: user.role,
      driverId,
      assignedDriverIds
    });
    const driverTaskWhere = buildDriverTaskWhere({
      role: user.role,
      guestIds,
      driverId
    });
    const supplierWhere = buildSupplierWhere({
      role: user.role,
      userId: user.id
    });
    const activityIntakeWhere = buildActivityIntakeWhere({
      role: user.role,
      userName,
      userEmail: user.email,
      companyEventIds
    });
    const [
      events,
      drivers,
      suppliers,
      city,
      commission,
      users,
      activityIntakes,
      aiPlans,
      vendorQuotes,
      contracts,
      guestJourneys,
      coordinatorRequests,
      companyReports,
      fileAssets,
      notifications,
      auditLogs,
      hospitalityRiders
    ] = await Promise.all([
      prisma.event.findMany({
        where: eventWhere,
        include: {
          city: true,
          guests: { where: eventGuestWhere, include: { user: true, hospitalityRider: true } },
          tasks: {
            where: eventTaskWhere,
            include: {
              driver: { include: { user: true } },
              guest: { include: { user: true } }
            }
          },
          bookings: {
            where: isSupplier
              ? { supplier: { userId: user.id } }
              : isCompanyOrganizer || isGuest || isDriver
                ? { id: "__no_booking_access__" }
                : undefined,
            include: { supplier: true, service: true }
          }
        },
        orderBy: { date: "asc" }
      }),
      prisma.driver.findMany({
        where: driverWhere,
        include: {
          user: true,
          tasks: {
            where: driverTaskWhere,
            orderBy: { scheduledAt: "asc" }
          }
        },
        orderBy: [{ status: "asc" }, { zone: "asc" }]
      }),
      prisma.supplier.findMany({
        where: supplierWhere,
        include: { services: true, city: true },
        orderBy: [
          { sponsoredRank: { sort: "asc", nulls: "last" } },
          { rating: "desc" }
        ]
      }),
      prisma.cityConfig.findUnique({ where: { code: "riyadh" } }),
      isFullAccess
        ? prisma.commissionConfig.findMany()
        : Promise.resolve([]),
      prisma.user.findMany({
        where: buildUserWhere({
          role: user.role,
          userId: user.id,
          guestIds,
          driverId,
          assignedDriverIds,
          driverGuestIds
        }),
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          language: true,
          avatar: true,
          createdAt: true
        },
        orderBy: { createdAt: "asc" }
      }),
      isCompanyOrganizer
        ? Promise.resolve(scopedCompanyIntakes)
        : prisma.activityIntake.findMany({
            where: activityIntakeWhere,
            orderBy: { submittedAt: "desc" }
          }),
      prisma.aiLogisticsPlan.findMany({
        where: await buildAiPlanWhere({
          role: user.role,
          activityIntakeWhere,
          scopedCompanyIntakes
        }),
        orderBy: { createdAt: "desc" }
      }),
      isFullAccess
        ? prisma.vendorQuote.findMany({ orderBy: { score: "desc" } })
        : Promise.resolve([]),
      isFullAccess
        ? prisma.vendorContract.findMany({ orderBy: { updatedAt: "desc" } })
        : Promise.resolve([]),
      prisma.guestJourneyRecord.findMany({
        where: buildGuestJourneyWhere({
          role: user.role,
          guestIds,
          driverGuestIds
        }),
        orderBy: { updatedAt: "desc" }
      }),
      isFullAccess || isCoordinator
        ? prisma.coordinatorRequest.findMany({ orderBy: { deadline: "asc" } })
        : isCompanyOrganizer
          ? prisma.coordinatorRequest.findMany({
              where: { guestName: userName },
              orderBy: { deadline: "asc" }
            })
          : Promise.resolve([]),
      prisma.companyReport.findMany({
        where: isCompanyOrganizer
          ? { status: { in: ["MANAGER_CONFIRMED", "SENT_TO_COMPANY"] } }
          : isFullAccess
            ? undefined
            : { id: "__no_report_access__" },
        orderBy: { updatedAt: "desc" }
      }),
      prisma.fileAsset.findMany({
        where: buildFileAssetWhere({
          role: user.role,
          userId: user.id,
          guestIds,
          guestEventIds,
          driverId,
          driverGuestIds,
          assignedDriverIds,
          driverEventIds,
          companyEventIds
        }),
        orderBy: { createdAt: "desc" }
      }),
      prisma.notification.findMany({
        where: canViewAllNotifications ? undefined : { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 50
      }),
      isFullAccess
        ? prisma.auditLog.findMany({
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
            take: 100
          })
        : Promise.resolve([]),
      prisma.hospitalityRider.findMany({
        where: isGuest
          ? { guestId: { in: guestIds } }
          : isDriver
            ? { guestId: { in: driverGuestIds } }
            : undefined
      })
    ]);

    res.json({
      city: city ?? {
        code: "riyadh",
        nameEn: "Riyadh",
        nameAr: "الرياض",
        centerLat: RIYADH_CENTER.lat,
        centerLng: RIYADH_CENTER.lng,
        defaultZoom: 12,
        timezone: "Asia/Riyadh",
        currency: "SAR",
        vatPercent: 15,
        enabled: true
      },
      zones: RIYADH_ZONES,
      events,
      drivers,
      suppliers,
      commission,
      users,
      activityIntakes,
      aiPlans,
      vendorQuotes,
      contracts,
      guestJourneys,
      coordinatorRequests,
      companyReports,
      fileAssets,
      notifications,
      auditLogs,
      hospitalityRiders
    });
  })
);

function buildEventWhere({
  role,
  userId,
  guestEventIds,
  driverEventIds,
  companyEventIds
}: {
  role: Role;
  userId: string;
  guestEventIds: string[];
  driverEventIds: string[];
  companyEventIds: string[];
}): Prisma.EventWhereInput {
  if (fullAccessRoles.includes(role) || role === Role.COORDINATOR) {
    return {};
  }

  if (role === Role.GUEST) {
    return { id: { in: guestEventIds } };
  }

  if (role === Role.DRIVER) {
    return { id: { in: driverEventIds } };
  }

  if (role === Role.COMPANY_ORGANIZER) {
    return {
      OR: [{ organizerId: userId }, { id: { in: companyEventIds } }]
    };
  }

  if (role === Role.SUPPLIER) {
    return { bookings: { some: { supplier: { userId } } } };
  }

  return { id: "__no_event_access__" };
}

function buildEventGuestWhere({
  role,
  guestIds,
  driverId
}: {
  role: Role;
  guestIds: string[];
  driverId?: string;
}): Prisma.GuestWhereInput | undefined {
  if (fullAccessRoles.includes(role) || role === Role.COORDINATOR) {
    return undefined;
  }

  if (role === Role.GUEST) {
    return { id: { in: guestIds } };
  }

  if (role === Role.DRIVER && driverId) {
    return { tasks: { some: { driverId } } };
  }

  return { id: "__no_guest_access__" };
}

function buildEventTaskWhere({
  role,
  guestIds,
  driverId
}: {
  role: Role;
  guestIds: string[];
  driverId?: string;
}): Prisma.TaskWhereInput | undefined {
  if (fullAccessRoles.includes(role) || role === Role.COORDINATOR) {
    return undefined;
  }

  if (role === Role.GUEST) {
    return { guestId: { in: guestIds } };
  }

  if (role === Role.DRIVER && driverId) {
    return { driverId };
  }

  return { id: "__no_task_access__" };
}

function buildDriverWhere({
  role,
  driverId,
  assignedDriverIds
}: {
  role: Role;
  driverId?: string;
  assignedDriverIds: string[];
}): Prisma.DriverWhereInput {
  if (fullAccessRoles.includes(role) || role === Role.COORDINATOR) {
    return {};
  }

  if (role === Role.DRIVER && driverId) {
    return { id: driverId };
  }

  if (role === Role.GUEST) {
    return { id: { in: assignedDriverIds } };
  }

  return { id: "__no_driver_access__" };
}

function buildDriverTaskWhere({
  role,
  guestIds,
  driverId
}: {
  role: Role;
  guestIds: string[];
  driverId?: string;
}): Prisma.TaskWhereInput | undefined {
  if (fullAccessRoles.includes(role) || role === Role.COORDINATOR) {
    return { status: { notIn: ["COMPLETED", "CANCELLED"] } };
  }

  if (role === Role.DRIVER && driverId) {
    return { driverId, status: { notIn: ["COMPLETED", "CANCELLED"] } };
  }

  if (role === Role.GUEST) {
    return { guestId: { in: guestIds } };
  }

  return { id: "__no_task_access__" };
}

function buildSupplierWhere({
  role,
  userId
}: {
  role: Role;
  userId: string;
}): Prisma.SupplierWhereInput {
  if (fullAccessRoles.includes(role)) {
    return {};
  }

  if (role === Role.SUPPLIER) {
    return { userId };
  }

  return { id: "__no_supplier_access__" };
}

function buildActivityIntakeWhere({
  role,
  userName,
  userEmail,
  companyEventIds
}: {
  role: Role;
  userName: string;
  userEmail: string;
  companyEventIds: string[];
}): Prisma.ActivityIntakeWhereInput | undefined {
  if (fullAccessRoles.includes(role)) {
    return undefined;
  }

  if (role === Role.COMPANY_ORGANIZER) {
    return {
      OR: [
        { submittedBy: userName },
        { submittedBy: userEmail },
        { eventId: { in: companyEventIds } }
      ]
    };
  }

  return { id: "__no_intake_access__" };
}

async function buildAiPlanWhere({
  role,
  activityIntakeWhere,
  scopedCompanyIntakes
}: {
  role: Role;
  activityIntakeWhere?: Prisma.ActivityIntakeWhereInput;
  scopedCompanyIntakes: Array<{ id: string }>;
}): Promise<Prisma.AiLogisticsPlanWhereInput | undefined> {
  if (fullAccessRoles.includes(role)) {
    return undefined;
  }

  if (role === Role.COMPANY_ORGANIZER) {
    return { intakeId: { in: scopedCompanyIntakes.map((intake) => intake.id) } };
  }

  const intakes = await prisma.activityIntake.findMany({
    where: activityIntakeWhere,
    select: { id: true }
  });

  return { intakeId: { in: intakes.map((intake) => intake.id) } };
}

function buildGuestJourneyWhere({
  role,
  guestIds,
  driverGuestIds
}: {
  role: Role;
  guestIds: string[];
  driverGuestIds: string[];
}): Prisma.GuestJourneyRecordWhereInput | undefined {
  if (fullAccessRoles.includes(role) || role === Role.COORDINATOR) {
    return undefined;
  }

  if (role === Role.GUEST) {
    return { guestId: { in: guestIds } };
  }

  if (role === Role.DRIVER) {
    return { guestId: { in: driverGuestIds } };
  }

  return { id: "__no_journey_access__" };
}

function buildUserWhere({
  role,
  userId,
  guestIds,
  driverId,
  assignedDriverIds,
  driverGuestIds
}: {
  role: Role;
  userId: string;
  guestIds: string[];
  driverId?: string;
  assignedDriverIds: string[];
  driverGuestIds: string[];
}): Prisma.UserWhereInput {
  if (fullAccessRoles.includes(role)) {
    return {};
  }

  if (role === Role.COORDINATOR) {
    return {
      role: {
        in: [
          Role.GUEST,
          Role.DRIVER,
          Role.COORDINATOR,
          Role.LOGISTICS_MANAGER
        ]
      }
    };
  }

  if (role === Role.GUEST) {
    return {
      OR: [
        { id: userId },
        { driverProfile: { id: { in: assignedDriverIds } } }
      ]
    };
  }

  if (role === Role.DRIVER) {
    return {
      OR: [
        { id: userId },
        { guestProfiles: { some: { id: { in: driverGuestIds } } } }
      ]
    };
  }

  if (role === Role.COMPANY_ORGANIZER || role === Role.SUPPLIER) {
    return { id: userId };
  }

  return { id: "__no_user_access__" };
}

function buildFileAssetWhere({
  role,
  userId,
  guestIds,
  guestEventIds,
  driverId,
  driverGuestIds,
  assignedDriverIds,
  driverEventIds,
  companyEventIds
}: {
  role: Role;
  userId: string;
  guestIds: string[];
  guestEventIds: string[];
  driverId?: string;
  driverGuestIds: string[];
  assignedDriverIds: string[];
  driverEventIds: string[];
  companyEventIds: string[];
}): Prisma.FileAssetWhereInput | undefined {
  if (fullAccessRoles.includes(role) || role === Role.COORDINATOR) {
    return undefined;
  }

  if (role === Role.GUEST) {
    return {
      OR: [
        { userId },
        { guestId: { in: guestIds } },
        { driverId: { in: assignedDriverIds }, type: "DRIVER_PHOTO" },
        { eventId: { in: guestEventIds }, type: "PROMO_VIDEO" }
      ]
    };
  }

  if (role === Role.DRIVER && driverId) {
    return {
      OR: [
        { userId },
        { driverId },
        { guestId: { in: driverGuestIds }, type: "GUEST_PHOTO" },
        { eventId: { in: driverEventIds }, type: "PROMO_VIDEO" }
      ]
    };
  }

  if (role === Role.COMPANY_ORGANIZER) {
    return { eventId: { in: companyEventIds }, type: "REPORT_PDF" };
  }

  if (role === Role.SUPPLIER) {
    return { userId };
  }

  return { id: "__no_file_access__" };
}

export default router;
