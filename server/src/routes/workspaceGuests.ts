import { z } from "zod";
import { Router } from "express";
import { EventPermission, Prisma } from "@prisma/client";
import {
  PRIVACY_GROUP_PATTERN,
  groupPrivacySchema,
  guestCreateSchema,
  guestListQuerySchema,
  guestPrivacySchema,
  guestUpdateSchema,
  nextGuestCode
} from "../../../shared/overhaul.js";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import type { AuthRequest } from "../types/auth.js";
import { HttpError, asyncHandler } from "../utils/http.js";
import {
  GUEST_CODE_SELECT,
  canViewGuestDetails,
  guestDtosFor,
  loadGuestViewer,
  validatePrivacyViewers
} from "../utils/guestPrivacy.js";
import {
  WORKSPACE_TRANSACTION,
  loadEventAccess,
  lockRow,
  parseRouteId,
  requireEventOpen,
  requireNotSupport,
  requirePermission,
  toWorkspaceHttpError,
  writeWorkspaceAudit,
  type EventAccess
} from "../utils/workspacePolicy.js";

/**
 * FULL-OVERHAUL-M2 standardized guest roster (inside /workspace). Reads go
 * through utils/guestPrivacy.ts: code-only unless the viewer is allowed.
 * Excel import/export arrives in M4 and must reuse the same helpers.
 *
 * - Listing needs VIEW; a login guest may read their own linked record.
 * - Create/edit need EDIT; editing a record also needs detail access to it.
 * - Privacy (mask flag and allowed viewers, per guest or per group) needs
 *   EDIT and detail access, refuses support access and self-grants, accepts
 *   only active event members and is audited with before/after viewers.
 * - Audit rows carry guest codes and field names, never guest details.
 */

const router = Router();
router.use(requireAuth);

function guestNotFound() {
  return new HttpError(404, "Guest not found");
}

async function findGuest(access: EventAccess, guestIdRaw: unknown) {
  const id = parseRouteId(guestIdRaw, guestNotFound);
  const guest = await prisma.eventGuest.findFirst({
    where: { id, eventId: access.event.id },
    select: { ...GUEST_CODE_SELECT, guestId: true }
  });
  if (!guest) throw guestNotFound();
  return guest;
}

router.get(
  "/events/:eventId/guests",
  asyncHandler(async (req: AuthRequest, res) => {
    const access = await loadEventAccess(req, req.params.eventId);
    requirePermission(access, EventPermission.VIEW);
    const query = guestListQuerySchema.parse(req.query);
    const viewer = await loadGuestViewer(prisma, access);

    const rows = await prisma.eventGuest.findMany({
      where: { eventId: access.event.id },
      select: GUEST_CODE_SELECT,
      orderBy: [{ guestCode: "asc" }, { id: "asc" }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {})
    });
    const page = rows.slice(0, query.limit);
    res.json({
      guests: await guestDtosFor(prisma, access.event.id, page, viewer),
      nextCursor: rows.length > query.limit ? page[page.length - 1]?.id ?? null : null
    });
  })
);

router.get(
  "/events/:eventId/guests/:guestId",
  asyncHandler(async (req: AuthRequest, res) => {
    const access = await loadEventAccess(req, req.params.eventId);
    const guest = await findGuest(access, req.params.guestId);
    const ownRecord = Boolean(access.guestId && guest.guestId === access.guestId);
    if (!ownRecord) requirePermission(access, EventPermission.VIEW);
    const viewer = await loadGuestViewer(prisma, access);
    // A login guest always sees their own record.
    const effective = ownRecord ? { ...viewer, grantedGuestIds: new Set([guest.id]) } : viewer;
    const [dto] = await guestDtosFor(prisma, access.event.id, [guest], effective);
    res.json({ guest: dto });
  })
);

