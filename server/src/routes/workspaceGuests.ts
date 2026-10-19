import { guestWorkbook, parseGuestWorkbook, WORKBOOK_MAX_BYTES } from "../utils/guestWorkbook.js";
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

/**
 * Privacy changes lock the Event first, then guest rows (the order used by
 * group moves, group/guest privacy and ETA), and re-evaluate the actor's
 * EDIT permission inside the transaction.
 */
async function lockedPrivacyAccess(req: AuthRequest, tx: Prisma.TransactionClient, eventId: string) {
  await lockRow(tx, "Event", eventId);
  const fresh = await loadEventAccess(req, eventId, tx);
  requirePermission(fresh, EventPermission.EDIT);
  return fresh;
}

/** The guest row as it is now, which the actor must see in detail under current grants. */
async function currentGuestFor(tx: Prisma.TransactionClient, access: EventAccess, id: string) {
  const row = await tx.eventGuest.findFirst({
    where: { id, eventId: access.event.id },
    select: { ...GUEST_CODE_SELECT, guestId: true }
  });
  if (!row) throw guestNotFound();
  if (!canViewGuestDetails(row, await loadGuestViewer(tx, access))) throw new HttpError(403, "This guest is private to you");
  return row;
}

router.get("/events/:eventId/guest-workbook/template", asyncHandler(async (req: AuthRequest, res) => {
  const access = await loadEventAccess(req, req.params.eventId); requirePermission(access, EventPermission.VIEW);
  res.set({ "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="midyaf-guests-template.xlsx"', "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" });
  res.send(await guestWorkbook([], true));
}));
router.get("/events/:eventId/guest-workbook/export", asyncHandler(async (req: AuthRequest, res) => {
  const access = await loadEventAccess(req, req.params.eventId); requirePermission(access, EventPermission.VIEW);
  const rows = await prisma.eventGuest.findMany({ where: { eventId: access.event.id }, select: GUEST_CODE_SELECT, orderBy: { guestCode: "asc" }, take: 2001 });
  if (rows.length > 2000) throw new HttpError(409, "Export supports up to 2000 guests per event");
  const guests = await guestDtosFor(prisma, access.event.id, rows, await loadGuestViewer(prisma, access));
  await writeWorkspaceAudit(prisma, req, { action: "workspace.guest.export", entityType: "EVENT", entityId: access.event.id, eventId: access.event.id, metadata: { count: guests.length } });
  res.set({ "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="midyaf-guests.xlsx"', "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" });
  res.send(await guestWorkbook(guests));
}));
router.post("/events/:eventId/guest-workbook/import", asyncHandler(async (req: AuthRequest, res) => {
  const access = await loadEventAccess(req, req.params.eventId); requirePermission(access, EventPermission.EDIT); requireNotSupport(access, "import guests"); requireEventOpen(access);
  const body = z.object({ contentBase64: z.string().max(Math.ceil(WORKBOOK_MAX_BYTES*4/3)+4).regex(/^[A-Za-z0-9+/]+={0,2}$/), apply: z.boolean().default(false), defaultVip: z.boolean().default(false), timezone: z.string().max(60).default("Asia/Riyadh") }).strict().parse(req.body);
  const bytes = Buffer.from(body.contentBase64,"base64");
  const result = await prisma.$transaction(async tx => {
    await lockRow(tx,"Event",access.event.id);
    const existing = await tx.eventGuest.findMany({ where: { eventId: access.event.id }, select: { guestCode: true } });
    const parsed = await parseGuestWorkbook(bytes, existing.map(row=>row.guestCode), body.defaultVip, body.timezone);
    if(parsed.errors.length) return { applied:false, count:0, errors:parsed.errors, preview:[] };
    if(body.apply) {
      if(existing.length+parsed.rows.length>2000)throw new HttpError(409,"This event supports up to 2000 roster guests");
      await tx.eventGuest.createMany({data:parsed.rows.map(row=>({...row,eventId:access.event.id}))});
      await writeWorkspaceAudit(tx,req,{action:"workspace.guest.import",entityType:"EVENT",entityId:access.event.id,eventId:access.event.id,metadata:{count:parsed.rows.length}});
    }
    return {applied:body.apply,count:parsed.rows.length,errors:[],preview:parsed.rows.map(row=>({guestCode:row.guestCode,fullName:row.fullName,arrivalAt:row.arrivalAt?.toISOString()??null,departureAt:row.departureAt?.toISOString()??null}))};
  },WORKSPACE_TRANSACTION);
  res.status(result.errors.length?422:200).json(result);
}));

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

    const { row: updated, viewer: freshViewer } = await prisma
      .$transaction(async (tx) => {
        // Every detail edit serializes with privacy changes (Event first,
        // then the guest row) and re-authorizes against the current row,
        // grants and permissions, so a grant revoked or a guest masked while
        // this request waited cannot be written through.
        const fresh = await lockedPrivacyAccess(req, tx, access.event.id);
        requireEventOpen(fresh);
        await lockRow(tx, "EventGuest", guest.id);
        const current = await currentGuestFor(tx, fresh, guest.id);
        if (body.privacyGroup !== undefined && body.privacyGroup !== current.privacyGroup) {
          requireNotSupport(fresh, "change guest privacy");
        }
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
            privacyGroupBefore: current.privacyGroup,
            privacyGroupAfter: row.privacyGroup
          }
        });
        // The response uses the access and grants as they were under the locks.
        return { row, viewer: await loadGuestViewer(tx, fresh) };
      }, WORKSPACE_TRANSACTION)
      .catch((error: unknown) => {
        throw toWorkspaceHttpError(error);
      });

    const [dto] = await guestDtosFor(prisma, access.event.id, [updated], freshViewer);
    res.json({ guest: dto });
  })
);

