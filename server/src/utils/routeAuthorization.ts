import { Role } from "@prisma/client";
import { prisma } from "../db.js";
import type { AuthenticatedUser } from "../types/auth.js";
import { HttpError } from "./http.js";

/**
 * T-08 route authorization helpers. Ownership is resolved server-side from
 * Event.organizerId, Guest.userId, Task.driverId/guestId, Driver.userId and
 * Booking.supplier.userId. There is no organization membership or
 * coordinator/event assignment model yet, so COORDINATOR gets no live record
 * access here, and the LM/SA global access below is the existing legacy
 * operational policy, not D-001 organization isolation.
 */

/** Existing global operational policy (legacy limitation, see T-08 matrix). */
export const LEGACY_OPERATOR_ROLES: Role[] = [
  Role.LOGISTICS_MANAGER,
  Role.SUPER_ADMIN
];

/** Roles that run event operations: legacy operators plus owning organizers. */
export const EVENT_OPERATOR_ROLES: Role[] = [
  ...LEGACY_OPERATOR_ROLES,
  Role.ORGANIZER
];

export function isLegacyOperator(user: AuthenticatedUser) {
  return LEGACY_OPERATOR_ROLES.includes(user.role);
}

export function assertRole(
  user: AuthenticatedUser,
  roles: Role[],
  message = "Insufficient permissions"
) {
  if (!roles.includes(user.role)) {
    throw new HttpError(403, message);
  }
}

/** Operational access: LM/SA for an existing event, ORGANIZER only for its own. */
export async function assertEventOperatorAccess(
  user: AuthenticatedUser,
  eventId: string
) {
  if (isLegacyOperator(user)) {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true }
    });
    if (!event) {
      throw new HttpError(404, "Event not found");
    }
    return;
  }

  if (user.role === Role.ORGANIZER) {
    const owned = await prisma.event.findFirst({
      where: { id: eventId, organizerId: user.id },
      select: { id: true }
    });
    if (owned) return;
  }

  throw new HttpError(403, "Event access denied");
}

/**
 * Read access to an event. These read rules never authorize operational
 * actions. COMPANY_ORGANIZER reuses the stored intake convention
 * (submittedBy matches the actor's email or profile name, linked existing
 * event), an imperfect legacy convention, alongside direct organizer
 * ownership.
 */
export async function canReadEvent(
  user: AuthenticatedUser,
  eventId: string
): Promise<boolean> {
  switch (user.role) {
    case Role.LOGISTICS_MANAGER:
    case Role.SUPER_ADMIN:
      return Boolean(
        await prisma.event.findUnique({
          where: { id: eventId },
          select: { id: true }
        })
      );
    case Role.ORGANIZER:
      return Boolean(
        await prisma.event.findFirst({
          where: { id: eventId, organizerId: user.id },
          select: { id: true }
        })
      );
    case Role.COMPANY_ORGANIZER: {
      // ActivityIntake.eventId has no foreign key, so a stale intake must not
      // authorize a missing event: the event has to exist first.
      const event = await prisma.event.findUnique({
        where: { id: eventId },
        select: { organizerId: true }
      });
      if (!event) return false;
      if (event.organizerId === user.id) return true;
      const intake = await prisma.activityIntake.findFirst({
        where: {
          eventId,
          submittedBy: { in: await submittedByValuesForUser(user) }
        },
        select: { id: true }
      });
      return Boolean(intake);
    }
    case Role.GUEST:
      return Boolean(
        await prisma.guest.findFirst({
          where: { eventId, userId: user.id },
          select: { id: true }
        })
      );
    case Role.DRIVER:
      return Boolean(
        await prisma.task.findFirst({
          where: { eventId, driver: { userId: user.id } },
          select: { id: true }
        })
      );
    case Role.SUPPLIER:
      return Boolean(
        await prisma.booking.findFirst({
          where: { eventId, supplier: { userId: user.id } },
          select: { id: true }
        })
      );
    default:
      // COORDINATOR: no assignment model, so fail closed.
      return false;
  }
}