router.post(
  "/events/:eventId/guests",
  asyncHandler(async (req: AuthRequest, res) => {
    const access = await loadEventAccess(req, req.params.eventId);
    requirePermission(access, EventPermission.EDIT);
    requireEventOpen(access);
    const body = guestCreateSchema.parse(req.body);

    const created = await prisma
      .$transaction(async (tx) => {
        // Serializes code allocation per event.
        await lockRow(tx, "Event", access.event.id);
        let guestCode = body.guestCode;
        if (!guestCode) {
          const codes = await tx.eventGuest.findMany({
            where: { eventId: access.event.id },
            select: { guestCode: true }
          });
          guestCode = nextGuestCode(codes.map((row) => row.guestCode), body.isVip) ?? undefined;
          if (!guestCode) throw new HttpError(409, "No guest codes are left for this tier");
        }
        const guest = await tx.eventGuest.create({
          data: {
            eventId: access.event.id,
            guestCode,
            isVip: body.isVip,
            fullName: body.fullName,
            contactPhone: body.contactPhone ?? null,
            contactEmail: body.contactEmail ?? null,
            roomType: body.roomType ?? null,
            hotelName: body.hotelName ?? null,
            arrivalAt: body.arrivalAt ?? null,
            departureAt: body.departureAt ?? null,
            ticketNumber: body.ticketNumber ?? null,
            originCity: body.originCity ?? null,
            arrivalCity: body.arrivalCity ?? null,
            departureCity: body.departureCity ?? null,
            privacyGroup: body.privacyGroup ?? null
          },
          select: GUEST_CODE_SELECT
        });
        await writeWorkspaceAudit(tx, req, {
          action: "workspace.guest.create",
          entityType: "EVENT_GUEST",
          entityId: guest.id,
          eventId: access.event.id,
          metadata: { guestCode: guest.guestCode, generatedCode: !body.guestCode }
        });
        return guest;
      }, WORKSPACE_TRANSACTION)
      .catch((error: unknown) => {
        throw toWorkspaceHttpError(error, "This guest code is already used in the event");
      });

    const viewer = await loadGuestViewer(prisma, access);
    const [dto] = await guestDtosFor(prisma, access.event.id, [created], viewer);
    res.status(201).json({ guest: dto });
  })
);

router.patch(
  "/events/:eventId/guests/:guestId",
  asyncHandler(async (req: AuthRequest, res) => {
    const access = await loadEventAccess(req, req.params.eventId);
    requirePermission(access, EventPermission.EDIT);
    requireEventOpen(access);
    const guest = await findGuest(access, req.params.guestId);
    const viewer = await loadGuestViewer(prisma, access);
    if (!canViewGuestDetails(guest, viewer)) throw new HttpError(403, "This guest is private to you");
    const body = guestUpdateSchema.parse(req.body);
    if (body.privacyGroup !== undefined && body.privacyGroup !== guest.privacyGroup) {
      // Moving a guest between groups changes who may see it.
      requireNotSupport(access, "change guest privacy");
    }

    const updated = await prisma
      .$transaction(async (tx) => {
        await lockRow(tx, "EventGuest", guest.id);
        const row = await tx.eventGuest.update({
          where: { id: guest.id },
          data: body,
          select: GUEST_CODE_SELECT
        });
        await writeWorkspaceAudit(tx, req, {
          action: "workspace.guest.update",
          entityType: "EVENT_GUEST",
          entityId: guest.id,
          eventId: access.event.id,
          metadata: {
            guestCode: guest.guestCode,
            fields: Object.keys(body).join(","),
            privacyGroupBefore: guest.privacyGroup,
            privacyGroupAfter: row.privacyGroup
          }
        });
        return row;
      }, WORKSPACE_TRANSACTION)
      .catch((error: unknown) => {
        throw toWorkspaceHttpError(error);
      });

    const [dto] = await guestDtosFor(prisma, access.event.id, [updated], await loadGuestViewer(prisma, access));
    res.json({ guest: dto });
  })
);

router.put(
  "/events/:eventId/guests/:guestId/privacy",
  asyncHandler(async (req: AuthRequest, res) => {
    const access = await loadEventAccess(req, req.params.eventId);
    requirePermission(access, EventPermission.EDIT);
    requireNotSupport(access, "change guest privacy");
    const guest = await findGuest(access, req.params.guestId);
    const viewer = await loadGuestViewer(prisma, access);
    if (!canViewGuestDetails(guest, viewer)) throw new HttpError(403, "This guest is private to you");
    const body = guestPrivacySchema.parse(req.body);
    const viewerIds = await validatePrivacyViewers(prisma, access.event.id, access.actor.id, body.viewerUserIds);

    const result = await prisma
      .$transaction(async (tx) => {
        await lockRow(tx, "EventGuest", guest.id);
        const previous = await tx.guestPrivacyGrant.findMany({
          where: { eventGuestId: guest.id },
          select: { viewerUserId: true }
        });
        await tx.guestPrivacyGrant.deleteMany({ where: { eventGuestId: guest.id } });
        if (viewerIds.length > 0) {
          await tx.guestPrivacyGrant.createMany({
            data: viewerIds.map((viewerUserId) => ({
              eventId: access.event.id,
              eventGuestId: guest.id,
              viewerUserId,
              grantedById: access.actor.id
            }))
          });
        }
        await tx.eventGuest.update({ where: { id: guest.id }, data: { privacyMasked: body.masked } });
        await writeWorkspaceAudit(tx, req, {
          action: "workspace.guest.privacy",
          entityType: "EVENT_GUEST",
          entityId: guest.id,
          eventId: access.event.id,
          before: { masked: guest.privacyMasked, viewerUserIds: previous.map((grant) => grant.viewerUserId).sort() },
          after: { masked: body.masked, viewerUserIds: [...viewerIds].sort() },
          metadata: { guestCode: guest.guestCode }
        });
        return { masked: body.masked, viewerUserIds: [...viewerIds].sort() };
      }, WORKSPACE_TRANSACTION)
      .catch((error: unknown) => {
        throw toWorkspaceHttpError(error);
      });

    res.json({ privacy: { guestId: guest.id, ...result } });
  })
);

