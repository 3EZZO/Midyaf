import { Prisma } from "@prisma/client";

/**
 * Test-only in-memory stand-in for the subset of Prisma Client used by the
 * SUPPLIER-001, OPS-COLLAB-001 and FULL-OVERHAUL-M2 routes. It applies
 * where/select/include/orderBy/cursor/take, nested creates, declared column
 * defaults, compound unique keys (raising P2002) and interactive
 * transactions that roll back on error. Undefined write fields are ignored,
 * as in Prisma. It is deliberately small: unsupported query shapes throw
 * instead of silently matching.
 */

type Row = Record<string, any>;

export type RelationSpec = {
  model: string;
  kind: "one" | "many";
  /** Field on this model (one) or on the related model (many). */
  local: string;
  foreign: string;
};

export type ModelSpec = {
  relations?: Record<string, RelationSpec>;
  /** Compound unique keys; rows with a null in the key are exempt. */
  unique?: string[][];
  /** Column defaults the database would apply on insert. */
  defaults?: Record<string, unknown>;
};

export type MemorySchema = Record<string, ModelSpec>;

export type MemoryCall = { model: string; method: string; args: any };

const one = (model: string, local: string, foreign = "id"): RelationSpec => ({
  model,
  kind: "one",
  local,
  foreign
});
const many = (model: string, foreign: string, local = "id"): RelationSpec => ({
  model,
  kind: "many",
  local,
  foreign
});