/** Drivers assigned to an event by stored tasks. */
export async function driverIdsAssignedToEvent(eventId: string) {
  const tasks = await prisma.task.findMany({
    where: { eventId, driverId: { not: null } },
    select: { driverId: true }
  });

  return new Set(
    tasks
      .map((task) => task.driverId)
      .filter((id): id is string => Boolean(id))
  );
}

export type TelemetryScope =
  | { eventId?: undefined; driverIds?: undefined }
  | { eventId: string; driverIds: Set<string> };

/**
 * Live telemetry/geofence scope. LM/SA without an eventId keep the legacy
 * global view; any explicit eventId (required for ORGANIZER) must be an
 * accessible event, and results are limited to drivers it assigns.
 */
export async function resolveTelemetryScope(
  user: AuthenticatedUser,
  eventId: unknown
): Promise<TelemetryScope> {
  assertRole(user, EVENT_OPERATOR_ROLES);

  if (eventId === undefined && isLegacyOperator(user)) {
    return {};
  }

  if (typeof eventId !== "string" || !eventId) {
    throw new HttpError(400, "An eventId query parameter is required");
  }

  await assertEventOperatorAccess(user, eventId);
  return { eventId, driverIds: await driverIdsAssignedToEvent(eventId) };
}

export type RecordReferences = {
  eventIds: string[];
  guestIds: string[];
  driverIds: string[];
  taskIds: string[];
};

type ReferenceKind = keyof RecordReferences;

const ID_KEYS = new Map<string, ReferenceKind>([
  ["eventId", "eventIds"],
  ["guestId", "guestIds"],
  ["driverId", "driverIds"],
  ["taskId", "taskIds"],
  ["eventIds", "eventIds"],
  ["guestIds", "guestIds"],
  ["driverIds", "driverIds"],
  ["taskIds", "taskIds"]
]);

const OBJECT_KEYS = new Map<string, ReferenceKind>([
  ["event", "eventIds"],
  ["events", "eventIds"],
  ["guest", "guestIds"],
  ["guests", "guestIds"],
  ["driver", "driverIds"],
  ["drivers", "driverIds"],
  ["task", "taskIds"],
  ["tasks", "taskIds"]
]);

const MAX_CONTEXT_DEPTH = 8;
const MAX_CONTEXT_REFERENCES = 50;

/**
 * Collects record references anywhere in client-supplied context: the
 * eventId/guestId/driverId/taskId keys (and their plural arrays) plus the
 * `id` of nested event/guest/driver/task objects. Context nested too deeply
 * to inspect is rejected rather than forwarded unchecked.
 */
export function collectRecordReferences(value: unknown): RecordReferences {
  const found: Record<ReferenceKind, Set<string>> = {
    eventIds: new Set(),
    guestIds: new Set(),
    driverIds: new Set(),
    taskIds: new Set()
  };

  const add = (kind: ReferenceKind, id: unknown) => {
    if ((typeof id === "string" && id) || typeof id === "number") {
      found[kind].add(String(id));
    }
  };

  const visit = (node: unknown, depth: number) => {
    if (node === null || typeof node !== "object") return;
    if (depth > MAX_CONTEXT_DEPTH) {
      throw new HttpError(400, "Context is nested too deeply");
    }

    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1);
      return;
    }

    for (const [key, child] of Object.entries(node)) {
      const idKind = ID_KEYS.get(key);
      if (idKind) {
        for (const id of Array.isArray(child) ? child : [child]) add(idKind, id);
      }

      const objectKind = OBJECT_KEYS.get(key);
      if (objectKind) {
        for (const item of Array.isArray(child) ? child : [child]) {
          if (item && typeof item === "object" && !Array.isArray(item)) {
            add(objectKind, (item as { id?: unknown }).id);
          }
        }
      }

      visit(child, depth + 1);
    }
  };

  visit(value, 0);

  const refs: RecordReferences = {
    eventIds: [...found.eventIds],
    guestIds: [...found.guestIds],
    driverIds: [...found.driverIds],
    taskIds: [...found.taskIds]
  };

  const total =
    refs.eventIds.length +
    refs.guestIds.length +
    refs.driverIds.length +
    refs.taskIds.length;
  if (total > MAX_CONTEXT_REFERENCES) {
    throw new HttpError(400, "Context references too many records");
  }

  return refs;
}

