import { randomUUID } from "node:crypto";
import { Router } from "express";
import bcrypt from "bcryptjs";
import {
  CaptainType,
  DriverStatus,
  EventStatus,
  Role,
  TaskStatus,
  TaskType,
  type Driver,
  type Event,
  type Guest,
  type Prisma,
  type User
} from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import type { AuthRequest } from "../types/auth.js";
import { HttpError, asyncHandler, requireEntity } from "../utils/http.js";
import { RIYADH_CENTER, sortDriversByDistance } from "../utils/riyadh.js";
import { recordAuditLog } from "../services/auditLog.js";

const router = Router();
const fullAccessRoles: Role[] = [
  Role.LOGISTICS_MANAGER,
  Role.ORGANIZER,
  Role.SUPER_ADMIN
];
const operationalAccessRoles: Role[] = [...fullAccessRoles, Role.COORDINATOR];

type AuthUser = NonNullable<AuthRequest["user"]>;

const phoneSchema = z.string().regex(/^\+9665\d{8}$/);
const guestInviteSchema = z.object({
  name: z.string().min(2),
  email: z.string().email().toLowerCase(),
  phone: phoneSchema,
  language: z.enum(["ar", "en"]).default("ar"),
  isVIP: z.boolean().default(false),
  tier: z.string().default("standard")
});
const bulkGuestSchema = guestInviteSchema.extend({
  arrivalGate: z.string().optional(),
  arrivalFlight: z.string().optional(),
  pickupLocation: z.string().optional(),
  dropoffLocation: z.string().optional(),
  pickupLat: z.number().optional(),
  pickupLng: z.number().optional(),
  dropoffLat: z.number().optional(),
  dropoffLng: z.number().optional(),
  scheduledAt: z.coerce.date().optional(),
  departureFlight: z.string().optional(),
  departurePickupTime: z.coerce.date().optional()
});

type GuestInviteInput = z.infer<typeof guestInviteSchema>;
type BulkGuestInput = z.infer<typeof bulkGuestSchema>;
type GuestWithUser = Guest & { user: User };
type ImportedGuest = {
  guest: GuestWithUser;
  input: BulkGuestInput;
};

router.use(requireAuth);

router.get(
  "/",
  asyncHandler(async (req: AuthRequest, res) => {
    const where = await buildEventVisibilityWhere(req.user!);

    const events = await prisma.event.findMany({
      where,
      include: {
        city: true,
        organizer: {
          select: { id: true, name: true, email: true, phone: true }
        },
        _count: { select: { guests: true, tasks: true, bookings: true } }
      },
      orderBy: { date: "asc" }
    });

    res.json({ events });
  })
);

router.post(
  "/",
  requireRole([Role.ORGANIZER, Role.LOGISTICS_MANAGER, Role.SUPER_ADMIN]),
  asyncHandler(async (req: AuthRequest, res) => {
    const body = z
      .object({
        name: z.string().min(2),
        date: z.coerce.date(),
        venue: z.string().min(2),
        venueLat: z.number().optional(),
        venueLng: z.number().optional(),
        brief: z.string().optional(),
        status: z.nativeEnum(EventStatus).default(EventStatus.DRAFT),
        cityCode: z.string().default("riyadh")
      })
      .parse(req.body);

    const city = await prisma.cityConfig.findUnique({
      where: { code: body.cityCode }
    });

    const event = await prisma.event.create({
      data: {
        name: body.name,
        date: body.date,
        venue: body.venue,
        venueLat: body.venueLat,
        venueLng: body.venueLng,
        brief: body.brief,
        status: body.status,
        cityId: city?.id,
        organizerId: req.user!.id,
        timezone: city?.timezone ?? "Asia/Riyadh",
        currency: city?.currency ?? "SAR"
      }
    });

    await recordAuditLog({
      req,
      action: "event.create",
      entityType: "EVENT",
      entityId: event.id,
      eventId: event.id,
      after: event
    });

    res.status(201).json({ event });
  })
);

