import {
  EventMemberRole,
  EventPermission,
  MembershipStatus,
  OrganizationRole,
  Prisma,
  Role,
  SupplierCategory
} from "@prisma/client";
import type { Request } from "express";
import type {
  EventPlanDto,
  EventScopeField,
  WorkspaceEventDto
} from "../../../shared/overhaul.js";
import { prisma } from "../db.js";
import { calculateShuttleVehicles, calculateVipCars } from "../services/logisticsRules.js";
import { toAuditJson } from "../services/auditLog.js";
import type { AuthRequest, AuthenticatedUser } from "../types/auth.js";
import { HttpError } from "./http.js";
import { databaseSchemaName } from "./supplierPortal.js";

/**
 * FULL-OVERHAUL-M2 workspace authorization. Access to an organization-bound
 * event comes only from data: an ACTIVE organization OWNER/ADMIN membership
 * in the event's organization, or an ACTIVE explicit event membership with
 * its granular permissions. A login role alone (LOGISTICS_MANAGER,
 * ORGANIZER, ...) never grants anything here, so the legacy global-LM
 * convention cannot reach new organization data.
 *
 * - Legacy events (organizationId null) are not served by /workspace; they
 *   keep their existing scope on the legacy routes.
 * - SUPER_ADMIN without a membership gets audited support access: every such
 *   request writes an audit row first and fails closed if it cannot. Support
 *   access cannot sign, approve, dispatch or see masked guest details.
 * - Inaccessible and missing events answer the same 404.
 */

export const ALL_PERMISSIONS: readonly EventPermission[] = [
  EventPermission.VIEW,
  EventPermission.EDIT,
  EventPermission.INVITE,
  EventPermission.SCOPE
];

const ORG_ADMIN_ROLES: readonly OrganizationRole[] = [OrganizationRole.OWNER, OrganizationRole.ADMIN];

/** Event roles that act for the organizer side (Organizer->LM flow). */
export const ORGANIZER_SIDE_ROLES: readonly EventMemberRole[] = [
  EventMemberRole.PROJECT_MANAGER,
  EventMemberRole.OPERATIONS_MANAGER,
  EventMemberRole.PRODUCTION_MANAGER,
  EventMemberRole.CLIENT_VIEWER
];

/** Event roles that run operations and telemetry. */
export const OPERATIONS_ROLES: readonly EventMemberRole[] = [
  EventMemberRole.PROJECT_MANAGER,
  EventMemberRole.LOGISTICS_MANAGER,
  EventMemberRole.OPERATIONS_MANAGER,
  EventMemberRole.PRODUCTION_MANAGER,
  EventMemberRole.FLEET_SUPERVISOR
];

/** Event roles that may manage the fleet (vehicles, trips, shifts). */
export const FLEET_ROLES: readonly EventMemberRole[] = [
  EventMemberRole.LOGISTICS_MANAGER,
  EventMemberRole.FLEET_SUPERVISOR
];

export const WORKSPACE_EVENT_SELECT = {
  id: true,
  organizationId: true,
  organizerId: true,
  name: true,
  brief: true,
  venue: true,
  venueLat: true,
  venueLng: true,
  locationLabel: true,
  hotelZone: true,
  planningMode: true,
  operationalStatus: true,
  vipGuestCount: true,
  regularGuestCount: true,
  carCount: true,
  startAt: true,
  endAt: true,
  arrivalStartAt: true,
  departureEndAt: true,
  approvedPlanId: true,
  planApprovedAt: true,
  contractSignedAt: true
} satisfies Prisma.EventSelect;

export type WorkspaceEventRow = Prisma.EventGetPayload<{ select: typeof WORKSPACE_EVENT_SELECT }>;
export type OrgEventRow = WorkspaceEventRow & { organizationId: string };

export type EventMembershipView = {
  id: string;
  role: EventMemberRole;
  permissions: EventPermission[];
  canReceive: boolean;
  available: boolean;
};

export type EventAccess = {
  actor: AuthenticatedUser;
  event: OrgEventRow;
  organizationRole: OrganizationRole | null;
  membership: EventMembershipView | null;
  isOrgAdmin: boolean;
  support: boolean;
  /** The actor's own login Guest row in this event, if any. */
  guestId: string | null;
  permissions: ReadonlySet<EventPermission>;
};

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function eventNotFound() {
  return new HttpError(404, "Event not found");
}

export function parseRouteId(value: unknown, notFound: () => HttpError) {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) throw notFound();
  return value;
}