router.get("/events/:eventId/guests/:guestId/privacy", asyncHandler(async (req: AuthRequest, res) => {
  const access = await loadEventAccess(req, req.params.eventId);
  requirePermission(access, EventPermission.EDIT); requireNotSupport(access, "manage guest privacy");
  const guest = await findGuest(access, req.params.guestId);
  if (!canViewGuestDetails(guest, await loadGuestViewer(prisma, access))) throw new HttpError(403, "This guest is private to you");
  const grants = await prisma.guestPrivacyGrant.findMany({ where: { eventGuestId: guest.id }, select: { viewerUserId: true } });
  res.json({ privacy: { masked: guest.privacyMasked, viewerUserIds: grants.map(grant => grant.viewerUserId) } });
}));

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
    await validatePrivacyViewers(prisma, access.event.id, access.actor.id, body.viewerUserIds);

    const result = await prisma
      .$transaction(async (tx) => {
        // Re-authorized under the Event and guest locks with current grants.
        const fresh = await lockedPrivacyAccess(req, tx, access.event.id);
        requireNotSupport(fresh, "change guest privacy");
        await lockRow(tx, "EventGuest", guest.id);
        const current = await currentGuestFor(tx, fresh, guest.id);
        const viewerIds = await validatePrivacyViewers(tx, access.event.id, access.actor.id, body.viewerUserIds);
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
          before: { masked: current.privacyMasked, viewerUserIds: previous.map((grant) => grant.viewerUserId).sort() },
          after: { masked: body.masked, viewerUserIds: [...viewerIds].sort() },
          metadata: { guestCode: current.guestCode }
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
    await validatePrivacyViewers(prisma, access.event.id, access.actor.id, body.viewerUserIds);

    const result = await prisma
      .$transaction(async (tx) => {
        // Group moves also lock the Event first, so the members read here are
        // the members written below. Access, grants and allowed viewers are
        // re-evaluated as they are now; a guest moved in that the actor
        // cannot see refuses the whole change.
        const fresh = await lockedPrivacyAccess(req, tx, access.event.id);
        requireNotSupport(fresh, "change guest privacy");
        const current = await tx.eventGuest.findMany({
          where: { eventId: access.event.id, privacyGroup: groupKey },
          select: GUEST_CODE_SELECT,
          orderBy: { id: "asc" }
        });
        if (current.length === 0) throw new HttpError(404, "Group not found");
        for (const guest of current) await lockRow(tx, "EventGuest", guest.id);
        const freshViewer = await loadGuestViewer(tx, fresh);
        if (!current.every((guest) => canViewGuestDetails(guest, freshViewer))) {
          throw new HttpError(403, "This group contains guests that are private to you");
        }
        const viewerIds = await validatePrivacyViewers(tx, access.event.id, access.actor.id, body.viewerUserIds);
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
