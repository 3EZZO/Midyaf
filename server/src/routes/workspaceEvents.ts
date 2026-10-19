import { createHash, randomBytes } from "node:crypto";
import { Router } from "express";
import {
  EventMemberRole,
  EventPermission,
  EventPlanSource,
  EventPlanStatus,
  EventStatus,
  MembershipStatus,
  OperationalStatus,
  Prisma,
  Role
} from "@prisma/client";
import { z } from "zod";
import {
  EVENT_SCOPE_FIELDS,
  OPERATIONAL_STATUSES,
  WORKSPACE_LIMITS,
  canTransitionOperational,
  eventInviteSchema,
  messagingPolicySchema,
  eventContractSignSchema,
  eventCreateSchema,
  eventMemberCreateSchema,
  eventMemberUpdateSchema,
  eventStatusSchema,
  eventUpdateSchema,
  eventWindowProblem,
  idSchema,
  memberAvailabilitySchema,
  planApproveSchema,
  planGenerateSchema,
  type EventMemberDto,
  type EventScopeField,
  type EventUpdateInput
} from "../../../shared/overhaul.js";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import type { AuthRequest } from "../types/auth.js";
import { HttpError, asyncHandler } from "../utils/http.js";
import {
  ALL_PERMISSIONS,
  EVENT_PLAN_SELECT,
  WORKSPACE_EVENT_SELECT,
  WORKSPACE_TRANSACTION,
  assertCanGrant,
  eventMessagingPolicy,
  buildAdvisoryPlan,
  categoriesForScopeChange,
  hasEventRole,
  isOrgAdminRole,
  loadEventAccess,
  lockRow,
  matchingVendorRecipients,
  parseRouteId,
  requireContractUnsigned,
  requireEventOpen,
  requireNotSupport,
  requirePermission,
  requirePlanApproved,
  toEventDto,
  toPlanDto,
  toWorkspaceHttpError,
  writeWorkspaceAudit,
  type EventAccess,
  type OrgEventRow
} from "../utils/workspacePolicy.js";

/**
 * FULL-OVERHAUL-M2 organization-scoped events, plans, contract lock and
 * event teams (inside /workspace).
 *
 * - Create: organization OWNER/ADMIN of an ORGANIZER_COMPANY organization.
 * - Edit: descriptive fields need EDIT; scope fields need SCOPE, are refused
 *   once the contract is signed, and a real change atomically records an
 *   EventScopeChange, enqueues bounded in-app notifications to matching
 *   vendor members and writes the audit.
 * - Plans: generation is advisory (deterministic fallback, clearly labelled)
 *   or manual; only an explicit approval by an organization admin or the
 *   event's project manager makes one operational. Approval unlocks team,
 *   permissions, inbox, dispatch and telemetry (423 before).
 * - Contract: signed only through POST .../contract/sign by an organization
 *   OWNER/ADMIN with an explicit confirmation; no update body can set it.
 */

const router = Router();
router.use(requireAuth);

const listQuerySchema = z
  .object({
    organizationId: idSchema.optional(),
    operationalStatus: z.enum(OPERATIONAL_STATUSES).optional()
  })
  .strict();

const PLAN_APPROVER_ROLES: readonly EventMemberRole[] = [EventMemberRole.PROJECT_MANAGER];
const CLIENT_FACING_ROLES: readonly EventMemberRole[] = [EventMemberRole.CLIENT_VIEWER, EventMemberRole.VENDOR];

const MEMBER_SELECT = {
  id: true,
  userId: true,
  role: true,
  subteam: true,
  workScope: true,
  permissions: true,
  clientVisible: true,
  canReceive: true,
  available: true,
  status: true,
  user: { select: { id: true, name: true } }
} satisfies Prisma.EventMembershipSelect;

type MemberRow = Prisma.EventMembershipGetPayload<{ select: typeof MEMBER_SELECT }>;

function toMemberDto(row: MemberRow): EventMemberDto {
  return {
    id: row.id,
    user: row.user,
    role: row.role,
    subteam: row.subteam,
    workScope: row.workScope,
    permissions: ALL_PERMISSIONS.filter((permission) => row.permissions.includes(permission)),
    clientVisible: row.clientVisible,
    canReceive: row.canReceive,
    available: row.available,
    status: row.status
  };
}

function eventResponse(event: OrgEventRow, access: EventAccess) {
  return toEventDto(event, access);
}