export function isOrgAdminRole(role: OrganizationRole | null | undefined) {
  return Boolean(role && ORG_ADMIN_ROLES.includes(role));
}

/** The actor's ACTIVE role in an organization, or null. */
export async function organizationRoleOf(userId: string, organizationId: string, db: Prisma.TransactionClient = prisma) {
  const membership = await db.organizationMembership.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    select: { role: true, status: true }
  });
  return membership?.status === MembershipStatus.ACTIVE ? membership.role : null;
}

/**
 * Resolves what the actor may do in one organization-bound event, or throws
 * the uniform 404. SUPER_ADMIN support access is audited before returning.
 */
export async function loadEventAccess(req: Request, eventIdRaw: unknown, db: Prisma.TransactionClient = prisma): Promise<EventAccess> {
  const actor = (req as AuthRequest).user;
  if (!actor) throw new HttpError(401, "Authentication required");
  const eventId = parseRouteId(eventIdRaw, eventNotFound);

  const event = await db.event.findUnique({ where: { id: eventId }, select: WORKSPACE_EVENT_SELECT });
  if (!event || !event.organizationId) throw eventNotFound();
  const orgEvent: OrgEventRow = { ...event, organizationId: event.organizationId };

  const [organizationRole, membershipRow, guest] = await Promise.all([
    organizationRoleOf(actor.id, orgEvent.organizationId, db),
    db.eventMembership.findUnique({
      where: { eventId_userId: { eventId, userId: actor.id } },
      select: { id: true, role: true, permissions: true, canReceive: true, available: true, status: true }
    }),
    db.guest.findFirst({ where: { eventId, userId: actor.id }, select: { id: true } })
  ]);

  const membership =
    membershipRow && membershipRow.status === MembershipStatus.ACTIVE
      ? {
          id: membershipRow.id,
          role: membershipRow.role,
          permissions: [...new Set(membershipRow.permissions)],
          canReceive: membershipRow.canReceive,
          available: membershipRow.available
        }
      : null;
  const isOrgAdmin = isOrgAdminRole(organizationRole);

  let permissions = new Set<EventPermission>();
  if (isOrgAdmin) permissions = new Set(ALL_PERMISSIONS);
  else if (membership) permissions = new Set(membership.permissions);

  let support = false;
  if (!isOrgAdmin && !membership && !guest) {
    if (actor.role !== Role.SUPER_ADMIN) throw eventNotFound();
    support = true;
    permissions = new Set(ALL_PERMISSIONS);
    // Fails closed: no audit, no support access.
    await writeWorkspaceAudit(db, req, {
      action: "workspace.support_access",
      entityType: "EVENT",
      entityId: eventId,
      eventId
    });
  }

  return {
    actor,
    event: orgEvent,
    organizationRole,
    membership,
    isOrgAdmin,
    support,
    guestId: guest?.id ?? null,
    permissions
  };
}

export function hasPermission(access: EventAccess, permission: EventPermission) {
  return access.permissions.has(permission);
}

export function requirePermission(access: EventAccess, permission: EventPermission) {
  if (!hasPermission(access, permission)) {
    throw new HttpError(403, `This action needs the ${permission} permission for the event`);
  }
}

/** Support access is read/administer only: never a principal of record. */
export function requireNotSupport(access: EventAccess, action: string) {
  if (access.support) throw new HttpError(403, `Support access cannot ${action}`);
}

/**
 * Team, permissions, inbox, dispatch and radar stay locked until a plan was
 * explicitly approved (423 Locked, also for direct API calls).
 */
export function requirePlanApproved(access: EventAccess) {
  if (!access.event.planApprovedAt || !access.event.approvedPlanId) {
    throw new HttpError(423, "Approve the event plan to unlock this workspace");
  }
}

export function requireEventOpen(access: EventAccess) {
  if (access.event.operationalStatus === "COMPLETED") {
    throw new HttpError(409, "The event is completed");
  }
}

export function requireContractUnsigned(event: Pick<WorkspaceEventRow, "contractSignedAt">) {
  if (event.contractSignedAt) {
    throw new HttpError(409, "The event contract is signed; its scope is locked");
  }
}

export function eventRoleOf(access: EventAccess) {
  return access.membership?.role ?? null;
}

export function hasEventRole(access: EventAccess, roles: readonly EventMemberRole[]) {
  const role = eventRoleOf(access);
  return Boolean(role && roles.includes(role));
}

