import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Router } from "express";
import multer from "multer";
import { FileAssetType, Role } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { HttpError, asyncHandler, requireEntity } from "../utils/http.js";
import { sendNotification } from "../services/notificationDelivery.js";
import type { AuthRequest } from "../types/auth.js";
import { recordAuditLog } from "../services/auditLog.js";

const uploadRoot = path.resolve(process.cwd(), "uploads");
fs.mkdirSync(uploadRoot, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    callback(null, uploadRoot);
  },
  filename: (_req, file, callback) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    callback(null, `${Date.now()}-${randomUUID()}-${safeName}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024
  }
});

const router = Router();
const fullAccessRoles: Role[] = [
  Role.LOGISTICS_MANAGER,
  Role.ORGANIZER,
  Role.SUPER_ADMIN
];
const operationalAccessRoles: Role[] = [...fullAccessRoles, Role.COORDINATOR];

type AuthUser = NonNullable<AuthRequest["user"]>;

router.use(requireAuth);

router.get(
  "/file-assets",
  asyncHandler(async (req: AuthRequest, res) => {
    const query = z
      .object({
        type: z.nativeEnum(FileAssetType).optional(),
        userId: z.string().optional(),
        guestId: z.string().optional(),
        driverId: z.string().optional(),
        eventId: z.string().optional()
      })
      .parse(req.query);
    const visibilityWhere = await buildFileAssetVisibilityWhere(req.user!);

    const fileAssets = await prisma.fileAsset.findMany({
      where: {
        AND: [query, visibilityWhere ?? {}]
      },
      orderBy: { createdAt: "desc" }
    });

    res.json({ fileAssets });
  })
);

router.post(
  "/uploads",
  requireRole([
    Role.LOGISTICS_MANAGER,
    Role.ORGANIZER,
    Role.SUPER_ADMIN,
    Role.COORDINATOR
  ]),
  upload.single("file"),
  asyncHandler(async (req: AuthRequest, res) => {
    if (!req.file) {
      throw new HttpError(400, "Missing upload file");
    }

    const body = z
      .object({
        type: z.nativeEnum(FileAssetType),
        userId: z.string().optional(),
        guestId: z.string().optional(),
        driverId: z.string().optional(),
        eventId: z.string().optional()
      })
      .parse(req.body);

    await validateUploadTarget(req.user!, body);

    const fileAsset = await prisma.fileAsset.create({
      data: {
        ...body,
        key: req.file.filename,
        url: `/uploads/${req.file.filename}`,
        mimeType: req.file.mimetype,
        size: req.file.size
      }
    });
    const deliveries = await queueUploadNotifications(body, fileAsset.id);

    await recordAuditLog({
      req,
      action: "file_asset.upload",
      entityType: "FILE_ASSET",
      entityId: fileAsset.id,
      eventId: fileAsset.eventId,
      after: fileAsset,
      metadata: {
        deliveryCount: deliveries.length,
        type: fileAsset.type,
        guestId: fileAsset.guestId,
        driverId: fileAsset.driverId,
        userId: fileAsset.userId
      }
    });

    res.status(201).json({ fileAsset, deliveries });
  })
);

export default router;

async function validateUploadTarget(
  user: AuthUser,
  body: UploadNotificationBody
) {
  if (
    body.type === FileAssetType.REPORT_PDF &&
    user.role !== Role.LOGISTICS_MANAGER &&
    user.role !== Role.SUPER_ADMIN
  ) {
    throw new HttpError(403, "Only logistics managers can upload report PDFs");
  }

  if (
    body.type === FileAssetType.VISA ||
    body.type === FileAssetType.TICKET ||
    body.type === FileAssetType.GUEST_PHOTO
  ) {
    if (!body.guestId) {
      throw new HttpError(400, "Guest uploads require guestId");
    }

    const guest = requireEntity(
      await prisma.guest.findUnique({
        where: { id: body.guestId },
        select: { userId: true, eventId: true }
      }),
      "Guest not found"
    );

    if (body.userId && body.userId !== guest.userId) {
      throw new HttpError(409, "Upload user does not match guest");
    }

    if (body.eventId && body.eventId !== guest.eventId) {
      throw new HttpError(409, "Upload event does not match guest");
    }

    return;
  }

  if (body.type === FileAssetType.DRIVER_PHOTO) {
    if (!body.driverId) {
      throw new HttpError(400, "Driver photo uploads require driverId");
    }

    const driver = requireEntity(
      await prisma.driver.findUnique({
        where: { id: body.driverId },
        select: { userId: true }
      }),
      "Driver not found"
    );

    if (body.userId && body.userId !== driver.userId) {
      throw new HttpError(409, "Upload user does not match driver");
    }

    return;
  }

  if (
    (body.type === FileAssetType.PROMO_VIDEO ||
      body.type === FileAssetType.REPORT_PDF) &&
    !body.eventId
  ) {
    throw new HttpError(400, "Event upload requires eventId");
  }
}

async function buildFileAssetVisibilityWhere(
  user: AuthUser
): Promise<Prisma.FileAssetWhereInput | undefined> {
  if (operationalAccessRoles.includes(user.role)) {
    return undefined;
  }

  if (user.role === Role.GUEST) {
    const guestProfiles = await prisma.guest.findMany({
      where: { userId: user.id },
      select: { id: true, eventId: true }
    });
    const guestIds = guestProfiles.map((guest) => guest.id);
    const eventIds = uniqueStrings(guestProfiles.map((guest) => guest.eventId));
    const tasks = guestIds.length
      ? await prisma.task.findMany({
          where: { guestId: { in: guestIds } },
          select: { driverId: true }
        })
      : [];
    const driverIds = uniqueStrings(tasks.map((task) => task.driverId));

    return {
      OR: [
        { userId: user.id },
        { guestId: { in: guestIds } },
        { driverId: { in: driverIds }, type: FileAssetType.DRIVER_PHOTO },
        { eventId: { in: eventIds }, type: FileAssetType.PROMO_VIDEO }
      ]
    };
  }

  if (user.role === Role.DRIVER) {
    const driver = await prisma.driver.findUnique({
      where: { userId: user.id },
      select: { id: true }
    });

    if (!driver) {
      return { id: "__no_driver_file_access__" };
    }

    const tasks = await prisma.task.findMany({
      where: { driverId: driver.id },
      select: { guestId: true, eventId: true }
    });
    const guestIds = uniqueStrings(tasks.map((task) => task.guestId));
    const eventIds = uniqueStrings(tasks.map((task) => task.eventId));

    return {
      OR: [
        { userId: user.id },
        { driverId: driver.id },
        { guestId: { in: guestIds }, type: FileAssetType.GUEST_PHOTO },
        { eventId: { in: eventIds }, type: FileAssetType.PROMO_VIDEO }
      ]
    };
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

    return { eventId: { in: eventIds }, type: FileAssetType.REPORT_PDF };
  }

  if (user.role === Role.SUPPLIER) {
    return { userId: user.id };
  }

  return { id: "__no_file_access__" };
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

type UploadNotificationBody = {
  type: FileAssetType;
  userId?: string;
  guestId?: string;
  driverId?: string;
  eventId?: string;
};

async function queueUploadNotifications(
  body: UploadNotificationBody,
  fileAssetId: string
) {
  switch (body.type) {
    case FileAssetType.VISA:
    case FileAssetType.TICKET:
    case FileAssetType.PROMO_VIDEO:
      return notifyGuestOfUploadedAsset(body, fileAssetId);
    case FileAssetType.GUEST_PHOTO:
      return notifyCaptainsOfGuestPhoto(body, fileAssetId);
    case FileAssetType.DRIVER_PHOTO:
      return notifyGuestsOfDriverPhoto(body, fileAssetId);
    default:
      return [];
  }
}

async function notifyGuestOfUploadedAsset(
  body: UploadNotificationBody,
  fileAssetId: string
) {
  const recipient = await getGuestRecipient(body);

  if (!recipient) {
    return [];
  }

  const delivery = await sendNotification({
    channel: "WHATSAPP",
    userId: recipient.id,
    phone: recipient.phone,
    title: uploadTitle(body.type),
    body: uploadBody(body.type),
    metadata: {
      fileAssetId,
      assetType: body.type,
      guestId: body.guestId,
      eventId: body.eventId
    }
  });

  return [delivery];
}

async function notifyCaptainsOfGuestPhoto(
  body: UploadNotificationBody,
  fileAssetId: string
) {
  if (!body.guestId) {
    return [];
  }

  const tasks = await prisma.task.findMany({
    where: {
      guestId: body.guestId,
      driverId: { not: null }
    },
    include: {
      driver: { include: { user: true } }
    }
  });
  const drivers = uniqueBy(
    tasks
      .map((task) => task.driver)
      .filter((driver): driver is NonNullable<typeof driver> => Boolean(driver)),
    (driver) => driver.id
  );

  return Promise.all(
    drivers.map((driver) =>
      sendNotification({
        channel: "WHATSAPP",
        userId: driver.userId,
        phone: driver.user.phone,
        title: "Guest photo sent to captain",
        body: "Guest photo is ready for pickup handoff.",
        metadata: {
          fileAssetId,
          assetType: body.type,
          guestId: body.guestId,
          driverId: driver.id,
          eventId: body.eventId
        }
      })
    )
  );
}

async function notifyGuestsOfDriverPhoto(
  body: UploadNotificationBody,
  fileAssetId: string
) {
  if (!body.driverId) {
    return [];
  }

  const tasks = await prisma.task.findMany({
    where: {
      driverId: body.driverId,
      guestId: { not: null }
    },
    include: {
      guest: { include: { user: true } }
    }
  });
  const guests = uniqueBy(
    tasks
      .map((task) => task.guest)
      .filter((guest): guest is NonNullable<typeof guest> => Boolean(guest)),
    (guest) => guest.id
  );

  return Promise.all(
    guests.map((guest) =>
      sendNotification({
        channel: "WHATSAPP",
        userId: guest.userId,
        phone: guest.user.phone,
        title: "Captain details updated",
        body: "Captain photo and details are ready in the guest app.",
        metadata: {
          fileAssetId,
          assetType: body.type,
          guestId: guest.id,
          driverId: body.driverId,
          eventId: body.eventId
        }
      })
    )
  );
}

async function getGuestRecipient(body: UploadNotificationBody) {
  if (body.userId) {
    return prisma.user.findUnique({ where: { id: body.userId } });
  }

  if (!body.guestId) {
    return null;
  }

  const guest = await prisma.guest.findUnique({
    where: { id: body.guestId },
    include: { user: true }
  });

  return guest?.user ?? null;
}

function uploadTitle(type: FileAssetType) {
  switch (type) {
    case FileAssetType.VISA:
      return "Visa sent to guest app";
    case FileAssetType.TICKET:
      return "Ticket sent to guest app";
    case FileAssetType.PROMO_VIDEO:
      return "Hospitality video sent";
    default:
      return "Midyaf update sent";
  }
}

function uploadBody(type: FileAssetType) {
  switch (type) {
    case FileAssetType.VISA:
      return "Your visa document is now available in Midyaf.";
    case FileAssetType.TICKET:
      return "Your event ticket is now available in Midyaf.";
    case FileAssetType.PROMO_VIDEO:
      return "A Riyadh hospitality video has been added to your guest app.";
    default:
      return "A new Midyaf update is available.";
  }
}

function uniqueBy<T>(items: T[], getKey: (item: T) => string) {
  const seen = new Set<string>();

  return items.filter((item) => {
    const key = getKey(item);

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}