export type AuthorizedReferences = {
  eventId?: string;
  guestIds: string[];
  driverIds: string[];
  taskIds: string[];
};

/**
 * Every referenced record must exist, belong to the single selected event (if
 * any) and be within the actor's own scope. A top-level event the actor may
 * read does not authorize unrelated nested guests, drivers or tasks.
 */
export async function authorizeRecordReferences(
  user: AuthenticatedUser,
  refs: RecordReferences
): Promise<AuthorizedReferences> {
  const deny = () =>
    new HttpError(403, "Context references a record outside your access");

  if (refs.eventIds.length > 1) {
    throw deny();
  }

  const eventId = refs.eventIds[0];
  const hasRecords =
    refs.guestIds.length > 0 ||
    refs.driverIds.length > 0 ||
    refs.taskIds.length > 0;

  if (eventId && !(await canReadEvent(user, eventId))) {
    throw deny();
  }

  if (hasRecords) {
    const recordRoles: Role[] = [
      ...EVENT_OPERATOR_ROLES,
      Role.GUEST,
      Role.DRIVER
    ];
    if (!recordRoles.includes(user.role)) {
      throw deny();
    }
    // An organizer's records are only reachable through its own event.
    if (user.role === Role.ORGANIZER && !eventId) {
      throw deny();
    }
  }

  for (const guestId of refs.guestIds) {
    const guest = await prisma.guest.findUnique({
      where: { id: guestId },
      select: { userId: true, eventId: true }
    });
    if (!guest || (eventId && guest.eventId !== eventId)) throw deny();
    if (user.role === Role.GUEST && guest.userId !== user.id) throw deny();
    if (user.role === Role.DRIVER) {
      const assigned = await prisma.task.findFirst({
        where: { guestId, driver: { userId: user.id } },
        select: { id: true }
      });
      if (!assigned) throw deny();
    }
  }

  for (const taskId of refs.taskIds) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: {
        eventId: true,
        guest: { select: { userId: true } },
        driver: { select: { userId: true } }
      }
    });
    if (!task || (eventId && task.eventId !== eventId)) throw deny();
    if (user.role === Role.GUEST && task.guest?.userId !== user.id) {
      throw deny();
    }
    if (user.role === Role.DRIVER && task.driver?.userId !== user.id) {
      throw deny();
    }
  }

  for (const driverId of refs.driverIds) {
    const driver = await prisma.driver.findUnique({
      where: { id: driverId },
      select: { userId: true }
    });
    if (!driver) throw deny();
    if (user.role === Role.DRIVER && driver.userId !== user.id) throw deny();

    if (eventId || user.role === Role.GUEST) {
      const assignment = await prisma.task.findFirst({
        where: {
          driverId,
          ...(eventId ? { eventId } : {}),
          ...(user.role === Role.GUEST ? { guest: { userId: user.id } } : {})
        },
        select: { id: true }
      });
      if (!assignment) throw deny();
    }
  }

  return {
    eventId,
    guestIds: refs.guestIds,
    driverIds: refs.driverIds,
    taskIds: refs.taskIds
  };
}

async function submittedByValuesForUser(user: AuthenticatedUser) {
  const profile = await prisma.user.findUnique({
    where: { id: user.id },
    select: { name: true }
  });

  return [
    ...new Set([user.email, profile?.name].filter((v): v is string => Boolean(v)))
  ];
}