/**
 * Who may change memberships: org admins and support (full set), or a
 * member holding INVITE who may only grant permissions it holds itself.
 * Nobody may create or change their own membership.
 */
export function assertCanGrant(
  access: EventAccess,
  targetUserId: string,
  requested: readonly EventPermission[],
  roles: readonly EventMemberRole[] = []
) {
  if (targetUserId === access.actor.id) {
    throw new HttpError(403, "You cannot change your own event access");
  }
  requirePermission(access, EventPermission.INVITE);
  if (access.isOrgAdmin || access.support) return;
  const manageable: Partial<Record<EventMemberRole, readonly EventMemberRole[]>> = {
    PROJECT_MANAGER: [EventMemberRole.LOGISTICS_MANAGER, EventMemberRole.OPERATIONS_MANAGER, EventMemberRole.PRODUCTION_MANAGER, EventMemberRole.FLEET_SUPERVISOR, EventMemberRole.COORDINATOR, EventMemberRole.CAPTAIN, EventMemberRole.CLIENT_VIEWER, EventMemberRole.VENDOR],
    LOGISTICS_MANAGER: [EventMemberRole.FLEET_SUPERVISOR, EventMemberRole.COORDINATOR, EventMemberRole.CAPTAIN, EventMemberRole.VENDOR],
    FLEET_SUPERVISOR: [EventMemberRole.COORDINATOR, EventMemberRole.CAPTAIN]
  };
  const allowed = access.membership ? manageable[access.membership.role] ?? [] : [];
  if (roles.length === 0 || roles.some(role => !allowed.includes(role))) {
    throw new HttpError(403, "You cannot manage this event role");
  }
  const missing = requested.filter((permission) => !access.permissions.has(permission));
  if (missing.length > 0) {
    throw new HttpError(403, "You cannot grant permissions you do not hold");
  }
}

// ---------------------------------------------------------------------------
// Audit and locking
// ---------------------------------------------------------------------------

type AuditDb = Pick<Prisma.TransactionClient, "auditLog">;

export type WorkspaceAuditEntry = {
  action: string;
  entityType: string;
  entityId: string;
  eventId?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, string | number | boolean | null>;
};

/**
 * Audit row written with the caller's client: inside a transaction it
 * commits or rolls back with the change it describes. Errors propagate.
 */
export async function writeWorkspaceAudit(db: AuditDb, req: Request, entry: WorkspaceAuditEntry) {
  const actor = (req as AuthRequest).user;
  if (!actor) throw new HttpError(401, "Authentication required");
  await db.auditLog.create({
    data: {
      actorUserId: actor.id,
      actorRole: actor.role,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      eventId: entry.eventId ?? null,
      beforeData: toAuditJson(entry.before),
      afterData: toAuditJson(entry.after),
      metadata: toAuditJson({ ...(entry.metadata ?? {}), method: req.method, path: req.originalUrl }),
      ipAddress: req.ip ?? null,
      userAgent: req.get("user-agent") ?? null
    }
  });
}

export type LockableTable =
  | "User"
  | "Event"
  | "EventMembership"
  | "EventPlan"
  | "OnboardingApplication"
  | "EventGuest"
  | "Trip"
  | "Vehicle";

/** Row lock for the rest of the transaction (schema from DATABASE_URL). */
export async function lockRow(tx: Prisma.TransactionClient, table: LockableTable, id: string) {
  const schema = databaseSchemaName();
  await tx.$queryRaw(
    Prisma.sql`SELECT "id" FROM ${Prisma.raw(`"${schema}"."${table}"`)} WHERE "id" = ${id} FOR UPDATE`
  );
}

export const WORKSPACE_TRANSACTION = { maxWait: 20_000, timeout: 30_000 };

/** Maps database conflicts to safe HTTP errors; other errors unchanged. */
export function toWorkspaceHttpError(error: unknown, conflict = "The request conflicts with the current state") {
  if (error instanceof HttpError) return error;
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return new HttpError(409, conflict);
  }
  return error;
}

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

function iso(value: Date | null | undefined) {
  return value ? new Date(value).toISOString() : null;
}