router.get(
  "/:id",
  asyncHandler(async (req: AuthRequest, res) => {
    const visibilityWhere = await buildEventVisibilityWhere(req.user!);
    const event = await prisma.event.findFirst({
      where: {
        AND: [{ id: req.params.id }, visibilityWhere ?? {}]
      },
      include: {
        city: true,
        organizer: {
          select: { id: true, name: true, email: true, phone: true }
        },
        guests: {
          where: buildGuestVisibilityWhere(req.user!),
          include: { user: true }
        },
        tasks: {
          where: buildTaskVisibilityWhere(req.user!),
          include: {
            driver: { include: { user: true } },
            guest: { include: { user: true } }
          },
          orderBy: { scheduledAt: "asc" }
        },
        bookings: {
          where: buildBookingVisibilityWhere(req.user!),
          include: {
            supplier: true,
            service: true
          },
          orderBy: { createdAt: "desc" }
        }
      }
    });

    res.json({ event: requireEntity(event, "Event not found") });
  })
);

router.put(
  "/:id",
  requireRole([Role.ORGANIZER, Role.LOGISTICS_MANAGER, Role.SUPER_ADMIN]),
  asyncHandler(async (req: AuthRequest, res) => {
    const body = z
      .object({
        name: z.string().min(2).optional(),
        date: z.coerce.date().optional(),
        venue: z.string().min(2).optional(),
        venueLat: z.number().nullable().optional(),
        venueLng: z.number().nullable().optional(),
        brief: z.string().nullable().optional(),
        status: z.nativeEnum(EventStatus).optional()
      })
      .parse(req.body);
    const existingEvent = requireEntity(
      await prisma.event.findUnique({ where: { id: req.params.id } }),
      "Event not found"
    );

    assertCanMutateEvent(req.user!, existingEvent);

    const event = await prisma.event.update({
      where: { id: existingEvent.id },
      data: body
    });

    await recordAuditLog({
      req,
      action: "event.update",
      entityType: "EVENT",
      entityId: event.id,
      eventId: event.id,
      before: existingEvent,
      after: event
    });

    res.json({ event });
  })
);

router.delete(
  "/:id",
  requireRole([Role.SUPER_ADMIN]),
  asyncHandler(async (req: AuthRequest, res) => {
    const existingEvent = requireEntity(
      await prisma.event.findUnique({ where: { id: req.params.id } }),
      "Event not found"
    );

    await prisma.event.delete({ where: { id: existingEvent.id } });
    await recordAuditLog({
      req,
      action: "event.delete",
      entityType: "EVENT",
      entityId: existingEvent.id,
      eventId: existingEvent.id,
      before: existingEvent
    });
    res.status(204).send();
  })
);

router.get(
  "/:id/guests",
  asyncHandler(async (req: AuthRequest, res) => {
    const guestVisibilityWhere = buildGuestVisibilityWhere(req.user!);
    const guests = await prisma.guest.findMany({
      where: {
        AND: [{ eventId: req.params.id }, guestVisibilityWhere ?? {}]
      },
      include: { user: true },
      orderBy: [{ isVIP: "desc" }, { createdAt: "asc" }]
    });

    res.json({ guests });
  })
);

router.post(
  "/:id/guests/invite",
  requireRole([Role.ORGANIZER, Role.LOGISTICS_MANAGER, Role.SUPER_ADMIN]),
  asyncHandler(async (req: AuthRequest, res) => {
    const body = z
      .object({
        guests: z
          .array(guestInviteSchema)
          .min(1)
      })
      .parse(req.body);

    const event = await prisma.event.findUnique({
      where: { id: req.params.id }
    });

    if (!event) {
      throw new HttpError(404, "Event not found");
    }

    assertCanMutateEvent(req.user!, event);

    const invited = await Promise.all(
      body.guests.map((guestInput) => upsertGuestWithJourney(event, guestInput))
    );

    await recordAuditLog({
      req,
      action: "guest.invite",
      entityType: "EVENT",
      entityId: event.id,
      eventId: event.id,
      after: {
        guestIds: invited.map((guest) => guest.id),
        guestCount: invited.length
      }
    });

    res.status(201).json({ guests: invited });
  })
);

