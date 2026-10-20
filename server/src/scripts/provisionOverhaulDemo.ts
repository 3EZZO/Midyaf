import { describeOverhaulFailure, runOverhaulDemo } from "../utils/overhaulDemo.js";

/**
 * FULL-OVERHAUL-M2 namespaced synthetic fixture CLI (see utils/overhaulDemo.ts).
 * Requires prisma/full-overhaul-002-additive.sql on the target first. The
 * target is DATABASE_URL in .env.neon.local only (direct Neon URL,
 * schema=midyaf), pinned by the expected host/database/schema flags.
 *
 *   npx tsx server/src/scripts/provisionOverhaulDemo.ts \
 *     --expected-host <host> --expected-database <db> --expected-schema midyaf
 *       dry run (default): read-only preflight, plan and namespaced ids
 *   ... --apply --expected-account-count <n> --expected-account-fingerprint <sha256>
 *       one serialized transaction; a rerun is a no-op; partial or
 *       conflicting namespace state is refused
 *   ... --verify [--expected-account-count <n> --expected-account-fingerprint <sha256>]
 *       read-only verification
 *
 * Creates no account or credential. Output never includes the URL,
 * credentials, emails or guest details.
 */

runOverhaulDemo(process.argv.slice(2), {
  root: process.cwd(),
  createClient: async (url) => {
    const { PrismaClient } = await import("@prisma/client");
    return new PrismaClient({ datasourceUrl: url, log: [] });
  },
  log: (line) => console.log(line)
}).then(
  (outcome) => {
    process.exitCode = outcome.checks && outcome.checks.failed > 0 ? 1 : 0;
  },
  (error: unknown) => {
    const failure = describeOverhaulFailure(error);
    console.error(`FAILED [${failure.reason}] ${failure.message}`);
    process.exitCode = 1;
  }
);
