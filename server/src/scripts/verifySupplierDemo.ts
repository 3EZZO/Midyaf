import { describeSupplierDemoFailure, runSupplierDemoVerify } from "../utils/supplierDemo.js";

/**
 * SUPPLIER-001 read-only verification of the additive schema and the
 * optional synthetic fixture. Never writes; `--apply` is rejected.
 *
 *   npx tsx server/src/scripts/verifySupplierDemo.ts --expected-host <host> --expected-database <db>
 *
 * HTTP submission/rejection checks are deliberately not part of this script:
 * they mutate and need their own reviewed mode and approval.
 */

const root = process.cwd();

runSupplierDemoVerify(process.argv.slice(2), {
  root,
  createClient: async (url) => {
    const { PrismaClient } = await import("@prisma/client");
    return new PrismaClient({ datasourceUrl: url, log: [] });
  },
  log: (line) => console.log(line)
}).then(
  ({ passed, failed }) => {
    console.log(`checks: ${passed} passed, ${failed} failed`);
    process.exitCode = failed === 0 ? 0 : 1;
  },
  (error: unknown) => {
    const failure = describeSupplierDemoFailure(error);
    console.error(`FAILED [${failure.reason}] ${failure.message}`);
    process.exitCode = 1;
  }
);
