/**
 * T-01 destructive-seed policy. `prisma/seed.ts` deletes every table before
 * recreating demo data, so it may run only when a developer explicitly asks
 * for it on a development or test database:
 *
 * - NODE_ENV=production: always denied, even with the opt-in flag.
 * - NODE_ENV must be exactly "development" or "test" (unset/unknown denied).
 * - ALLOW_DESTRUCTIVE_SEED must be exactly "true".
 *
 * Pure: no imports that create or connect a database client.
 */

export const SEED_OPT_IN_FLAG = "ALLOW_DESTRUCTIVE_SEED";

const SEEDABLE_ENVIRONMENTS = new Set(["development", "test"]);

export type SeedPermission =
  | { allowed: true }
  | { allowed: false; reason: string };

type Environment = Record<string, string | undefined>;

export function evaluateSeedPermission(env: Environment): SeedPermission {
  const nodeEnv = env.NODE_ENV;

  if (nodeEnv === "production") {
    return {
      allowed: false,
      reason: "destructive seeding is never allowed when NODE_ENV=production"
    };
  }

  if (!nodeEnv || !SEEDABLE_ENVIRONMENTS.has(nodeEnv)) {
    return {
      allowed: false,
      reason: "NODE_ENV must be explicitly set to development or test"
    };
  }

  if (env[SEED_OPT_IN_FLAG] !== "true") {
    return {
      allowed: false,
      reason: `${SEED_OPT_IN_FLAG}=true is required to delete and recreate all data`
    };
  }

  return { allowed: true };
}

/** Throws before any database client exists when seeding is not allowed. */
export function assertSeedAllowed(env: Environment) {
  const permission = evaluateSeedPermission(env);

  if (!permission.allowed) {
    throw new Error(`Refusing to run the destructive seed: ${permission.reason}.`);
  }
}