export function toEventDto(event: OrgEventRow, access: Pick<EventAccess, "permissions" | "membership" | "organizationRole" | "support" | "guestId">): WorkspaceEventDto {
  return {
    id: event.id,
    organizationId: event.organizationId,
    name: event.name,
    brief: event.brief,
    venue: event.venue,
    locationLabel: event.locationLabel,
    venueLat: event.venueLat,
    venueLng: event.venueLng,
    hotelZone: event.hotelZone,
    planningMode: event.planningMode,
    operationalStatus: event.operationalStatus,
    vipGuestCount: event.vipGuestCount,
    regularGuestCount: event.regularGuestCount,
    carCount: event.carCount,
    startAt: iso(event.startAt),
    endAt: iso(event.endAt),
    arrivalStartAt: iso(event.arrivalStartAt),
    departureEndAt: iso(event.departureEndAt),
    planApproved: Boolean(event.planApprovedAt && event.approvedPlanId),
    planApprovedAt: iso(event.planApprovedAt),
    approvedPlanId: event.approvedPlanId,
    contractSigned: Boolean(event.contractSignedAt),
    contractSignedAt: iso(event.contractSignedAt),
    access: {
      permissions: ALL_PERMISSIONS.filter((permission) => access.permissions.has(permission)),
      eventRole: access.membership?.role ?? null,
      organizationRole: access.organizationRole,
      support: access.support,
      guest: Boolean(access.guestId)
    }
  };
}

export const EVENT_PLAN_SELECT = {
  id: true,
  version: true,
  status: true,
  source: true,
  advisory: true,
  summary: true,
  content: true,
  approvedAt: true,
  createdAt: true,
  generatedBy: { select: { id: true, name: true } },
  approvedBy: { select: { id: true, name: true } }
} satisfies Prisma.EventPlanSelect;

export type EventPlanRow = Prisma.EventPlanGetPayload<{ select: typeof EVENT_PLAN_SELECT }>;

export const PLAN_SOURCE_LABELS: Record<EventPlanRow["source"], string> = {
  DETERMINISTIC_ADVISORY:
    "Deterministic advisory fallback (rules-based, not AI provider output). Review before approving.",
  AI_PROVIDER: "AI provider advisory. Review before approving.",
  MANUAL: "Manual plan entered by the event team."
};

export function toPlanDto(plan: EventPlanRow): EventPlanDto {
  return {
    id: plan.id,
    version: plan.version,
    status: plan.status,
    source: plan.source,
    advisory: plan.advisory,
    sourceLabel: PLAN_SOURCE_LABELS[plan.source],
    summary: plan.summary,
    content: plan.content,
    generatedBy: plan.generatedBy,
    approvedBy: plan.approvedBy,
    approvedAt: iso(plan.approvedAt),
    createdAt: new Date(plan.createdAt).toISOString()
  };
}

// ---------------------------------------------------------------------------
// Deterministic advisory plan (AI provider enhancement is M6)
// ---------------------------------------------------------------------------

type PlanInput = Pick<
  WorkspaceEventRow,
  | "vipGuestCount"
  | "regularGuestCount"
  | "carCount"
  | "hotelZone"
  | "locationLabel"
  | "venue"
  | "startAt"
  | "endAt"
  | "arrivalStartAt"
  | "departureEndAt"
>;

export function buildAdvisoryPlan(event: PlanInput) {
  const vipCars = calculateVipCars(event.vipGuestCount);
  const shuttleVehicles = calculateShuttleVehicles(event.regularGuestCount);
  const recommendedVehicles = vipCars + shuttleVehicles;
  const hotelRooms = event.vipGuestCount + Math.ceil(event.regularGuestCount / 2);
  const totalGuests = event.vipGuestCount + event.regularGuestCount;

  const warnings: string[] = [];
  if (event.carCount < recommendedVehicles) {
    warnings.push(
      `Requested ${event.carCount} cars; the rules suggest ${recommendedVehicles} (${vipCars} VIP, ${shuttleVehicles} shuttle).`
    );
  }
  if (!event.hotelZone) warnings.push("No hotel zone is set; hotel allocation is unscoped.");
  if (!event.arrivalStartAt) warnings.push("No arrival window is set; airport staffing is unscheduled.");

  const phases = [
    { subteam: "AIRPORT", name: "Arrivals and meet-and-greet", startsAt: iso(event.arrivalStartAt ?? event.startAt) },
    { subteam: "HOTELS", name: "Hotel check-in and room allocation", startsAt: iso(event.arrivalStartAt ?? event.startAt) },
    { subteam: "VENUE", name: "Venue operations", startsAt: iso(event.startAt) },
    { subteam: "TRANSPORT", name: "Departures", startsAt: iso(event.endAt) }
  ];

  return {
    summary: `Advisory plan for ${totalGuests} guests (${event.vipGuestCount} VIP): ${recommendedVehicles} vehicles and ${hotelRooms} hotel rooms near ${event.hotelZone ?? event.locationLabel ?? event.venue}.`,
    content: {
      generator: "midyaf-deterministic-rules/v1",
      disclaimer:
        "Deterministic advisory fallback computed from the event inputs. It is not AI provider output and is not operational until explicitly approved.",
      guests: { vip: event.vipGuestCount, regular: event.regularGuestCount, total: totalGuests },
      vehicles: { vip: vipCars, shuttle: shuttleVehicles, recommended: recommendedVehicles, requested: event.carCount },
      hotelRooms,
      logistics: { phases, arrivalStartAt: iso(event.arrivalStartAt), departureEndAt: iso(event.departureEndAt) },
      hotelDistribution: { zone: event.hotelZone, vipSingleRooms: event.vipGuestCount, regularTwinRooms: Math.ceil(event.regularGuestCount / 2), totalRooms: hotelRooms },
      vehicleRequirements: { vip: vipCars, shuttle: shuttleVehicles, total: recommendedVehicles },
      teamRequirements: phases.map(phase => ({ subteam: phase.subteam, minimumPeople: Math.max(1, Math.ceil(totalGuests / 50)) })),
      scopeOfWork: phases.map(phase => phase.name),
      phases,
      warnings
    }
  };
}

