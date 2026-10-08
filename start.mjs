import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

/**
 * Production launcher (Render runs `node start.mjs`).
 *
 * T-01: it only starts the built server. It never creates schemas, pushes the
 * Prisma schema, migrates or seeds; a missing schema or tables must be fixed
 * by a separately authorized provisioning step, never by startup.
 */

export const SERVER_ENTRY = "dist/server/src/index.js";

/** Schema the Render service has always used when the URL names none. */
export const LEGACY_SCHEMA = "midyaf";

/**
 * Keeps the existing Render connection target. An explicit `schema` query
 * parameter is left unchanged; otherwise `schema=midyaf` is added and any
 * other query parameters are kept.
 */
export function resolveDatabaseUrl(rawUrl) {
  if (!rawUrl) {
    return rawUrl;
  }

  const queryStart = rawUrl.indexOf("?");
  const query = queryStart === -1 ? "" : rawUrl.slice(queryStart + 1);

  if (new URLSearchParams(query).has("schema")) {
    return rawUrl;
  }

  if (queryStart === -1) {
    return `${rawUrl}?schema=${LEGACY_SCHEMA}`;
  }

  return `${rawUrl}${query ? "&" : ""}schema=${LEGACY_SCHEMA}`;
}

export function buildServerEnv(env) {
  const next = { ...env };

  if (env.DATABASE_URL) {
    next.DATABASE_URL = resolveDatabaseUrl(env.DATABASE_URL);
  }

  return next;
}

/**
 * Runs the built server in the foreground and returns its exit code. A launch
 * failure is thrown; there is no fallback step of any kind.
 */
export function launchServer({
  env = process.env,
  spawn = spawnSync,
  log = console.log
} = {}) {
  log("Starting MIDYAF server (startup does not change the database).");

  const result = spawn(process.execPath, [SERVER_ENTRY], {
    stdio: "inherit",
    env: buildServerEnv(env)
  });

  if (result.error) {
    throw result.error;
  }

  return result.status ?? 1;
}

const isEntryPoint =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) {
  process.exit(launchServer());
}