router.post(
  "/:id/guests/import",
  requireRole([Role.ORGANIZER, Role.LOGISTICS_MANAGER, Role.SUPER_ADMIN]),
  asyncHandler(async (req: AuthRequest, res) => {
    const body = z
      .object({
        guests: z.array(bulkGuestSchema).min(1).max(500),
        generateTasks: z.boolean().default(true),
        normalGuestsPerShuttle: z.number().int().min(3).max(4).default(4)
      })
      .parse(req.body);

    const event = await prisma.event.findUnique({
      where: { id: req.params.id }
    });

    if (!event) {
      throw new HttpError(404, "Event not found");
    }

    assertCanMutateEvent(req.user!, event);

    const imported: ImportedGuest[] = [];

    for (const guestInput of body.guests) {
      const guest = await upsertGuestWithJourney(event, guestInput);
      imported.push({ guest, input: guestInput });
    }

    const tasks = body.generateTasks
      ? await generateArrivalTasks({
          event,
          imported,
          guestsPerShuttle: body.normalGuestsPerShuttle
        })
      : [];
    const summary = {
      guestCount: imported.length,
      vipCount: imported.filter((item) => item.guest.isVIP).length,
      normalCount: imported.filter((item) => !item.guest.isVIP).length,
      taskCount: tasks.length,
      shuttleGroupCount: tasks.filter((task) =>
        task.ownerName?.startsWith("Shuttle group")
      ).length
    };

    await recordAuditLog({
      req,
      action: "guest.bulk_import",
      entityType: "EVENT",
      entityId: event.id,
      eventId: event.id,
      after: {
        guestIds: imported.map((item) => item.guest.id),
        taskIds: tasks.map((task) => task.id),
        summary
      }
    });

    res.status(201).json({
      guests: imported.map((item) => item.guest),
      tasks,
      summary
    });
  })
);

export default router;

function assertCanMutateEvent(
  user: AuthUser,
  event: Pick<Event, "organizerId">
) {
  if (user.role === Role.SUPER_ADMIN || user.role === Role.LOGISTICS_MANAGER) {
    return;
  }

  if (user.role === Role.ORGANIZER && event.organizerId === user.id) {
    return;
  }

  throw new HttpError(403, "Cannot mutate this event");
}

async function buildEventVisibilityWhere(
  user: AuthUser
): Promise<Prisma.EventWhereInput | undefined> {
  if (operationalAccessRoles.includes(user.role)) {
    return undefined;
  }

  if (user.role === Role.GUEST) {
    return { guests: { some: { userId: user.id } } };
  }

  if (user.role === Role.DRIVER) {
    return { tasks: { some: { driver: { userId: user.id } } } };
  }

  if (user.role === Role.SUPPLIER) {
    return { bookings: { some: { supplier: { userId: user.id } } } };
  }

  if (user.role === Role.COMPANY_ORGANIZER) {
    const userProfile = await prisma.user.findUnique({
      where: { id: user.id },
      select: { name: true }
    });
    const submittedBy = uniqueStrings([user.email, userProfile?.name]);
    const intakes = submittedBy.length
      ? await prisma.activityIntake.findMany({
          where: {
            submittedBy: { in: submittedBy },
            eventId: { not: null }
          },
          select: { eventId: true }
        })
      : [];
    const eventIds = uniqueStrings(intakes.map((intake) => intake.eventId));

    return {
      OR: [{ organizerId: user.id }, { id: { in: eventIds } }]
    };
  }

  return { id: "__no_event_access__" };
}

function buildGuestVisibilityWhere(
  user: AuthUser
): Prisma.GuestWhereInput | undefined {
  if (operationalAccessRoles.includes(user.role)) {
    return undefined;
  }

  if (user.role === Role.GUEST) {
    return { userId: user.id };
  }

  if (user.role === Role.DRIVER) {
    return { tasks: { some: { driver: { userId: user.id } } } };
  }

  return { id: "__no_guest_access__" };
}

function buildTaskVisibilityWhere(
  user: AuthUser
): Prisma.TaskWhereInput | undefined {
  if (operationalAccessRoles.includes(user.role)) {
    return undefined;
  }

  if (user.role === Role.GUEST) {
    return { guest: { userId: user.id } };
  }

  if (user.role === Role.DRIVER) {
    return { driver: { userId: user.id } };
  }

  return { id: "__no_task_access__" };
}