/** Relations of the application models the new routes touch. */
export const MIDYAF_MEMORY_SCHEMA: MemorySchema = {
  user: {
    unique: [["email"]],
    defaults: { onboardingPending: false, onboardingKind: null },
    relations: {
      driverProfile: { model: "driver", kind: "one", local: "id", foreign: "userId" },
      supplierProfile: { model: "supplier", kind: "one", local: "id", foreign: "userId" },
      guestProfiles: many("guest", "userId"),
      organizationMemberships: many("organizationMembership", "userId"),
      eventMemberships: many("eventMembership", "userId")
    }
  },
  event: {
    relations: {
      city: one("cityConfig", "cityId"),
      guests: many("guest", "eventId"),
      organizer: one("user", "organizerId"),
      bookings: many("booking", "eventId"),
      tasks: many("task", "eventId"),
      organization: one("organization", "organizationId"),
      memberships: many("eventMembership", "eventId"),
      plans: many("eventPlan", "eventId")
    },
    unique: [["approvedPlanId"]],
    defaults: {
      operationalStatus: "PLANNING",
      planningMode: "MANUAL",
      vipGuestCount: 0,
      regularGuestCount: 0,
      carCount: 0,
      messagingPolicy: null,
      organizationId: null,
      approvedPlanId: null,
      planApprovedAt: null,
      contractSignedAt: null,
      contractSignedById: null,
      startAt: null,
      endAt: null,
      arrivalStartAt: null,
      departureEndAt: null,
      locationLabel: null,
      hotelZone: null
    }
  },
  guest: { relations: { user: one("user", "userId"), event: one("event", "eventId") } },
  driver: { relations: { user: one("user", "userId") } },
  task: {
    relations: {
      event: one("event", "eventId"),
      driver: one("driver", "driverId"),
      guest: one("guest", "guestId"),
      conversation: one("conversation", "conversationId"),
      trip: one("trip", "id", "taskId"),
      responsibleUser: one("user", "responsibleUserId"),
      delegateUser: one("user", "delegateUserId"),
      handovers: many("taskHandover", "taskId")
    }
  },
  taskHandover: {
    relations: {
      task: one("task", "taskId"),
      fromUser: one("user", "fromUserId"),
      toUser: one("user", "toUserId"),
      actor: one("user", "actorUserId")
    }
  },
  cityConfig: {},
  supplier: {
    relations: {
      user: one("user", "userId"),
      city: one("cityConfig", "cityId"),
      services: many("service", "supplierId"),
      bookings: many("booking", "supplierId"),
      quotes: many("vendorQuote", "supplierId")
    }
  },
  service: { relations: { supplier: one("supplier", "supplierId") } },
  booking: {
    relations: {
      event: one("event", "eventId"),
      supplier: one("supplier", "supplierId"),
      service: one("service", "serviceId")
    }
  },
  activityIntake: {},
  vendorQuote: {
    relations: { supplier: one("supplier", "supplierId") },
    unique: [["supplierId", "intakeId", "category"]]
  },
  supplierRequestNote: {
    relations: {
      supplier: one("supplier", "supplierId"),
      author: one("user", "authorUserId"),
      intake: one("activityIntake", "intakeId")
    }
  },
  vaultSession: { unique: [["intakeId"]] },
  vendorContract: {},
  auditLog: {},
  notification: {},
  conversation: {
    unique: [["dedupeKey"]],
    relations: {
      createdBy: one("user", "createdById"),
      participants: many("conversationParticipant", "conversationId"),
      messages: many("conversationMessage", "conversationId")
      ,tasks: many("task", "conversationId")
    }
  },
  conversationParticipant: {
    relations: {
      conversation: one("conversation", "conversationId"),
      user: one("user", "userId")
    },
    unique: [["conversationId", "userId"]]
  },
  conversationMessage: {
    unique: [["senderId","clientRequestId"]],
    relations: {
      conversation: one("conversation", "conversationId"),
      sender: one("user", "senderId")
    }
  },
  // Collections the generic bootstrap reads (empty in the privacy tests).
  commissionConfig: {},
  aiLogisticsPlan: {},
  guestJourneyRecord: {},
  coordinatorRequest: {},
  companyReport: {},
  fileAsset: {},
  hospitalityRider: {},

  // FULL-OVERHAUL-M2 models.
  organization: {
    relations: {
      memberships: many("organizationMembership", "organizationId"),
      events: many("event", "organizationId")
    },
    unique: [["slug"]],
    defaults: { vendorCategory: null, createdById: null }
  },
  organizationMembership: {
    relations: { organization: one("organization", "organizationId"), user: one("user", "userId") },
    unique: [["organizationId", "userId"]],
    defaults: { role: "MEMBER", status: "ACTIVE", grantedById: null }
  },
  eventMembership: {
    relations: { event: one("event", "eventId"), user: one("user", "userId") },
    unique: [["eventId", "userId"]],
    defaults: {
      subteam: null,
    workScope: null,
      permissions: ["VIEW"],
      clientVisible: false,
      canReceive: true,
      available: true,
      status: "ACTIVE",
      grantedById: null
    }
  },
  eventInvite: { relations: { event: one("event", "eventId") }, unique: [["tokenHash"]], defaults: { acceptedAt:null, revokedAt:null, subteam:null, workScope:null, clientVisible:false, canReceive:true } },
  eventPlan: {
    relations: {
      event: one("event", "eventId"),
      generatedBy: one("user", "generatedById"),
      approvedBy: one("user", "approvedById")
    },
    unique: [["eventId", "version"]],
    defaults: { status: "DRAFT", advisory: true, approvedById: null, approvedAt: null }
  },
  eventScopeChange: { defaults: { notifiedVendorCount: 0 } },
  onboardingApplication: {
    relations: {
      applicant: one("user", "applicantUserId"),
      documents: many("onboardingDocument", "applicationId"),
      transitions: many("onboardingTransition", "applicationId"),
      organization: one("organization", "organizationId")
    },
    unique: [["organizationId"]],
    defaults: {
      status: "SUBMITTED",
      organizationId: null,
      reviewerUserId: null,
      decisionNote: null,
      contractSignedAt: null,
      contractSignedById: null,
      activatedAt: null,
      reviewStartedAt: null,
      decidedAt: null
    }
  },
  onboardingTransition: {
    relations: { application: one("onboardingApplication", "applicationId"), actor: one("user", "actorUserId") },
    defaults: { note: null }
  },
  onboardingDocument: { relations: { application: one("onboardingApplication", "applicationId") } },
  eventGuest: {
    relations: {
      event: one("event", "eventId"),
      guest: one("guest", "guestId"),
      privacyGrants: many("guestPrivacyGrant", "eventGuestId"),
      tripSeats: many("tripPassenger", "eventGuestId")
    },
    unique: [["eventId", "guestCode"], ["guestId"]],
    defaults: {
      isVip: false,
      privacyMasked: false,
      privacyGroup: null,
      guestId: null,
      contactPhone: null,
      contactEmail: null,
      roomType: null,
      hotelName: null,
      arrivalAt: null,
      departureAt: null,
      ticketNumber: null,
      originCity: null,
      arrivalCity: null,
      departureCity: null
    }
  },
  guestPrivacyGrant: {
    relations: { eventGuest: one("eventGuest", "eventGuestId"), viewer: one("user", "viewerUserId") },
    unique: [["eventGuestId", "viewerUserId"], ["eventId", "groupKey", "viewerUserId"]],
    defaults: { eventGuestId: null, groupKey: null }
  },
  dispatchRecord: {
    relations: {
      task: one("task", "taskId"),
      conversation: one("conversation", "conversationId"),
      alertConversation: one("conversation", "alertConversationId")
    },
    unique: [["senderUserId", "clientRequestId"], ["taskId"]]
  },
  vehicle: {
    relations: { driver: one("driver", "driverId"), event: one("event", "eventId") },
    unique: [["eventId", "plateNumber"]],
    defaults: {
      status: "AVAILABLE",
      capacity: 4,
      inZone: true,
      driverId: null,
      lastLat: null,
      lastLng: null,
      lastSeenAt: null
    }
  },
  trip: {
    relations: {
      driver: one("driver", "driverId"),
      vehicle: one("vehicle", "vehicleId"),
      task: one("task", "taskId"),
      passengers: many("tripPassenger", "tripId")
    },
    unique: [["taskId"]],
    defaults: {
      status: "SCHEDULED",
      etaSource: "UNAVAILABLE",
      vehicleId: null,
      driverId: null,
      taskId: null,
      routePolyline: null,
      inZone: null,
      captainEtaMinutes: null,
      destinationEtaMinutes: null,
      etaUpdatedAt: null,
      originLat: null,
      originLng: null,
      destinationLat: null,
      destinationLng: null,
      startedAt: null,
      completedAt: null
    }
  },
  tripPassenger: {
    relations: { trip: one("trip", "tripId"), eventGuest: one("eventGuest", "eventGuestId") },
    unique: [["tripId", "eventGuestId"]]
  },
  flight: {
    defaults: { status: "SCHEDULED", dataSource: "MANUAL", eventId: null, airline: null, estimatedAt: null }
  },
  captainShift: {
    relations: { driver: one("driver", "driverId") },
    defaults: { status: "SCHEDULED", available: true, zoneLabel: null }
  },
  densitySample: { defaults: { capacity: null, source: "MANUAL" } }
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

/** Prisma ignores undefined fields in write data. */
function defined(data: Row): Row {
  return clone(Object.fromEntries(Object.entries(data ?? {}).filter(([, value]) => value !== undefined)));
}

function isObject(value: unknown): value is Row {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date);
}

