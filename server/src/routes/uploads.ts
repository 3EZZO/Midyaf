import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Router } from "express";
import multer from "multer";
import { FileAssetType, Role } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireRole, verifyAccessToken } from "../middleware/auth.js";
import { HttpError, asyncHandler, requireEntity } from "../utils/http.js";
import { sendNotification } from "../services/notificationDelivery.js";
import {
  buildCloudinaryPrivateDownloadUrl,
  hydrateSignedFileAsset,
  parseCloudinaryKey,
  resolveCloudinaryConfig,
  resolveSignedFileAssetUrl,
  uploadFileToCloudinary,
  verifySignedLocalContentParams
} from "../services/cloudinaryStorage.js";
import type { AuthRequest } from "../types/auth.js";
import {
  safeDriverRelation,
  safeGuestRelation,
  safeUserRelation,
  safeUserSelect
} from "../utils/safeResponse.js";
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
/** MIME types the protected content route may render inline (never HTML/SVG/XML). */
const INLINE_SAFE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf"
]);
const fullAccessRoles: Role[] = [
  Role.LOGISTICS_MANAGER,
  Role.ORGANIZER,
  Role.SUPER_ADMIN
];
const operationalAccessRoles: Role[] = [...fullAccessRoles, Role.COORDINATOR];

type AuthUser = NonNullable<AuthRequest["user"]>;

/**
 * Protected file content delivery (replaces public `express.static("/uploads")`).
 * Admits EITHER a valid unexpired server-signed HMAC URL (`?exp=&sig=`, minted
 * only after RBAC checks) OR a live `Authorization: Bearer` token that passes
 * `buildFileAssetVisibilityWhere`. Never reveals whether an unauthorized ID exists.
 */
