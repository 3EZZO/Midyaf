import { Prisma } from "@prisma/client";

/**
 * Test-only in-memory stand-in for the subset of Prisma Client used by the
 * SUPPLIER-001 and OPS-COLLAB-001 routes. It applies where/select/include/
 * orderBy/cursor/take, nested creates, compound unique keys (raising P2002)
 * and interactive transactions that roll back on error. It is deliberately
 * small: unsupported query shapes throw instead of silently matching.
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
    relations: {
      driverProfile: { model: "driver", kind: "one", local: "id", foreign: "userId" },
      supplierProfile: { model: "supplier", kind: "one", local: "id", foreign: "userId" },
      guestProfiles: many("guest", "userId")
    }
  },
  event: {
    relations: {
      organizer: one("user", "organizerId"),
      bookings: many("booking", "eventId"),
      tasks: many("task", "eventId")
    }
  },
  guest: { relations: { user: one("user", "userId"), event: one("event", "eventId") } },
  driver: { relations: { user: one("user", "userId") } },
  task: {
    relations: {
      event: one("event", "eventId"),
      driver: one("driver", "driverId"),
      guest: one("guest", "guestId"),
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
    relations: {
      createdBy: one("user", "createdById"),
      participants: many("conversationParticipant", "conversationId"),
      messages: many("conversationMessage", "conversationId")
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
    relations: {
      conversation: one("conversation", "conversationId"),
      sender: one("user", "senderId")
    }
  }
};

function clone<T>(value: T): T {
  return structuredClone(value);
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
      ...scalars
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
        const next = { ...row, ...clone(args.data), updatedAt: new Date() };
        assertUnique(model, next, row);
        Object.assign(row, next);
        return project(model, row, args);
      },
      updateMany: async (args: Row) => {
        record("updateMany", args);
        const rows = query(model, { where: args.where });
        for (const row of rows) Object.assign(row, clone(args.data), { updatedAt: new Date() });
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
        ["create", "createMany", "update", "updateMany", "upsert", "delete"].includes(call.method)
      )
  };
}

export type MemoryPrisma = ReturnType<typeof createMemoryPrisma>;