function buildBookingVisibilityWhere(
  user: AuthUser
): Prisma.BookingWhereInput | undefined {
  if (fullAccessRoles.includes(user.role)) {
    return undefined;
  }

  if (user.role === Role.SUPPLIER) {
    return { supplier: { userId: user.id } };
  }

  return { id: "__no_booking_access__" };
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

async function upsertGuestWithJourney(
  event: Pick<Event, "id" | "name" | "date" | "venue">,
  guestInput: GuestInviteInput | BulkGuestInput
) {
  const user =
    (await prisma.user.findFirst({
      where: {
        OR: [{ email: guestInput.email }, { phone: guestInput.phone }]
      }
    })) ??
    (await prisma.user.create({
      data: {
        name: guestInput.name,
        email: guestInput.email,
        phone: guestInput.phone,
        language: guestInput.language,
        role: Role.GUEST,
        passwordHash: await bcrypt.hash("Midyaf@2026", 12)
      }
    }));

  const guest = await prisma.guest.upsert({
    where: { userId_eventId: { userId: user.id, eventId: event.id } },
    update: {
      isVIP: guestInput.isVIP,
      tier: guestInput.tier,
      rsvpStatus: "INVITED"
    },
    create: {
      userId: user.id,
      eventId: event.id,
      isVIP: guestInput.isVIP,
      tier: guestInput.tier,
      qrCode: `MIDYAF-${event.id.slice(-5).toUpperCase()}-${randomUUID()
        .slice(0, 8)
        .toUpperCase()}`
    },
    include: { user: true }
  });

  await prisma.notification.create({
    data: {
      userId: user.id,
      title: "Midyaf invitation",
      body: `You are invited to ${event.name}. Your QR invite is ${guest.qrCode}. Temporary password: Midyaf@2026.`
    }
  });

  await upsertGuestJourney(event, guest, guestInput);

  return guest;
}

async function upsertGuestJourney(
  event: Pick<Event, "date" | "venue">,
  guest: GuestWithUser,
  guestInput: GuestInviteInput | BulkGuestInput
) {
  const bulkInput = guestInput as BulkGuestInput;
  const journey = await prisma.guestJourneyRecord.findFirst({
    where: { guestId: guest.id }
  });
  const carDetails = guest.isVIP
    ? "VIP dedicated car pending assignment"
    : "Shuttle group pending assignment";
  const journeyData = {
    arrivalGate: bulkInput.arrivalGate ?? journey?.arrivalGate ?? "Pending",
    driverName: journey?.driverName ?? "Pending assignment",
    driverPhone: journey?.driverPhone ?? "+966500000000",
    carDetails: journey?.carDetails ?? carDetails,
    etaMinutes: journey?.etaMinutes ?? 0,
    departureFlight:
      bulkInput.departureFlight ?? journey?.departureFlight ?? "Pending",
    departurePickupTime:
      bulkInput.departurePickupTime ?? journey?.departurePickupTime ?? event.date
  };

  if (journey) {
    await prisma.guestJourneyRecord.update({
      where: { id: journey.id },
      data: journeyData
    });
    return;
  }

  await prisma.guestJourneyRecord.create({
    data: {
      guestId: guest.id,
      promoVideos: [],
      ...journeyData,
      personalTripRequests: [],
      notes: [],
      complaints: [],
      leavingWithMidyaf: true
    }
  });
}

async function generateArrivalTasks({
  event,
  imported,
  guestsPerShuttle
}: {
  event: Event;
  imported: ImportedGuest[];
  guestsPerShuttle: number;
}) {
  const tasks = [];
  let driverPool = await prisma.driver.findMany({
    where: {
      active: true,
      status: DriverStatus.AVAILABLE
    },
    include: { user: true }
  });
  const vipGuests = imported.filter((item) => item.guest.isVIP);
  const normalGroups = groupNormalGuests(
    imported.filter((item) => !item.guest.isVIP),
    guestsPerShuttle
  );

  for (const item of vipGuests) {
    const route = routeFromImport(event, item.input);
    const driver = assignDriver(
      driverPool,
      route.pickup,
      CaptainType.VIP_CAPTAIN
    );

    if (driver) {
      driverPool = driverPool.filter((candidate) => candidate.id !== driver.id);
    }

    const task = await createArrivalTask({
      event,
      guestId: item.guest.id,
      driverId: driver?.id,
      route,
      ownerName: `VIP dedicated car - ${item.guest.user.name}`
    });
    tasks.push(task);
  }

  for (const [index, group] of normalGroups.entries()) {
    const representative = group[0];
    const route = routeFromImport(event, representative.input);
    const driver = assignDriver(driverPool, route.pickup, CaptainType.SHUTTLE);

    if (driver) {
      driverPool = driverPool.filter((candidate) => candidate.id !== driver.id);
    }

    const task = await createArrivalTask({
      event,
      guestId: representative.guest.id,
      driverId: driver?.id,
      route,
      ownerName: `Shuttle group ${index + 1} (${group.length} guests): ${group
        .map((item) => item.guest.user.name)
        .join(", ")}`
    });
    tasks.push(task);
  }

  return tasks;
}

function assignDriver<T extends Driver>(
  driverPool: T[],
  pickup: { lat: number; lng: number },
  preferredCaptainType: CaptainType
) {
  const preferred = driverPool.filter(
    (driver) => driver.captainType === preferredCaptainType
  );
  const candidates = preferred.length ? preferred : driverPool;

  return sortDriversByDistance(candidates, pickup)[0]?.driver;
}

async function createArrivalTask({
  event,
  guestId,
  driverId,
  route,
  ownerName
}: {
  event: Event;
  guestId: string;
  driverId?: string;
  route: ReturnType<typeof routeFromImport>;
  ownerName: string;
}) {
  const task = await prisma.task.create({
    data: {
      eventId: event.id,
      driverId,
      guestId,
      type: TaskType.AIRPORT_PICKUP,
      status: driverId ? TaskStatus.ASSIGNED : TaskStatus.PENDING,
      pickupLocation: route.pickupLocation,
      dropoffLocation: route.dropoffLocation,
      pickupLat: route.pickup.lat,
      pickupLng: route.pickup.lng,
      dropoffLat: route.dropoff.lat,
      dropoffLng: route.dropoff.lng,
      scheduledAt: route.scheduledAt,
      deadlineAt: addMinutes(route.scheduledAt, 45),
      ownerName
    },
    include: {
      event: true,
      driver: { include: { user: true } },
      guest: { include: { user: true } }
    }
  });

  if (driverId) {
    await prisma.driver.update({
      where: { id: driverId },
      data: { status: DriverStatus.ASSIGNED }
    });
  }

  return task;
}

function routeFromImport(event: Event, input: BulkGuestInput) {
  const pickup = {
    lat: input.pickupLat ?? 24.9576,
    lng: input.pickupLng ?? 46.6988
  };
  const dropoff = {
    lat: input.dropoffLat ?? event.venueLat ?? RIYADH_CENTER.lat,
    lng: input.dropoffLng ?? event.venueLng ?? RIYADH_CENTER.lng
  };

  return {
    pickup,
    dropoff,
    pickupLocation: input.pickupLocation ?? "King Khalid International Airport",
    dropoffLocation: input.dropoffLocation ?? event.venue,
    scheduledAt: input.scheduledAt ?? event.date
  };
}

function groupNormalGuests<T>(guests: T[], maxPerGroup: number) {
  if (!guests.length) {
    return [];
  }

  const groupCount = Math.ceil(guests.length / maxPerGroup);
  const baseSize = Math.floor(guests.length / groupCount);
  let largerGroups = guests.length % groupCount;
  const groups: T[][] = [];
  let index = 0;

  for (let groupIndex = 0; groupIndex < groupCount; groupIndex += 1) {
    const size = baseSize + (largerGroups > 0 ? 1 : 0);
    largerGroups -= 1;
    groups.push(guests.slice(index, index + size));
    index += size;
  }

  return groups;
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}
