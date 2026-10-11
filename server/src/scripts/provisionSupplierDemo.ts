import { describeSupplierDemoFailure, runSupplierDemo } from "../utils/supplierDemo.js";

/**
 * SUPPLIER-001 optional synthetic fixture CLI. PREPARED, NOT AUTHORIZED TO
 * APPLY: see docs/ai-output/SUPPLIER-001_RUNBOOK.md and wait for a concrete
 * approval naming the target.
 *
 *   npx tsx server/src/scripts/provisionSupplierDemo.ts --expected-host <host> --expected-database <db>
 *       dry run: read-only preflight and plan, no writes
 *   ... --apply
 *       one transaction: one sealed RECEIVED HOTEL quote + one synthetic note,
 *       metadata-only audits; a rerun is a no-op; different existing state is refused
 *
 * Requires the additive SQL to be applied first. Output is host, database,
 * schema, counts, an account fingerprint and the plan; never the URL,
 * credentials, emails or commercial terms.
 */

const root = process.cwd();

runSupplierDemo(process.argv.slice(2), {
  root,
  createClient: async (url) => {
    const { PrismaClient } = await import("@prisma/client");
    return new PrismaClient({ datasourceUrl: url, log: [] });
  },
  log: (line) => console.log(line)
}).then(
  () => {
    process.exitCode = 0;
  },
  (error: unknown) => {
    const failure = describeSupplierDemoFailure(error);
    console.error(`FAILED [${failure.reason}] ${failure.message}`);
    process.exitCode = 1;
  }
);