// ---------------------------------------------------------------------------
// Pre-contract scope changes and vendor notifications
// ---------------------------------------------------------------------------

const ALL_CATEGORIES = Object.values(SupplierCategory);

/** Vendor categories affected by each scope field. */
export const SCOPE_FIELD_CATEGORIES: Record<EventScopeField, readonly SupplierCategory[]> = {
  locationLabel: ALL_CATEGORIES,
  venue: ALL_CATEGORIES,
  venueLat: ALL_CATEGORIES,
  venueLng: ALL_CATEGORIES,
  hotelZone: [SupplierCategory.HOTEL],
  vipGuestCount: [SupplierCategory.HOTEL, SupplierCategory.CAR, SupplierCategory.TICKET, SupplierCategory.CATERING],
  regularGuestCount: [SupplierCategory.HOTEL, SupplierCategory.CAR, SupplierCategory.TICKET, SupplierCategory.CATERING],
  carCount: [SupplierCategory.CAR],
  startAt: ALL_CATEGORIES,
  endAt: ALL_CATEGORIES,
  arrivalStartAt: ALL_CATEGORIES,
  departureEndAt: ALL_CATEGORIES
};

export function categoriesForScopeChange(fields: readonly EventScopeField[]) {
  const categories = new Set<SupplierCategory>();
  for (const field of fields) for (const category of SCOPE_FIELD_CATEGORIES[field]) categories.add(category);
  return categories;
}

/**
 * Active VENDOR members of this event who receive messages and belong to an
 * ACTIVE vendor organization in a matching category. Bounded by `limit`.
 */
export async function matchingVendorRecipients(
  tx: Prisma.TransactionClient,
  eventId: string,
  categories: ReadonlySet<SupplierCategory>,
  limit: number
) {
  if (categories.size === 0) return [];
  const members = await tx.eventMembership.findMany({
    where: { eventId, role: EventMemberRole.VENDOR, status: MembershipStatus.ACTIVE, canReceive: true },
    select: {
      userId: true,
      user: {
        select: {
          organizationMemberships: {
            where: { status: MembershipStatus.ACTIVE, organization: { kind: "VENDOR" } },
            select: { organization: { select: { vendorCategory: true } } }
          }
        }
      }
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }]
  });

  return members
    .filter((member) =>
      member.user.organizationMemberships.some(
        (entry) => entry.organization.vendorCategory && categories.has(entry.organization.vendorCategory)
      )
    )
    .slice(0, limit)
    .map((member) => member.userId);
}

/** Active event members holding one of `roles` (for recipients/viewers). */
export async function activeMembersWithRoles(
  db: Pick<Prisma.TransactionClient, "eventMembership">,
  eventId: string,
  userIds: readonly string[],
  roles?: readonly EventMemberRole[]
) {
  if (userIds.length === 0) return [];
  return db.eventMembership.findMany({
    where: {
      eventId,
      userId: { in: [...userIds] },
      status: MembershipStatus.ACTIVE,
      ...(roles ? { role: { in: [...roles] } } : {})
    },
    select: {
      id: true,
      userId: true,
      role: true,
      canReceive: true,
      available: true,
      user: { select: { id: true, name: true, role: true } }
    }
  });
}