function compare(a: unknown, b: unknown) {
  const left = a instanceof Date ? a.getTime() : a;
  const right = b instanceof Date ? b.getTime() : b;
  if (left === right) return 0;
  if (left === null || left === undefined) return -1;
  if (right === null || right === undefined) return 1;
  return (left as number) < (right as number) ? -1 : 1;
}

function same(a: unknown, b: unknown) {
  return compare(a, b) === 0 && (a === null) === (b === null);
}

export function createMemoryPrisma(schema: MemorySchema = MIDYAF_MEMORY_SCHEMA) {
  let db: Record<string, Row[]> = Object.fromEntries(Object.keys(schema).map((m) => [m, []]));
  const calls: MemoryCall[] = [];
  const failures = new Map<string, Error>();
  const hooks = new Map<string, () => void>();
  let sequence = 0;

  const table = (model: string) => {
    if (!db[model]) throw new Error(`memoryPrisma: unknown model ${model}`);
    return db[model];
  };

  function related(model: string, row: Row, name: string) {
    const spec = schema[model]?.relations?.[name];
    if (!spec) return undefined;
    if (spec.kind === "one") {
      const key = row[spec.local];
      if (key === null || key === undefined) return null;
      return table(spec.model).find((other) => other[spec.foreign] === key) ?? null;
    }
    return table(spec.model).filter((other) => other[spec.foreign] === row[spec.local]);
  }

  function matchesField(model: string, row: Row, key: string, cond: unknown): boolean {
    const relation = schema[model]?.relations?.[key];
    if (relation) {
      const value = related(model, row, key);
      if (relation.kind === "many") {
        const list = value as Row[];
        const where = cond as Row;
        if ("some" in where) return list.some((item) => matches(relation.model, item, where.some));
        if ("every" in where) return list.every((item) => matches(relation.model, item, where.every));
        if ("none" in where) return !list.some((item) => matches(relation.model, item, where.none));
        throw new Error(`memoryPrisma: unsupported list filter on ${model}.${key}`);
      }
      if (cond === null) return value === null;
      if (isObject(cond) && "is" in cond) return value ? matches(relation.model, value as Row, cond.is) : false;
      return value ? matches(relation.model, value as Row, cond as Row) : false;
    }

    const value = row[key];
    if (!isObject(cond)) {
      return cond === null ? value === null || value === undefined : same(value, cond);
    }

    return Object.entries(cond).every(([op, operand]) => {
      switch (op) {
        case "equals":
          return operand === null ? value === null || value === undefined : same(value, operand);
        case "not":
          if (isObject(operand)) return !matchesField(model, row, key, operand);
          return operand === null ? value !== null && value !== undefined : !same(value, operand);
        case "in":
          return (operand as unknown[]).some((item) => same(value, item));
        case "has":
          return Array.isArray(value) && value.some(item => same(item, operand));
        case "notIn":
          return !(operand as unknown[]).some((item) => same(value, item));
        case "gt":
          return value !== null && value !== undefined && compare(value, operand) > 0;
        case "gte":
          return value !== null && value !== undefined && compare(value, operand) >= 0;
        case "lt":
          return value !== null && value !== undefined && compare(value, operand) < 0;
        case "lte":
          return value !== null && value !== undefined && compare(value, operand) <= 0;
        case "contains": {
          if (typeof value !== "string") return false;
          const insensitive = (cond as Row).mode === "insensitive";
          return insensitive
            ? value.toLowerCase().includes(String(operand).toLowerCase())
            : value.includes(String(operand));
        }
        case "mode":
          return true;
        default:
          throw new Error(`memoryPrisma: unsupported operator ${op} on ${model}.${key}`);
      }
    });
  }

  function matches(model: string, row: Row, where: Row | undefined): boolean {
    if (!where) return true;
    return Object.entries(where).every(([key, cond]) => {
      if (cond === undefined) return true;
      if (key === "AND") return (cond as Row[]).every((part) => matches(model, row, part));
      if (key === "OR") return (cond as Row[]).some((part) => matches(model, row, part));
      if (key === "NOT") {
        const parts = Array.isArray(cond) ? cond : [cond];
        return !parts.some((part) => matches(model, row, part));
      }
      // Compound unique selector, e.g. conversationId_userId.
      if (key.includes("_") && isObject(cond) && !(key in row) && !schema[model]?.relations?.[key]) {
        return Object.entries(cond).every(([field, value]) => same(row[field], value));
      }
      return matchesField(model, row, key, cond);
    });
  }

  function sortRows(rows: Row[], orderBy: unknown) {
    if (!orderBy) return rows;
    const keys = (Array.isArray(orderBy) ? orderBy : [orderBy]) as Row[];
    return [...rows].sort((a, b) => {
      for (const entry of keys) {
        for (const [field, direction] of Object.entries(entry)) {
          const dir = isObject(direction) ? direction.sort : direction;
          const result = compare(a[field], b[field]);
          if (result !== 0) return dir === "desc" ? -result : result;
        }
      }
      return 0;
    });
  }

  function project(model: string, row: Row, args: Row = {}): Row {
    const { select, include } = args;
    const out: Row = {};
    if (select) {
      for (const [key, spec] of Object.entries(select as Row)) {
        if (!spec) continue;
        if (schema[model]?.relations?.[key]) {
          out[key] = projectRelation(model, row, key, spec === true ? {} : spec);
        } else {
          out[key] = clone(row[key]);
        }
      }
      return out;
    }
    for (const [key, value] of Object.entries(row)) out[key] = clone(value);
    for (const [key, spec] of Object.entries((include ?? {}) as Row)) {
      if (!spec) continue;
      out[key] = projectRelation(model, row, key, spec === true ? {} : spec);
    }
    return out;
  }

  function projectRelation(model: string, row: Row, name: string, spec: Row) {
    if (name === "_count") {
      return Object.fromEntries(Object.entries(spec.select ?? {}).map(([key]) => [key, (related(model, row, key) as Row[]).length]));
    }
    const relation = schema[model]!.relations![name]!;
    const value = related(model, row, name);
    if (relation.kind === "one") {
      return value ? project(relation.model, value as Row, spec) : null;
    }
    let list = (value as Row[]).filter((item) => matches(relation.model, item, spec.where));
    list = sortRows(list, spec.orderBy);
    if (typeof spec.take === "number") list = list.slice(0, spec.take);
    return list.map((item) => project(relation.model, item, spec));
  }

  function query(model: string, args: Row = {}) {
    let rows = sortRows(
      table(model).filter((row) => matches(model, row, args.where)),
      args.orderBy
    );
    if (args.cursor) {
      const index = rows.findIndex((row) => matches(model, row, args.cursor));
      rows = index === -1 ? [] : rows.slice(index);
    }
    if (typeof args.skip === "number") rows = rows.slice(args.skip);
    if (typeof args.take === "number") rows = rows.slice(0, args.take);
    return rows;
  }

  function assertUnique(model: string, candidate: Row, ignore?: Row) {
    for (const key of schema[model]?.unique ?? []) {
      if (key.some((field) => candidate[field] === null || candidate[field] === undefined)) continue;
      const clash = table(model).some(
        (row) => row !== ignore && key.every((field) => same(row[field], candidate[field]))
      );
      if (clash) {
        throw new Prisma.PrismaClientKnownRequestError(
          `Unique constraint failed on the fields: (${key.join(", ")})`,
          { code: "P2002", clientVersion: "memory" }
        );
      }
    }
  }

  function insert(model: string, data: Row): Row {
    const now = new Date();
    const scalars: Row = {};
    const nested: Array<[string, Row]> = [];
    for (const [key, value] of Object.entries(data)) {
      if (schema[model]?.relations?.[key] && isObject(value)) nested.push([key, value]);
      else scalars[key] = value instanceof Date ? new Date(value) : clone(value);
    }
    sequence += 1;
    const row: Row = {
      id: `${model}_${sequence}`,
      createdAt: now,
      updatedAt: now,
      ...(model === "onboardingApplication" ? { submittedAt: now } : {}),
      ...clone(schema[model]?.defaults ?? {}),
      ...Object.fromEntries(Object.entries(scalars).filter(([, value]) => value !== undefined))
    };
    assertUnique(model, row);
    table(model).push(row);

    for (const [name, value] of nested) {
      const relation = schema[model]!.relations![name]!;
      if (relation.kind !== "many" || !("create" in value)) {
        throw new Error(`memoryPrisma: unsupported nested write ${model}.${name}`);
      }
      const items = Array.isArray(value.create) ? value.create : [value.create];
      for (const item of items) insert(relation.model, { ...item, [relation.foreign]: row[relation.local] });
    }
    return row;
  }

  function failIfArmed(model: string, method: string) {
    const hook = hooks.get(`${model}.${method}`);
    if (hook) {
      hooks.delete(`${model}.${method}`);
      hook();
    }
    const error = failures.get(`${model}.${method}`);
    if (error) {
      failures.delete(`${model}.${method}`);
      throw error;
    }
  }

  function delegate(model: string) {
    const record = (method: string, args: any) => {
      calls.push({ model, method, args });
      failIfArmed(model, method);
    };
    return {
      findUnique: async (args: Row) => {
        record("findUnique", args);
        const row = query(model, { where: args.where })[0];
        return row ? project(model, row, args) : null;
      },
      findUniqueOrThrow: async (args: Row) => {
        record("findUniqueOrThrow", args);
        const row = query(model, { where: args.where })[0];
        if (!row) {
          throw new Prisma.PrismaClientKnownRequestError("No record was found.", {
            code: "P2025",
            clientVersion: "memory"
          });
        }
        return project(model, row, args);
      },
      findFirst: async (args: Row = {}) => {
        record("findFirst", args);
        const row = query(model, { ...args, take: 1 })[0];
        return row ? project(model, row, args) : null;
      },
      findMany: async (args: Row = {}) => {
        record("findMany", args);
        return query(model, args).map((row) => project(model, row, args));
      },
      count: async (args: Row = {}) => {
        record("count", args);
        return query(model, { where: args.where }).length;
      },
      create: async (args: Row) => {
        record("create", args);
        return project(model, insert(model, args.data), args);
      },
      createMany: async (args: Row) => {
        record("createMany", args);
        for (const data of args.data as Row[]) insert(model, data);
        return { count: (args.data as Row[]).length };
      },
      update: async (args: Row) => {
        record("update", args);
        const row = query(model, { where: args.where })[0];
        if (!row) {
          throw new Prisma.PrismaClientKnownRequestError("Record to update not found.", {
            code: "P2025",
            clientVersion: "memory"
          });
        }
        const next = { ...row, ...defined(args.data), updatedAt: new Date() };
        assertUnique(model, next, row);
        Object.assign(row, next);
        return project(model, row, args);
      },
      updateMany: async (args: Row) => {
        record("updateMany", args);
        const rows = query(model, { where: args.where });
        for (const row of rows) {
          const next = { ...row, ...defined(args.data), updatedAt: new Date() };
          assertUnique(model, next, row);
          Object.assign(row, next);
        }
        return { count: rows.length };
      },
      upsert: async (args: Row) => {
        record("upsert", args);
        const row = query(model, { where: args.where })[0];
        if (row) {
          Object.assign(row, clone(args.update), { updatedAt: new Date() });
          return project(model, row, args);
        }
        return project(model, insert(model, args.create), args);
      },
      delete: async (args: Row) => {
        record("delete", args);
        const row = query(model, { where: args.where })[0];
        if (!row) throw new Error("memoryPrisma: delete target missing");
        db[model] = table(model).filter((item) => item !== row);
        return project(model, row, {});
      },
      deleteMany: async (args: Row = {}) => {
        record("deleteMany", args);
        const doomed = new Set(query(model, { where: args.where }));
        db[model] = table(model).filter((item) => !doomed.has(item));
        return { count: doomed.size };
      }
    };
  }

  const client: Row = Object.fromEntries(Object.keys(schema).map((model) => [model, delegate(model)]));

  client.$queryRaw = async (strings: TemplateStringsArray | Prisma.Sql, ...values: unknown[]) => {
    calls.push({ model: "$raw", method: "$queryRaw", args: { strings, values } });
    failIfArmed("$raw", "$queryRaw");
    return [];
  };

  // Transactions run one at a time (like the row locks the routes take), so
  // a rollback can never discard another transaction's committed writes.
  let queue: Promise<unknown> = Promise.resolve();
  client.$transaction = (input: unknown) => {
    calls.push({ model: "$tx", method: "$transaction", args: {} });
    const run = async () => {
      const snapshot = clone(db);
      const sequenceBefore = sequence;
      try {
        if (typeof input === "function") return await (input as (tx: unknown) => unknown)(client);
        return await Promise.all(input as Array<Promise<unknown>>);
      } catch (error) {
        db = snapshot;
        sequence = sequenceBefore;
        throw error;
      }
    };
    const result = queue.then(run, run);
    queue = result.catch(() => undefined);
    return result;
  };

  return {
    prisma: client as any,
    calls,
    /** Live rows of one model (mutable, for assertions and setup). */
    rows: (model: string) => table(model),
    seed(data: Record<string, Row[]>) {
      db = Object.fromEntries(Object.keys(schema).map((m) => [m, []]));
      sequence = 0;
      calls.length = 0;
      failures.clear();
      hooks.clear();
      for (const [model, rows] of Object.entries(data)) {
        table(model).push(...rows.map((row) => ({ createdAt: new Date("2026-10-01T00:00:00Z"), ...row })));
      }
    },
    /** The next call of model.method throws this error (once). */
    failNext(model: string, method: string, error: Error) {
      failures.set(`${model}.${method}`, error);
    },
    /** Runs a side effect just before the next model.method call (once). */
    beforeNext(model: string, method: string, effect: () => void) {
      hooks.set(`${model}.${method}`, effect);
    },
    mutations: () =>
      calls.filter((call) =>
        ["create", "createMany", "update", "updateMany", "upsert", "delete", "deleteMany"].includes(call.method)
      )
  };
}