router.put(
  "/events/:eventId/guest-groups/:groupKey/privacy",
  asyncHandler(async (req: AuthRequest, res) => {
    const access = await loadEventAccess(req, req.params.eventId);
    requirePermission(access, EventPermission.EDIT);
    requireNotSupport(access, "change guest privacy");
    const groupKey = req.params.groupKey;
    if (typeof groupKey !== "string" || !PRIVACY_GROUP_PATTERN.test(groupKey)) {
      throw new HttpError(404, "Group not found");
    }
    const viewer = await loadGuestViewer(prisma, access);
    // Managing a group needs detail access to every masked guest in it.
    const members = await prisma.eventGuest.findMany({
      where: { eventId: access.event.id, privacyGroup: groupKey },
      select: GUEST_CODE_SELECT
    });
    if (members.length === 0) throw new HttpError(404, "Group not found");
    if (!members.every((guest) => canViewGuestDetails(guest, viewer))) {
      throw new HttpError(403, "This group contains guests that are private to you");
    }
    const body = groupPrivacySchema.parse(req.body);
    const viewerIds = await validatePrivacyViewers(prisma, access.event.id, access.actor.id, body.viewerUserIds);

    const result = await prisma
      .$transaction(async (tx) => {
        await lockRow(tx, "Event", access.event.id);
        const where: Prisma.GuestPrivacyGrantWhereInput = { eventId: access.event.id, groupKey };
        await tx.eventGuest.updateMany({ where: { eventId: access.event.id, privacyGroup: groupKey }, data: { privacyMasked: body.masked } });
        const previous = await tx.guestPrivacyGrant.findMany({ where, select: { viewerUserId: true } });
        await tx.guestPrivacyGrant.deleteMany({ where });
        if (viewerIds.length > 0) {
          await tx.guestPrivacyGrant.createMany({
            data: viewerIds.map((viewerUserId) => ({
              eventId: access.event.id,
              groupKey,
              viewerUserId,
              grantedById: access.actor.id
            }))
          });
        }
        await writeWorkspaceAudit(tx, req, {
          action: "workspace.guest_group.privacy",
          entityType: "GUEST_PRIVACY_GROUP",
          entityId: groupKey,
          eventId: access.event.id,
          before: { viewerUserIds: previous.map((grant) => grant.viewerUserId).sort() },
          after: { viewerUserIds: [...viewerIds].sort() }
        });
        return { groupKey, masked: body.masked, viewerUserIds: [...viewerIds].sort() };
      }, WORKSPACE_TRANSACTION)
      .catch((error: unknown) => {
        throw toWorkspaceHttpError(error);
      });

    res.json({ privacy: result });
  })
);

router.put("/events/:eventId/guests/:guestId/position", asyncHandler(async (req: AuthRequest, res) => {
  const access = await loadEventAccess(req, req.params.eventId);
  const guest = await findGuest(access, req.params.guestId);
  if (!access.guestId || guest.guestId !== access.guestId) throw new HttpError(403, "Only the guest can share their own location");
  const body = z.discriminatedUnion("consent", [
    z.object({ consent: z.literal(false) }).strict(),
    z.object({ consent: z.literal(true), lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).strict()
  ]).parse(req.body);
  await prisma.eventGuest.update({ where: { id: guest.id }, data: body.consent
    ? { locationConsent: true, lastLat: body.lat, lastLng: body.lng, lastSeenAt: new Date() }
    : { locationConsent: false, lastLat: null, lastLng: null, lastSeenAt: null } });
  res.json({ shared: body.consent });
}));

export default router;
