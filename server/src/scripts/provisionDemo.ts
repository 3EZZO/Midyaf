import {
  describeFailure,
  fileCredentialStore,
  runProvision,
  runSchemaPush
} from "../utils/demoProvisioning.js";

/**
 * DEMO-DB-001 one-off CLI for a NEW, EMPTY Free Neon demo database. See
 * docs/ai-output/NEON_DEMO_RUNBOOK.md before running it.
 *
 *   npm run demo:provision                     plan only: no connection, no writes
 *   npm run demo:provision -- --apply --expected-host <host> [--create-schema]
 *
 * The target is the DATABASE_URL key of .env.neon.local only; an inherited
 * DATABASE_URL is never used. Output is host, database,
 * schema, status, credentials path and record counts; failures print a fixed
 * reason category only.
 */

const root = process.cwd();

runProvision(process.argv.slice(2), {
  root,
  createClient: async (url) => {
    const { PrismaClient } = await import("@prisma/client");
    return new PrismaClient({ datasourceUrl: url, log: [] });
  },
  credentialStore: fileCredentialStore(root),
  schemaPush: (target) => runSchemaPush(root, target),
  log: (line) => console.log(line)
}).then(
  () => {
    process.exitCode = 0;
  },
  (error: unknown) => {
    const failure = describeFailure(error);
    console.error(`FAILED [${failure.reason}] ${failure.message}`);
    process.exitCode = 1;
  }
);