export type MemoryPrisma = ReturnType<typeof createMemoryPrisma>;

// ---------------------------------------------------------------------------
// FULL-OVERHAUL-M2 test world (synthetic, shared by the workspace tests)
// ---------------------------------------------------------------------------

type TestActor = { id: string; role: "SUPER_ADMIN" | "ORGANIZER" | "COMPANY_ORGANIZER" | "LOGISTICS_MANAGER" | "COORDINATOR" | "DRIVER" | "SUPPLIER" | "GUEST" };

/**
 * Two organizer companies (A, B), two vendor organizations (hotel, car), an
 * approved event A, an approved event B, an unapproved event A-locked and a
 * legacy organization-less event. Event roles are assigned explicitly; the
 * login roles are deliberately "wrong" in places (a global LM with no
 * membership) to prove that only memberships grant access.
 */
export function buildWorkspaceTestWorld() {
  const actors = {
    sa: { id: "u_sa", role: "SUPER_ADMIN" },
    owner: { id: "u_owner", role: "ORGANIZER" },
    admin2: { id: "u_admin2", role: "COMPANY_ORGANIZER" },
    orgMember: { id: "u_orgmember", role: "COMPANY_ORGANIZER" },
    pm: { id: "u_pm", role: "COMPANY_ORGANIZER" },
    lm: { id: "u_lm", role: "LOGISTICS_MANAGER" },
    lmOutsider: { id: "u_lm_out", role: "LOGISTICS_MANAGER" },
    sup: { id: "u_sup", role: "COORDINATOR" },
    sup2: { id: "u_sup2", role: "COORDINATOR" },
    cap: { id: "u_cap", role: "DRIVER" },
    capB: { id: "u_cap_b", role: "DRIVER" },
    client: { id: "u_client", role: "COMPANY_ORGANIZER" },
    vendor: { id: "u_vendor", role: "SUPPLIER" },
    vendorCar: { id: "u_vendor_car", role: "SUPPLIER" },
    guest: { id: "u_guest", role: "GUEST" },
    guestB: { id: "u_guest_b", role: "GUEST" },
    ownerB: { id: "u_owner_b", role: "ORGANIZER" }
  } satisfies Record<string, TestActor>;

  const approvedAt = new Date("2026-10-10T08:00:00Z");
  const event = (id: string, organizationId: string | null, organizerId: string, approvedPlanId: string | null) => ({
    id,
    organizationId,
    messagingPolicy: null,
    organizerId,
    name: `Synthetic ${id}`,
    brief: null,
    date: new Date("2026-11-01T06:00:00Z"),
    venue: "Synthetic Hall",
    venueLat: null,
    venueLng: null,
    locationLabel: "Synthetic district",
    hotelZone: "Synthetic hotel zone",
    status: "DRAFT",
    planningMode: "MANUAL",
    operationalStatus: "PLANNING",
    vipGuestCount: 2,
    regularGuestCount: 10,
    carCount: 4,
    startAt: new Date("2026-11-01T06:00:00Z"),
    endAt: new Date("2026-11-03T18:00:00Z"),
    arrivalStartAt: new Date("2026-10-31T06:00:00Z"),
    departureEndAt: new Date("2026-11-04T18:00:00Z"),
    approvedPlanId,
    planApprovedAt: approvedPlanId ? approvedAt : null,
    contractSignedAt: null,
    contractSignedById: null,
    timezone: "Asia/Riyadh",
    currency: "SAR"
  });

  const member = (
    eventId: string,
    userId: string,
    role: string,
    permissions: string[],
    extra: Record<string, unknown> = {}
  ) => ({
    id: `em_${eventId}_${userId}`,
    eventId,
    userId,
    role,
    subteam: null,
    workScope: null,
    permissions,
    clientVisible: false,
    canReceive: true,
    available: true,
    status: "ACTIVE",
    grantedById: "u_owner",
    updatedAt: new Date("2026-10-05T00:00:00Z"),
    ...extra
  });

  const rosterGuest = (id: string, eventId: string, guestCode: string, extra: Record<string, unknown> = {}) => ({
    id,
    eventId,
    guestCode,
    isVip: guestCode.startsWith("GV"),
    fullName: `Synthetic person ${guestCode}`,
    contactPhone: "+966500000000",
    contactEmail: `${guestCode.toLowerCase()}@example.test`,
    roomType: "Suite",
    hotelName: "Synthetic Hotel",
    arrivalAt: null,
    departureAt: null,
    ticketNumber: `T-${guestCode}`,
    originCity: "Jeddah",
    arrivalCity: "Riyadh",
    departureCity: "Riyadh",
    privacyMasked: false,
    privacyGroup: null,
    guestId: null,
    ...extra
  });

  const seed = {
    user: Object.values(actors).map((actor) => ({
      id: actor.id,
      role: actor.role,
      name: `Name ${actor.id}`,
      email: `${actor.id}@example.test`,
      phone: `+966${actor.id}`,
      passwordHash: "x"
    })),
    organization: [
      { id: "org_a", name: "Synthetic Organizer A", slug: "synthetic-a", kind: "ORGANIZER_COMPANY", vendorCategory: null },
      { id: "org_b", name: "Synthetic Organizer B", slug: "synthetic-b", kind: "ORGANIZER_COMPANY", vendorCategory: null },
      { id: "org_vh", name: "Synthetic Hotel Vendor", slug: "synthetic-vh", kind: "VENDOR", vendorCategory: "HOTEL" },
      { id: "org_vc", name: "Synthetic Car Vendor", slug: "synthetic-vc", kind: "VENDOR", vendorCategory: "CAR" }
    ],
    organizationMembership: [
      { id: "om_owner", organizationId: "org_a", userId: "u_owner", role: "OWNER", status: "ACTIVE" },
      { id: "om_admin2", organizationId: "org_a", userId: "u_admin2", role: "ADMIN", status: "ACTIVE" },
      { id: "om_member", organizationId: "org_a", userId: "u_orgmember", role: "MEMBER", status: "ACTIVE" },
      { id: "om_owner_b", organizationId: "org_b", userId: "u_owner_b", role: "OWNER", status: "ACTIVE" },
      { id: "om_vendor", organizationId: "org_vh", userId: "u_vendor", role: "OWNER", status: "ACTIVE" },
      { id: "om_vendor_car", organizationId: "org_vc", userId: "u_vendor_car", role: "OWNER", status: "ACTIVE" }
    ],
    event: [
      event("evt_a", "org_a", "u_owner", "plan_a1"),
      event("evt_b", "org_b", "u_owner_b", "plan_b1"),
      event("evt_locked", "org_a", "u_owner", null),
      event("evt_legacy", null, "u_owner", null)
    ],
    eventPlan: [
      { id: "plan_a1", eventId: "evt_a", version: 1, status: "APPROVED", source: "MANUAL", advisory: false, summary: "Synthetic plan", content: {}, generatedById: "u_pm", approvedById: "u_owner", approvedAt },
      { id: "plan_b1", eventId: "evt_b", version: 1, status: "APPROVED", source: "MANUAL", advisory: false, summary: "Synthetic plan", content: {}, generatedById: "u_owner_b", approvedById: "u_owner_b", approvedAt },
      { id: "plan_l1", eventId: "evt_locked", version: 1, status: "DRAFT", source: "DETERMINISTIC_ADVISORY", advisory: true, summary: "Synthetic draft", content: {}, generatedById: "u_owner", approvedById: null, approvedAt: null }
    ],
    eventMembership: [
      member("evt_a", "u_pm", "PROJECT_MANAGER", ["VIEW", "EDIT", "INVITE", "SCOPE"], { clientVisible: true }),
      member("evt_a", "u_lm", "LOGISTICS_MANAGER", ["VIEW", "EDIT", "INVITE"], { clientVisible: true }),
      member("evt_a", "u_sup", "FLEET_SUPERVISOR", ["VIEW", "EDIT"]),
      member("evt_a", "u_sup2", "FLEET_SUPERVISOR", ["VIEW"], { available: false }),
      member("evt_a", "u_cap", "CAPTAIN", ["VIEW"]),
      member("evt_a", "u_client", "CLIENT_VIEWER", ["VIEW"]),
      member("evt_a", "u_vendor", "VENDOR", ["VIEW"]),
      member("evt_a", "u_vendor_car", "VENDOR", ["VIEW"]),
      member("evt_b", "u_cap_b", "CAPTAIN", ["VIEW"]),
      member("evt_b", "u_lm", "LOGISTICS_MANAGER", ["VIEW"], { status: "REVOKED" }),
      member("evt_locked", "u_pm", "PROJECT_MANAGER", ["VIEW", "EDIT", "INVITE", "SCOPE"])
    ],
    driver: [
      { id: "drv_cap", userId: "u_cap", active: true, licenseNo: "L1", nationalIdIqama: "N1" },
      { id: "drv_cap_b", userId: "u_cap_b", active: true, licenseNo: "L2", nationalIdIqama: "N2" }
    ],
    guest: [
      { id: "gst_a", userId: "u_guest", eventId: "evt_a", qrCode: "Q1", isVIP: true },
      { id: "gst_b", userId: "u_guest_b", eventId: "evt_b", qrCode: "Q2", isVIP: false }
    ],
    eventGuest: [
      rosterGuest("eg_gv01", "evt_a", "GV01", { guestId: "gst_a" }),
      rosterGuest("eg_g01", "evt_a", "G01"),
      rosterGuest("eg_g02", "evt_a", "G02", { privacyMasked: true }),
      rosterGuest("eg_g03", "evt_a", "G03", { privacyMasked: true, privacyGroup: "press" }),
      rosterGuest("eg_b01", "evt_b", "G01", { guestId: "gst_b" })
    ],
    guestPrivacyGrant: [
      { id: "pg_g02_lm", eventId: "evt_a", eventGuestId: "eg_g02", groupKey: null, viewerUserId: "u_lm", grantedById: "u_owner" },
      { id: "pg_press_pm", eventId: "evt_a", eventGuestId: null, groupKey: "press", viewerUserId: "u_pm", grantedById: "u_owner" }
    ],
    vehicle: [
      { id: "veh_1", eventId: "evt_a", plateNumber: "SYN-1", label: "Synthetic sedan", capacity: 3, status: "ASSIGNED_TO_TASK", driverId: "drv_cap", lastLat: 24.7, lastLng: 46.6, lastSeenAt: null, inZone: true },
      { id: "veh_2", eventId: "evt_a", plateNumber: "SYN-2", label: "Synthetic shuttle", capacity: 12, status: "AVAILABLE", driverId: null, lastLat: 24.71, lastLng: 46.61, lastSeenAt: null, inZone: true }
    ],
    trip: [
      {
        id: "trip_1", eventId: "evt_a", vehicleId: "veh_1", driverId: "drv_cap", taskId: null, status: "SCHEDULED",
        originLabel: "Synthetic Hotel", originLat: null, originLng: null, destinationLabel: "Synthetic Hall",
        destinationLat: null, destinationLng: null, routePolyline: null, inZone: true, captainEtaMinutes: null,
        destinationEtaMinutes: null, etaSource: "UNAVAILABLE", etaUpdatedAt: null, scheduledAt: new Date("2026-11-01T05:00:00Z")
      },
      {
        id: "trip_2", eventId: "evt_a", vehicleId: "veh_2", driverId: null, taskId: null, status: "SCHEDULED",
        originLabel: "Synthetic Hotel", originLat: null, originLng: null, destinationLabel: "Synthetic Hall",
        destinationLat: null, destinationLng: null, routePolyline: null, inZone: true, captainEtaMinutes: null,
        destinationEtaMinutes: null, etaSource: "UNAVAILABLE", etaUpdatedAt: null, scheduledAt: new Date("2026-11-01T05:30:00Z")
      }
    ],
    tripPassenger: [
      { id: "tp_1", tripId: "trip_1", eventGuestId: "eg_gv01" },
      { id: "tp_2", tripId: "trip_2", eventGuestId: "eg_g02" }
    ]
  };

  return { actors, seed };
}