async function reloadEvent(db: Pick<Prisma.TransactionClient, "event">, eventId: string): Promise<OrgEventRow> {
  const event = await db.event.findUnique({ where: { id: eventId }, select: WORKSPACE_EVENT_SELECT });
  if (!event || !event.organizationId) throw new HttpError(404, "Event not found");
  return { ...event, organizationId: event.organizationId };
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

router.get(
  "/events",
  asyncHandler(async (req: AuthRequest, res) => {
    const user = req.user!;
    const query = listQuerySchema.parse(req.query);
    const filters: Prisma.EventWhereInput = {
      organizationId: query.organizationId ?? { not: null },
      ...(query.operationalStatus ? { operationalStatus: query.operationalStatus } : {})
    };

    const [orgMemberships, eventMemberships, guestRows] = await Promise.all([
      prisma.organizationMembership.findMany({
        where: { userId: user.id, status: MembershipStatus.ACTIVE },
        select: { organizationId: true, role: true }
      }),
      prisma.eventMembership.findMany({
        where: { userId: user.id, status: MembershipStatus.ACTIVE },
        select: { id: true, eventId: true, role: true, permissions: true, canReceive: true, available: true }
      }),
      prisma.guest.findMany({ where: { userId: user.id }, select: { id: true, eventId: true }, take: 500 })
    ]);
    const orgRoles = new Map(orgMemberships.map((m) => [m.organizationId, m.role]));
    const adminOrgIds = orgMemberships.filter((m) => isOrgAdminRole(m.role)).map((m) => m.organizationId);
    const memberByEvent = new Map(eventMemberships.map((m) => [m.eventId, m]));
    const guestByEvent = new Map(guestRows.map((g) => [g.eventId, g.id]));
    const support = user.role === Role.SUPER_ADMIN;

    const events = await prisma.event.findMany({
      where: support
        ? filters
        : {
            AND: [
              filters,
              {
                OR: [
                  { organizationId: { in: adminOrgIds } },
                  { id: { in: [...memberByEvent.keys()] } },
                  { id: { in: [...guestByEvent.keys()] } }
                ]
              }
            ]
          },
      select: WORKSPACE_EVENT_SELECT,
      orderBy: [{ startAt: "desc" }, { id: "asc" }],
      take: 200
    });

    if (support) {
      await writeWorkspaceAudit(prisma, req, {
        action: "workspace.support_access",
        entityType: "EVENT",
        entityId: "*",
        metadata: { listed: events.length }
      });
    }

    res.json({
      events: events.flatMap((event) => {
        if (!event.organizationId) return [];
        const organizationRole = orgRoles.get(event.organizationId) ?? null;
        const membershipRow = memberByEvent.get(event.id);
        const membership = membershipRow
          ? {
              id: membershipRow.id,
              role: membershipRow.role,
              permissions: membershipRow.permissions,
              canReceive: membershipRow.canReceive,
              available: membershipRow.available
            }
          : null;
        const admin = isOrgAdminRole(organizationRole);
        const guestId = guestByEvent.get(event.id) ?? null;
        const supportOnly = support && !admin && !membership && !guestId;
        const permissions = new Set<EventPermission>(
          admin || supportOnly ? ALL_PERMISSIONS : membership?.permissions ?? []
        );
        return [
          toEventDto(
            { ...event, organizationId: event.organizationId },
            { permissions, membership, organizationRole, support: supportOnly, guestId }
          )
        ];
      })
    });
  })
);

router.post(
  "/events",
  asyncHandler(async (req: AuthRequest, res) => {
    const user = req.user!;
    const body = eventCreateSchema.parse(req.body);
    const organization = await prisma.organization.findUnique({
      where: { id: body.organizationId },
      select: { id: true, kind: true }
    });
    const membership = organization
      ? await prisma.organizationMembership.findUnique({
          where: { organizationId_userId: { organizationId: organization.id, userId: user.id } },
          select: { role: true, status: true }
        })
      : null;
    const role = membership?.status === MembershipStatus.ACTIVE ? membership.role : null;
    if (!organization || !role) throw new HttpError(404, "Organization not found");
    if (!isOrgAdminRole(role)) throw new HttpError(403, "Only organization owners and admins can create events");
    if (!["ORGANIZER_COMPANY", "CLIENT"].includes(organization.kind)) {
      throw new HttpError(403, "Only organizer companies create events");
    }

    const created = await prisma
      .$transaction(async (tx) => {
        const event = await tx.event.create({
          data: {
            organizationId: organization.id,
            organizerId: user.id,
            name: body.name,
            brief: body.brief ?? null,
            date: body.startAt,
            venue: body.venue ?? body.locationLabel,
            venueLat: body.venueLat ?? null,
            venueLng: body.venueLng ?? null,
            status: EventStatus.DRAFT,
            operationalStatus: OperationalStatus.PLANNING,
            planningMode: body.planningMode,
            locationLabel: body.locationLabel,
            hotelZone: body.hotelZone ?? null,
            vipGuestCount: body.vipGuestCount,
            regularGuestCount: body.regularGuestCount,
            carCount: body.carCount,
            startAt: body.startAt,
            endAt: body.endAt,
            arrivalStartAt: body.arrivalStartAt ?? null,
            departureEndAt: body.departureEndAt ?? null
          },
          select: WORKSPACE_EVENT_SELECT
        });
        await writeWorkspaceAudit(tx, req, {
          action: "workspace.event.create",
          entityType: "EVENT",
          entityId: event.id,
          eventId: event.id,
          after: { organizationId: organization.id, planningMode: body.planningMode }
        });
        return event;
      }, WORKSPACE_TRANSACTION)
      .catch((error: unknown) => {
        throw toWorkspaceHttpError(error);
      });

    const event: OrgEventRow = { ...created, organizationId: organization.id };
    res.status(201).json({
      event: toEventDto(event, {
        permissions: new Set(ALL_PERMISSIONS),
        membership: null,
        organizationRole: role,
        support: false,
        guestId: null
      })
    });
  })
);

router.get(
  "/events/:eventId",
  asyncHandler(async (req: AuthRequest, res) => {
    const access = await loadEventAccess(req, req.params.eventId);
    if (!access.guestId) requirePermission(access, EventPermission.VIEW);
    res.json({ event: eventResponse(access.event, access) });
  })
);

function sameValue(a: unknown, b: unknown) {
  if (a instanceof Date || b instanceof Date) {
    const left = a ? new Date(a as Date).getTime() : null;
    const right = b ? new Date(b as Date).getTime() : null;
    return left === right;
  }
  return (a ?? null) === (b ?? null);
}

/** Plain JSON copy (Dates become ISO strings) for a Json column. */
function toJsonObject(value: Record<string, unknown>): Prisma.InputJsonObject {
  const copy: unknown = JSON.parse(JSON.stringify(value));
  if (!copy || typeof copy !== "object" || Array.isArray(copy)) return {};
  return copy as Prisma.InputJsonObject;
}

function isScopeField(field: string): field is EventScopeField {
  return (EVENT_SCOPE_FIELDS as readonly string[]).includes(field);
}

router.patch(
  "/events/:eventId",
  asyncHandler(async (req: AuthRequest, res) => {
    const access = await loadEventAccess(req, req.params.eventId);
    const body: EventUpdateInput = eventUpdateSchema.parse(req.body);
    requireEventOpen(access);

    const requestedFields = (Object.keys(body) as Array<keyof EventUpdateInput>).filter((key) => body[key] !== undefined);
    const scopeRequested = requestedFields.filter(isScopeField);
    if (requestedFields.some((field) => !isScopeField(field))) requirePermission(access, EventPermission.EDIT);
    if (scopeRequested.length > 0) {
      requirePermission(access, EventPermission.SCOPE);
      requireNotSupport(access, "change event scope");
    }

    const result = await prisma
      .$transaction(async (tx) => {
        await lockRow(tx, "Event", access.event.id);
        const current = await reloadEvent(tx, access.event.id);
        if (current.operationalStatus === OperationalStatus.COMPLETED) {
          throw new HttpError(409, "The event is completed");
        }

        const changed = requestedFields.filter((field) => !sameValue(body[field], current[field]));
        const scopeChanged = changed.filter(isScopeField);
        if (scopeChanged.length > 0) requireContractUnsigned(current);
        if (changed.length === 0) return { event: current, scopeChange: null };

        const merged = {
          startAt: body.startAt ?? current.startAt,
          endAt: body.endAt ?? current.endAt,
          arrivalStartAt: body.arrivalStartAt !== undefined ? body.arrivalStartAt : current.arrivalStartAt,
          departureEndAt: body.departureEndAt !== undefined ? body.departureEndAt : current.departureEndAt
        };
        const problem = eventWindowProblem(merged);
        if (problem) throw new HttpError(400, problem);

        const data: Prisma.EventUncheckedUpdateInput = {};
        const before: Record<string, unknown> = {};
        const after: Record<string, unknown> = {};
        for (const field of changed) {
          before[field] = current[field];
          after[field] = body[field];
        }
        Object.assign(data, after);
        if (body.startAt && changed.includes("startAt")) data.date = body.startAt;

        const updated = await tx.event.update({
          where: { id: current.id },
          data,
          select: WORKSPACE_EVENT_SELECT
        });

        let scopeChange: { id: string; changedFields: string[]; notifiedVendors: number } | null = null;
        if (scopeChanged.length > 0) {
          const recipients = await matchingVendorRecipients(
            tx,
            current.id,
            categoriesForScopeChange(scopeChanged),
            WORKSPACE_LIMITS.maxVendorNotifications
          );
          const scopeBefore = Object.fromEntries(scopeChanged.map((field) => [field, before[field] ?? null]));
          const scopeAfter = Object.fromEntries(scopeChanged.map((field) => [field, after[field] ?? null]));
          const record = await tx.eventScopeChange.create({
            data: {
              eventId: current.id,
              actorUserId: access.actor.id,
              changedFields: scopeChanged,
              beforeData: toJsonObject(scopeBefore),
              afterData: toJsonObject(scopeAfter),
              notifiedVendorCount: recipients.length
            },
            select: { id: true }
          });
          if (recipients.length > 0) {
            await tx.notification.createMany({
              data: recipients.map((userId) => ({
                userId,
                title: "Event scope changed",
                body: `${current.name}: ${scopeChanged.join(", ")} changed before contract signature. Review your offer.`,
                metadata: { kind: "EVENT_SCOPE_CHANGE", eventId: current.id, scopeChangeId: record.id }
              }))
            });
          }
          scopeChange = { id: record.id, changedFields: scopeChanged, notifiedVendors: recipients.length };
        }

        await writeWorkspaceAudit(tx, req, {
          action: scopeChanged.length > 0 ? "workspace.event.scope_change" : "workspace.event.update",
          entityType: "EVENT",
          entityId: current.id,
          eventId: current.id,
          before,
          after,
          metadata: {
            support: access.support,
            notifiedVendors: scopeChange?.notifiedVendors ?? 0
          }
        });
        return { event: { ...updated, organizationId: current.organizationId }, scopeChange };
      }, WORKSPACE_TRANSACTION)
      .catch((error: unknown) => {
        throw toWorkspaceHttpError(error);
      });

    res.json({ event: eventResponse(result.event, access), scopeChange: result.scopeChange });
  })
);

router.post(
  "/events/:eventId/status",
  asyncHandler(async (req: AuthRequest, res) => {
    const access = await loadEventAccess(req, req.params.eventId);
    requirePermission(access, EventPermission.EDIT);
    requireNotSupport(access, "change the operational status");
    const body = eventStatusSchema.parse(req.body);
    const from = access.event.operationalStatus;
    if (!canTransitionOperational(from, body.operationalStatus)) {
      throw new HttpError(409, `Cannot move the event from ${from} to ${body.operationalStatus}`);
    }
    if (body.operationalStatus === OperationalStatus.ACTIVE) requirePlanApproved(access);

    const event = await prisma
      .$transaction(async (tx) => {
        const changed = await tx.event.updateMany({
          where: { id: access.event.id, operationalStatus: from },
          data: { operationalStatus: body.operationalStatus }
        });
        if (changed.count !== 1) throw new HttpError(409, "The event changed; refresh and try again");
        await writeWorkspaceAudit(tx, req, {
          action: "workspace.event.status",
          entityType: "EVENT",
          entityId: access.event.id,
          eventId: access.event.id,
          before: { operationalStatus: from },
          after: { operationalStatus: body.operationalStatus }
        });
        return reloadEvent(tx, access.event.id);
      }, WORKSPACE_TRANSACTION)
      .catch((error: unknown) => {
        throw toWorkspaceHttpError(error);
      });

    res.json({ event: eventResponse(event, access) });
  })
);

router.post(
  "/events/:eventId/contract/sign",
  asyncHandler(async (req: AuthRequest, res) => {
    const access = await loadEventAccess(req, req.params.eventId);
    requireNotSupport(access, "sign a contract");
    if (!access.isOrgAdmin) {
      throw new HttpError(403, "Only organization owners and admins can record a signed contract");
    }
    const body = eventContractSignSchema.parse(req.body);
    requirePlanApproved(access);

    const event = await prisma
      .$transaction(async (tx) => {
        const now = new Date();
        const changed = await tx.event.updateMany({
          where: { id: access.event.id, contractSignedAt: null },
          data: { contractSignedAt: now, contractSignedById: access.actor.id }
        });
        if (changed.count !== 1) throw new HttpError(409, "The contract is already signed");
        await writeWorkspaceAudit(tx, req, {
          action: "workspace.event.contract_signed",
          entityType: "EVENT",
          entityId: access.event.id,
          eventId: access.event.id,
          after: { contractSignedAt: now.toISOString() },
          metadata: { reference: body.reference }
        });
        return reloadEvent(tx, access.event.id);
      }, WORKSPACE_TRANSACTION)
      .catch((error: unknown) => {
        throw toWorkspaceHttpError(error);
      });

    res.json({ event: eventResponse(event, access) });
  })
);

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

router.get(
  "/events/:eventId/plans",
  asyncHandler(async (req: AuthRequest, res) => {
    const access = await loadEventAccess(req, req.params.eventId);
    requirePermission(access, EventPermission.VIEW);
    const plans = await prisma.eventPlan.findMany({
      where: { eventId: access.event.id },
      select: EVENT_PLAN_SELECT,
      orderBy: { version: "desc" },
      take: 50
    });
    res.json({ plans: plans.map(toPlanDto) });
  })
);

router.post(
  "/events/:eventId/plans/generate",
  asyncHandler(async (req: AuthRequest, res) => {
    const access = await loadEventAccess(req, req.params.eventId);
    requirePermission(access, EventPermission.EDIT);
    requireEventOpen(access);
    const body = planGenerateSchema.parse(req.body);

    const plan = await prisma
      .$transaction(async (tx) => {
        await lockRow(tx, "Event", access.event.id);
        const event = await reloadEvent(tx, access.event.id);
        const latest = await tx.eventPlan.findFirst({
          where: { eventId: event.id },
          select: { version: true },
          orderBy: { version: "desc" }
        });

        const generated =
          body.mode === "ADVISORY"
            ? { source: EventPlanSource.DETERMINISTIC_ADVISORY, advisory: true, ...buildAdvisoryPlan(event) }
            : {
                source: EventPlanSource.MANUAL,
                advisory: false,
                summary: body.summary,
                content: {
                  generator: "manual",
                  logistics: body.items.filter(item => item.category === "OTHER"),
                  hotelDistribution: body.items.filter(item => item.category === "HOTEL_ROOMS"),
                  vehicleRequirements: body.items.filter(item => item.category === "VEHICLES"),
                  teamRequirements: body.items.filter(item => item.category === "STAFF"),
                  scopeOfWork: body.items.map(item => item.note ?? item.category),
                  items: body.items.map((item) => ({ ...item, note: item.note ?? null }))
                }
              };

        const created = await tx.eventPlan.create({
          data: {
            eventId: event.id,
            version: (latest?.version ?? 0) + 1,
            status: EventPlanStatus.DRAFT,
            source: generated.source,
            advisory: generated.advisory,
            summary: generated.summary.slice(0, 2000),
            content: generated.content,
            generatedById: access.actor.id
          },
          select: EVENT_PLAN_SELECT
        });
        await writeWorkspaceAudit(tx, req, {
          action: "workspace.plan.generate",
          entityType: "EVENT_PLAN",
          entityId: created.id,
          eventId: event.id,
          metadata: { version: created.version, source: created.source, support: access.support }
        });
        return created;
      }, WORKSPACE_TRANSACTION)
      .catch((error: unknown) => {
        throw toWorkspaceHttpError(error, "Another plan was generated at the same time; retry");
      });

    res.status(201).json({ plan: toPlanDto(plan) });
  })
);

router.post(
  "/events/:eventId/plans/:planId/approve",
  asyncHandler(async (req: AuthRequest, res) => {
    const access = await loadEventAccess(req, req.params.eventId);
    requireNotSupport(access, "approve a plan");
    const approver =
      access.isOrgAdmin ||
      (hasEventRole(access, PLAN_APPROVER_ROLES) && access.permissions.has(EventPermission.EDIT));
    if (!approver) throw new HttpError(403, "Only an organization admin or the project manager can approve plans");
    requireEventOpen(access);
    planApproveSchema.parse(req.body);
    const planId = parseRouteId(req.params.planId, () => new HttpError(404, "Plan not found"));

    const result = await prisma
      .$transaction(async (tx) => {
        await lockRow(tx, "Event", access.event.id);
        const plan = await tx.eventPlan.findFirst({
          where: { id: planId, eventId: access.event.id },
          select: { id: true, status: true, version: true }
        });
        if (!plan) throw new HttpError(404, "Plan not found");
        if (plan.status !== EventPlanStatus.DRAFT) throw new HttpError(409, "Only a draft plan can be approved");

        const now = new Date();
        const superseded = await tx.eventPlan.updateMany({
          where: { eventId: access.event.id, status: EventPlanStatus.APPROVED },
          data: { status: EventPlanStatus.SUPERSEDED }
        });
        const approved = await tx.eventPlan.updateMany({
          where: { id: plan.id, status: EventPlanStatus.DRAFT },
          data: { status: EventPlanStatus.APPROVED, approvedById: access.actor.id, approvedAt: now }
        });
        if (approved.count !== 1) throw new HttpError(409, "The plan changed; refresh and try again");
        await tx.event.update({
          where: { id: access.event.id },
          data: { approvedPlanId: plan.id, planApprovedAt: now }
        });
        await writeWorkspaceAudit(tx, req, {
          action: "workspace.plan.approve",
          entityType: "EVENT_PLAN",
          entityId: plan.id,
          eventId: access.event.id,
          after: { status: EventPlanStatus.APPROVED, version: plan.version },
          metadata: { superseded: superseded.count }
        });
        const event = await reloadEvent(tx, access.event.id);
        const stored = await tx.eventPlan.findUniqueOrThrow({ where: { id: plan.id }, select: EVENT_PLAN_SELECT });
        return { event, plan: stored };
      }, WORKSPACE_TRANSACTION)
      .catch((error: unknown) => {
        throw toWorkspaceHttpError(error);
      });

    res.json({ event: eventResponse(result.event, access), plan: toPlanDto(result.plan) });
  })
);

// ---------------------------------------------------------------------------
// Event team, permissions, client visibility and receivers
// ---------------------------------------------------------------------------

router.get(
  "/events/:eventId/members",
  asyncHandler(async (req: AuthRequest, res) => {
    const access = await loadEventAccess(req, req.params.eventId);
    requirePermission(access, EventPermission.VIEW);
    requirePlanApproved(access);
    const clientFacing = !access.isOrgAdmin && !access.support && hasEventRole(access, CLIENT_FACING_ROLES);
    const members = await prisma.eventMembership.findMany({
      where: {
        eventId: access.event.id,
        ...(clientFacing ? { clientVisible: true, status: MembershipStatus.ACTIVE } : {})
      },
      select: MEMBER_SELECT,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 500
    });
    res.json({ members: members.map(toMemberDto) });
  })
);

/** Role prerequisites stored in the database, never taken from the request. */
async function assertRolePrerequisites(userId: string, role: EventMemberRole, db: Prisma.TransactionClient = prisma) {
  if (role === EventMemberRole.EXECUTIVE_VIEWER) {
    const user=await db.user.findUnique({where:{id:userId},select:{role:true}});
    if(user?.role!==Role.SUPER_ADMIN)throw new HttpError(400,"Executive viewers need an executive account");
  }
  if (role === EventMemberRole.CAPTAIN) {
    const driver = await db.driver.findUnique({ where: { userId }, select: { id: true, active: true } });
    if (!driver || !driver.active) throw new HttpError(400, "A captain needs an active driver profile");
  }
  if (role === EventMemberRole.VENDOR) {
    const vendorOrg = await db.organizationMembership.findFirst({
      where: { userId, status: MembershipStatus.ACTIVE, organization: { kind: "VENDOR" } },
      select: { id: true }
    });
    if (!vendorOrg) throw new HttpError(400, "A vendor member needs an active vendor organization");
  }
}

router.post(
  "/events/:eventId/members",
  asyncHandler(async (req: AuthRequest, res) => {
    const access = await loadEventAccess(req, req.params.eventId);
    requirePlanApproved(access);
    requireEventOpen(access);
    const body = eventMemberCreateSchema.parse(req.body);
    if (body.role === EventMemberRole.EXECUTIVE_VIEWER && body.permissions.some(p => p !== EventPermission.VIEW)) throw new HttpError(400, "Executive viewer access is read-only");
    assertCanGrant(access, body.userId, body.permissions, [body.role]);

    const target = await prisma.user.findUnique({ where: { id: body.userId }, select: { id: true } });
    if (!target) throw new HttpError(400, "The member must be an existing user");
    await assertRolePrerequisites(target.id, body.role);

    const member = await prisma
      .$transaction(async (tx) => {
        const created = await tx.eventMembership.create({
          data: {
            eventId: access.event.id,
            userId: target.id,
            role: body.role,
            subteam: body.subteam ?? null,
            workScope: body.workScope ?? null,
            permissions: body.permissions,
            clientVisible: body.clientVisible ?? false,
            canReceive: body.canReceive ?? true,
            available: body.available ?? true,
            status: MembershipStatus.ACTIVE,
            grantedById: access.actor.id
          },
          select: MEMBER_SELECT
        });
        await writeWorkspaceAudit(tx, req, {
          action: "workspace.member.add",
          entityType: "EVENT_MEMBERSHIP",
          entityId: created.id,
          eventId: access.event.id,
          after: { userId: target.id, role: body.role, subteam: body.subteam ?? null, permissions: body.permissions },
          metadata: { support: access.support }
        });
        return created;
      }, WORKSPACE_TRANSACTION)
      .catch((error: unknown) => {
        throw toWorkspaceHttpError(error, "This user is already on the event team; update the membership instead");
      });

    res.status(201).json({ member: toMemberDto(member) });
  })
);

router.patch(
  "/events/:eventId/members/:membershipId",
  asyncHandler(async (req: AuthRequest, res) => {
    const access = await loadEventAccess(req, req.params.eventId);
    requirePlanApproved(access);
    requireEventOpen(access);
    const membershipId = parseRouteId(req.params.membershipId, () => new HttpError(404, "Membership not found"));
    const body = eventMemberUpdateSchema.parse(req.body);

    const current = await prisma.eventMembership.findFirst({
      where: { id: membershipId, eventId: access.event.id },
      select: { ...MEMBER_SELECT, updatedAt: true }
    });
    if (!current) throw new HttpError(404, "Membership not found");
    if ((body.role ?? current.role) === EventMemberRole.EXECUTIVE_VIEWER && (body.permissions ?? current.permissions).some(p => p !== EventPermission.VIEW)) throw new HttpError(400, "Executive viewer access is read-only");
    // The grantor must hold every permission involved, before and after.
    assertCanGrant(access, current.userId, [...new Set([...current.permissions, ...(body.permissions ?? [])])], [current.role, body.role ?? current.role]);
    if (body.role && body.role !== current.role) await assertRolePrerequisites(current.userId, body.role);

    const member = await prisma
      .$transaction(async (tx) => {
        const data: Prisma.EventMembershipUncheckedUpdateManyInput = { grantedById: access.actor.id };
        if (body.role !== undefined) data.role = body.role;
        if (body.subteam !== undefined) data.subteam = body.subteam;
        if (body.workScope !== undefined) data.workScope = body.workScope;
        if (body.permissions !== undefined) data.permissions = body.permissions;
        if (body.clientVisible !== undefined) data.clientVisible = body.clientVisible;
        if (body.canReceive !== undefined) data.canReceive = body.canReceive;
        if (body.available !== undefined) data.available = body.available;
        if (body.status !== undefined) data.status = body.status;

        // Compare-and-set on the version the authorization decision saw.
        const changed = await tx.eventMembership.updateMany({
          where: { id: current.id, eventId: access.event.id, updatedAt: current.updatedAt },
          data
        });
        if (changed.count !== 1) throw new HttpError(409, "The membership changed; refresh and try again");
        await writeWorkspaceAudit(tx, req, {
          action: "workspace.member.update",
          entityType: "EVENT_MEMBERSHIP",
          entityId: current.id,
          eventId: access.event.id,
          before: {
            role: current.role,
            subteam: current.subteam,
            permissions: current.permissions,
            clientVisible: current.clientVisible,
            canReceive: current.canReceive,
            available: current.available,
            status: current.status
          },
          after: body,
          metadata: { support: access.support }
        });
        return tx.eventMembership.findUniqueOrThrow({ where: { id: current.id }, select: MEMBER_SELECT });
      }, WORKSPACE_TRANSACTION)
      .catch((error: unknown) => {
        throw toWorkspaceHttpError(error);
      });

    res.json({ member: toMemberDto(member) });
  })
);

/** A supervisor or captain toggles their own availability (not access). */
router.put(
  "/events/:eventId/members/me/availability",
  asyncHandler(async (req: AuthRequest, res) => {
    const access = await loadEventAccess(req, req.params.eventId);
    requirePlanApproved(access);
    if (!access.membership || !hasEventRole(access, [EventMemberRole.FLEET_SUPERVISOR, EventMemberRole.CAPTAIN])) {
      throw new HttpError(403, "Only supervisors and captains set availability");
    }
    const body = memberAvailabilitySchema.parse(req.body);
    const member = await prisma.$transaction(async (tx) => {
      const updated = await tx.eventMembership.update({
        where: { id: access.membership!.id },
        data: { available: body.available },
        select: MEMBER_SELECT
      });
      await writeWorkspaceAudit(tx, req, {
        action: "workspace.member.availability",
        entityType: "EVENT_MEMBERSHIP",
        entityId: updated.id,
        eventId: access.event.id,
        after: { available: body.available }
      });
      return updated;
    }, WORKSPACE_TRANSACTION);
    res.json({ member: toMemberDto(member) });
  })
);

router.get("/events/:eventId/updates", asyncHandler(async (req: AuthRequest, res) => {
  const access = await loadEventAccess(req, req.params.eventId);
  requirePermission(access, EventPermission.VIEW);
  const rows = await prisma.auditLog.findMany({
    where: { eventId: access.event.id, actorRole: { not: Role.GUEST }, action: { in: ["workspace.event.create", "workspace.event.update", "workspace.event.scope_change", "workspace.event.status", "workspace.plan.generate", "workspace.plan.approve", "workspace.member.add", "workspace.member.update", "workspace.dispatch", "workspace.dispatch.emergency"] } },
    select: { id: true, action: true, createdAt: true, actorUserId: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 50
  });
  const users = await prisma.user.findMany({ where: { id: { in: rows.flatMap(r => r.actorUserId ? [r.actorUserId] : []) } }, select: { id: true, name: true } });
  res.json({ updates: rows.map(row => ({ id: row.id, action: row.action, at: row.createdAt.toISOString(), actor: users.find(u => u.id === row.actorUserId)?.name ?? "System" })) });
}));

router.get("/events/:eventId/messaging-policy",asyncHandler(async(req:AuthRequest,res)=>{
  const access=await loadEventAccess(req,req.params.eventId);requirePlanApproved(access);requirePermission(access,EventPermission.VIEW);
  res.json({policy:eventMessagingPolicy(access)});
}));
router.put("/events/:eventId/messaging-policy",asyncHandler(async(req:AuthRequest,res)=>{
  const access=await loadEventAccess(req,req.params.eventId);requirePlanApproved(access);requirePermission(access,EventPermission.EDIT);requireNotSupport(access,"change messaging policy");
  if(!access.isOrgAdmin&&!hasEventRole(access,[EventMemberRole.LOGISTICS_MANAGER]))throw new HttpError(403,"Only the logistics manager or organization admin controls messaging");
  const body=messagingPolicySchema.parse(req.body),ids=[...new Set([...body.individualSenderIds,...body.groupSenderIds,...body.taskReceiverIds])];
  await prisma.$transaction(async tx=>{
    await lockRow(tx,"Event",access.event.id);
    const members=await tx.eventMembership.findMany({where:{eventId:access.event.id,userId:{in:ids},status:MembershipStatus.ACTIVE,permissions:{has:EventPermission.VIEW}},select:{userId:true}});
    if(members.length!==ids.length)throw new HttpError(400,"Messaging policy users must be active event members");
    await tx.event.update({where:{id:access.event.id},data:{messagingPolicy:body}});
    await writeWorkspaceAudit(tx,req,{action:"workspace.messaging_policy.update",entityType:"EVENT",entityId:access.event.id,eventId:access.event.id,after:body});
  },WORKSPACE_TRANSACTION);
  res.json({policy:body});
}));
router.get("/events/:eventId/invitations",asyncHandler(async(req:AuthRequest,res)=>{
  const access=await loadEventAccess(req,req.params.eventId);requirePlanApproved(access);requirePermission(access,EventPermission.INVITE);
  const invitations=await prisma.eventInvite.findMany({where:{eventId:access.event.id},select:{id:true,email:true,role:true,subteam:true,expiresAt:true,acceptedAt:true,revokedAt:true},orderBy:{createdAt:"desc"},take:200});
  res.json({invitations});
}));
router.post("/events/:eventId/invitations",asyncHandler(async(req:AuthRequest,res)=>{
  const access=await loadEventAccess(req,req.params.eventId);requirePlanApproved(access);requireEventOpen(access);
  const body=eventInviteSchema.parse(req.body);
  if(body.email===access.actor.email)throw new HttpError(403,"You cannot invite yourself");
  const target=await prisma.user.findUnique({where:{email:body.email},select:{id:true}});
  assertCanGrant(access,target?.id??"unregistered-invite",body.permissions,[body.role]);
  if(body.role===EventMemberRole.EXECUTIVE_VIEWER&&body.permissions.some(permission=>permission!==EventPermission.VIEW))throw new HttpError(400,"Executive viewer access is read-only");
  const token=randomBytes(32).toString("hex"),expiresAt=new Date(Date.now()+24*3600000);
  const invitation=await prisma.$transaction(async tx=>{
    const created=await tx.eventInvite.create({data:{eventId:access.event.id,email:body.email,tokenHash:createHash("sha256").update(token).digest("hex"),role:body.role,subteam:body.subteam??null,permissions:body.permissions,workScope:body.workScope??null,clientVisible:body.clientVisible??false,canReceive:body.canReceive??true,createdById:access.actor.id,expiresAt},select:{id:true,expiresAt:true}});
    await writeWorkspaceAudit(tx,req,{action:"workspace.invitation.create",entityType:"EVENT_INVITE",entityId:created.id,eventId:access.event.id,metadata:{role:body.role}});return created;
  },WORKSPACE_TRANSACTION);
  res.status(201).json({invitation:{...invitation,token}});
}));
router.post("/events/:eventId/invitations/:inviteId/revoke",asyncHandler(async(req:AuthRequest,res)=>{
  const access=await loadEventAccess(req,req.params.eventId);requirePermission(access,EventPermission.INVITE);requirePlanApproved(access);
  const invite=await prisma.eventInvite.findFirst({where:{id:String(req.params.inviteId),eventId:access.event.id},select:{id:true,createdById:true,role:true,permissions:true}});
  if(!invite)throw new HttpError(404,"Invitation not found");assertCanGrant(access,invite.createdById===access.actor.id?"invitation-recipient":invite.createdById,invite.permissions,[invite.role]);
  await prisma.$transaction(async tx=>{
    const changed=await tx.eventInvite.updateMany({where:{id:invite.id,acceptedAt:null,revokedAt:null},data:{revokedAt:new Date()}});
    if(changed.count!==1)throw new HttpError(409,"Invitation is no longer pending");
    await writeWorkspaceAudit(tx,req,{action:"workspace.invitation.revoke",entityType:"EVENT_INVITE",entityId:invite.id,eventId:access.event.id});
  },WORKSPACE_TRANSACTION);res.json({revoked:true});
}));
router.post("/invitations/accept",asyncHandler(async(req:AuthRequest,res)=>{
  const {token}=z.object({token:z.string().regex(/^[a-f0-9]{64}$/)}).strict().parse(req.body),user=req.user!;
  const accepted=await prisma.$transaction(async tx=>{
    const invite=await tx.eventInvite.findUnique({where:{tokenHash:createHash("sha256").update(token).digest("hex")}});
    if(!invite||invite.email!==user.email||invite.expiresAt<=new Date()||invite.acceptedAt||invite.revokedAt||invite.createdById===user.id)throw new HttpError(404,"Invitation is unavailable");
    await lockRow(tx,"Event",invite.eventId);
    const grantor=await tx.user.findUnique({where:{id:invite.createdById},select:{id:true,email:true,role:true}});
    if(!grantor)throw new HttpError(404,"Invitation is unavailable");
    const eventMember=await tx.eventMembership.findUnique({where:{eventId_userId:{eventId:invite.eventId,userId:grantor.id}},select:{id:true}});
    if(eventMember)await lockRow(tx,"EventMembership",eventMember.id);
    const access=await loadEventAccess(req,invite.eventId,tx,grantor);requirePlanApproved(access);requireEventOpen(access);
    const orgMember=await tx.organizationMembership.findUnique({where:{organizationId_userId:{organizationId:access.event.organizationId,userId:grantor.id}},select:{id:true}});
    if(orgMember)await lockRow(tx,"OrganizationMembership",orgMember.id);
    const current=await loadEventAccess(req,invite.eventId,tx,grantor);
    assertCanGrant(current,user.id,invite.permissions,[invite.role]);await assertRolePrerequisites(user.id,invite.role,tx);
    if(invite.role===EventMemberRole.EXECUTIVE_VIEWER&&invite.permissions.some(permission=>permission!==EventPermission.VIEW))throw new HttpError(403,"Executive viewer access is read-only");
    if(await tx.eventMembership.findUnique({where:{eventId_userId:{eventId:invite.eventId,userId:user.id}},select:{id:true}}))throw new HttpError(409,"You already have an event membership; ask its manager to update it");
    const changed=await tx.eventInvite.updateMany({where:{id:invite.id,acceptedAt:null,revokedAt:null,expiresAt:{gt:new Date()}},data:{acceptedAt:new Date()}});if(changed.count!==1)throw new HttpError(409,"Invitation changed");
    await tx.eventMembership.create({data:{eventId:invite.eventId,userId:user.id,role:invite.role,subteam:invite.subteam,permissions:invite.permissions,workScope:invite.workScope,clientVisible:invite.clientVisible,canReceive:invite.canReceive,grantedById:grantor.id}});
    await writeWorkspaceAudit(tx,req,{action:"workspace.invitation.accept",entityType:"EVENT_INVITE",entityId:invite.id,eventId:invite.eventId});return{eventId:invite.eventId};
  },WORKSPACE_TRANSACTION).catch((error:unknown)=>{throw toWorkspaceHttpError(error);});
  res.json(accepted);
}));

export default router;
