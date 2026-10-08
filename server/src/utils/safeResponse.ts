import type { Prisma } from "@prisma/client";

/**
 * Shared Prisma projections for anything that ends up in an API response,
 * audit snapshot or socket payload. Password hashes and driver national IDs
 * are never returned (T-03); they stay in the database and in request input.
 */

/** Every User column except `passwordHash`. */
export const safeUserSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  language: true,
  avatar: true,
  createdAt: true,
  updatedAt: true
} satisfies Prisma.UserSelect;

export type SafeUser = Prisma.UserGetPayload<{ select: typeof safeUserSelect }>;

/** Driver columns withheld from responses. */
export const driverResponseOmit = {
  nationalIdIqama: true
} satisfies Prisma.DriverOmit;

/** Nested `user` relation (guest, driver). */
export const safeUserRelation = {
  select: safeUserSelect
} as const;

/** Nested `driver` relation: no national ID, safe user. */
export const safeDriverRelation = {
  omit: driverResponseOmit,
  include: { user: safeUserRelation }
} as const;

/** Nested `guest` relation with a safe user. */
export const safeGuestRelation = {
  include: { user: safeUserRelation }
} as const;

/** The `driver` + `guest` pair used by most task queries. */
export const safeTaskPeopleInclude = {
  driver: safeDriverRelation,
  guest: safeGuestRelation
} as const;

export const SENSITIVE_RESPONSE_KEYS = ["passwordHash", "nationalIdIqama"] as const;

const sensitiveKeys = new Set<string>(SENSITIVE_RESPONSE_KEYS);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Removes sensitive keys from stored JSON (for example audit snapshots written
 * before T-03). Only plain objects and arrays are rebuilt; Dates, Decimals and
 * other values are returned unchanged.
 */
export function stripSensitiveFields<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripSensitiveFields(item)) as T;
  }

  if (!isPlainObject(value)) {
    return value;
  }

  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!sensitiveKeys.has(key)) {
      result[key] = stripSensitiveFields(entry);
    }
  }

  return result as T;
}

/** Paths of any sensitive keys left in a payload; used by tests. */
export function findSensitiveFieldPaths(value: unknown, path = "$"): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      findSensitiveFieldPaths(item, `${path}[${index}]`)
    );
  }

  if (value === null || typeof value !== "object") {
    return [];
  }

  return Object.entries(value).flatMap(([key, entry]) => [
    ...(sensitiveKeys.has(key) ? [`${path}.${key}`] : []),
    ...findSensitiveFieldPaths(entry, `${path}.${key}`)
  ]);
}