router.get(
  "/file-assets/:id/content",
  asyncHandler(async (req: AuthRequest, res) => {
    const id = req.params.id;
    const hasValidSignedUrl = verifySignedLocalContentParams(id, req.query.exp, req.query.sig);

    let asset: { id: string; key: string; url: string; mimeType: string } | null = null;
    if (hasValidSignedUrl) {
      asset = await prisma.fileAsset.findUnique({
        where: { id },
        select: { id: true, key: true, url: true, mimeType: true }
      });
    } else {
      const header = req.headers.authorization;
      const bearer = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
      if (!bearer) {
        throw new HttpError(401, "Authentication or valid signed URL required");
      }
      let actor: AuthUser;
      try {
        actor = verifyAccessToken(bearer);
      } catch {
        throw new HttpError(401, "Invalid or expired token");
      }
      const visibilityWhere = await buildFileAssetVisibilityWhere(actor);
      asset = await prisma.fileAsset.findFirst({
        where: { AND: [{ id }, visibilityWhere ?? {}] },
        select: { id: true, key: true, url: true, mimeType: true }
      });
    }

    if (!asset) {
      throw new HttpError(404, "File asset not found");
    }

    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");

    const parsedCloud = parseCloudinaryKey(asset.key);
    if (parsedCloud) {
      const config = resolveCloudinaryConfig();
      if (!config) {
        throw new HttpError(503, "Cloud media storage is not configured");
      }
      const { url } = buildCloudinaryPrivateDownloadUrl(
        config,
        parsedCloud.resourceType,
        parsedCloud.publicId
      );
      res.redirect(302, url);
      return;
    }

    const safeFileName = path.basename(asset.key);
    const resolvedPath = path.resolve(uploadRoot, safeFileName);
    if (
      !resolvedPath.startsWith(`${uploadRoot}${path.sep}`) ||
      !fs.existsSync(resolvedPath)
    ) {
      throw new HttpError(404, "File content unavailable");
    }

    // Uploaded MIME types are client-declared. Only render known-safe types inline;
    // everything else (HTML, SVG, XML, JS, ...) downloads as an opaque attachment so a
    // hostile upload can never execute on this origin. The sandbox CSP is a backstop.
    const declared = (asset.mimeType || "").toLowerCase().split(";")[0].trim();
    const inlineSafe = INLINE_SAFE_MIME_TYPES.has(declared);
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox"
    );
    res.type(inlineSafe ? declared : "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `${inlineSafe ? "inline" : "attachment"}; filename="${safeFileName.replace(/"/g, "")}"`
    );
    res.sendFile(resolvedPath);
  })
);

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

    res.json({
      fileAssets: fileAssets.map((asset) => hydrateSignedFileAsset(asset))
    });
  })
);

router.get(
  "/file-assets/:id/signed-url",
  asyncHandler(async (req: AuthRequest, res) => {
    const visibilityWhere = await buildFileAssetVisibilityWhere(req.user!);
    const asset = await prisma.fileAsset.findFirst({
      where: { AND: [{ id: req.params.id }, visibilityWhere ?? {}] },
      select: { id: true, key: true, url: true }
    });

    if (!asset) {
      throw new HttpError(404, "File asset not found");
    }

    const signed = resolveSignedFileAssetUrl(asset);
    res.setHeader("Cache-Control", "private, no-store");
    res.json({
      id: asset.id,
      url: signed.url,
      expiresAt: signed.expiresAt,
      storage: signed.storage
    });
  })
);

router.post(
  "/uploads",
  // Guests are admitted only for self-service documents; `validateUploadTarget`
  // pins them to their own account.
  requireRole([
    Role.LOGISTICS_MANAGER,
    Role.ORGANIZER,
    Role.SUPER_ADMIN,
    Role.COORDINATOR,
    Role.GUEST
  ]),
  upload.single("file"),
  asyncHandler(async (req: AuthRequest, res) => {
    if (!req.file) {
      throw new HttpError(400, "Missing upload file");
    }

    const tempFilePath = req.file.path;
    const cleanupTempFile = async () => {
      if (tempFilePath) {
        await fs.promises.unlink(tempFilePath).catch(() => undefined);
      }
    };

    let body: UploadNotificationBody;
    try {
      body = z
        .object({
          type: z.nativeEnum(FileAssetType),
          userId: z.string().optional(),
          guestId: z.string().optional(),
          driverId: z.string().optional(),
          eventId: z.string().optional()
        })
        .parse(req.body);

      await validateUploadTarget(req.user!, body);
    } catch (error) {
      await cleanupTempFile();
      throw error;
    }

    const cloudinaryConfig = resolveCloudinaryConfig();
    let storedKey = req.file.filename;
    let storedSize = req.file.size;
    let storageProvider: "cloudinary" | "local" = "local";

    if (cloudinaryConfig) {
      try {
        const uploaded = await uploadFileToCloudinary(
          {
            filePath: tempFilePath,
            mimeType: req.file.mimetype,
            assetType: body.type,
            originalName: req.file.originalname
          },
          cloudinaryConfig
        );
        storedKey = uploaded.key;
        storedSize = uploaded.bytes;
        storageProvider = "cloudinary";
      } catch (error) {
        await cleanupTempFile();
        throw new HttpError(502, "Failed to store uploaded file in cloud media storage");
      }
      // Remove ephemeral local file once persisted to Cloudinary.
      await cleanupTempFile();
    }

    const fileAsset = await prisma.fileAsset.create({
      data: {
        ...body,
        key: storedKey,
        // Canonical non-public reference; responses always hydrate a short-lived signed URL.
        url: "/api/file-assets/protected",
        mimeType: req.file.mimetype,
        size: storedSize
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
        storage: storageProvider,
        guestId: fileAsset.guestId,
        driverId: fileAsset.driverId,
        userId: fileAsset.userId
      }
    });

    res.status(201).json({
      fileAsset: hydrateSignedFileAsset(fileAsset, { config: cloudinaryConfig }),
      deliveries,
      verification: {
        status: "UPLOADED",
        reviewStatus: "PENDING_REVIEW",
        verified: false,
        documentType: fileAsset.type
      }
    });
  })
);

export default router;

/**
 * Self-service (guest onboarding): a guest may attach an identity document
 * (`OTHER`) to their own user, or a photo to a guest record they own. Any
 * other target is refused — a guest never files documents for someone else.
 */
async function validateGuestSelfUpload(
  user: AuthUser,
  body: UploadNotificationBody
) {
  if (
    body.type !== FileAssetType.OTHER &&
    body.type !== FileAssetType.GUEST_PHOTO
  ) {
    throw new HttpError(403, "Guests may only upload identity documents");
  }
  if (body.driverId || body.eventId) {
    throw new HttpError(403, "Guests cannot target drivers or events");
  }
  if (body.userId && body.userId !== user.id) {
    throw new HttpError(403, "Guests may only upload to their own account");
  }
  if (body.guestId) {
    const guest = requireEntity(
      await prisma.guest.findUnique({
        where: { id: body.guestId },
        select: { userId: true }
      }),
      "Guest not found"
    );
    if (guest.userId !== user.id) {
      throw new HttpError(403, "Guest record belongs to another user");
    }
  } else if (body.type === FileAssetType.GUEST_PHOTO) {
    throw new HttpError(400, "Guest photo uploads require guestId");
  }
  body.userId = user.id;
}

async function validateUploadTarget(
  user: AuthUser,
  body: UploadNotificationBody
) {
  if (user.role === Role.GUEST) {
    await validateGuestSelfUpload(user, body);
    return;
  }

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
  return [
    ...new Set(values.filter((value): value is string => Boolean(value)))
  ];
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
      driver: safeDriverRelation
    }
  });
  const drivers = uniqueBy(
    tasks
      .map((task) => task.driver)
      .filter((driver): driver is NonNullable<typeof driver> =>
        Boolean(driver)
      ),
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
      guest: safeGuestRelation
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
    return prisma.user.findUnique({
      where: { id: body.userId },
      select: safeUserSelect
    });
  }

  if (!body.guestId) {
    return null;
  }

  const guest = await prisma.guest.findUnique({
    where: { id: body.guestId },
    include: { user: safeUserRelation }
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
