import { createHash } from "node:crypto";
import { QuoteStatus, Role, SupplierCategory } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import {
  APPLICATION_MODELS,
  DEMO_SCHEMA,
  DemoProvisioningError,
  assertExpectedHost,
  assertRepositoryRoot,
  loadTargetUrl,
  validateTargetUrl,
  type DemoTarget
} from "./demoProvisioning.js";
import {
  SUPPLIER_DEMO_REQUESTS,
  computeQuoteTerms,
  evaluateSupplierRequest,
  lockIntake
} from "./supplierPortal.js";

/**
 * SUPPLIER-001 optional showcase fixture. PREPARED, NOT AUTHORIZED TO APPLY.
 *
 * Adds exactly one sealed RECEIVED quote from the EXISTING linked HOTEL
 * supplier and one clearly synthetic recommendation note to the existing
 * allow-listed demo intake, with metadata-only audit entries. It creates no
 * user, profile, service, booking, event or intake, never touches the two
 * legacy quotes, never confirms a plan and never unlocks the vault.
 *
 * Dry run is the default: it connects read-only, runs every preflight and
 * prints the plan. `--apply` repeats the checks inside one transaction with
 * the intake row locked. A rerun after success is a no-op; any existing
 * state that differs from the fixture is refused, never overwritten.
 *
 * Target: DATABASE_URL in .env.neon.local only (direct, non-pooled Neon URL,
 * sslmode=require, schema=midyaf), plus --expected-host and
 * --expected-database that must match it. Output never includes the URL,
 * credentials, emails or commercial terms.
 */

export const SUPPLIER_FIXTURE = {
  item: "Synthetic supplier hotel offer",
  quantity: 15,
  unitPrice: 1200,
  noteText:
    "Synthetic showcase recommendation: rooms can be held on one floor near the venue shuttle stop.",
  expectedUsers: 11,
  expectedLegacyQuotes: 2
} as const;

export const SUPPLIER_DEMO_FAILURES = {
  "args-invalid":
    "Usage: provisionSupplierDemo --expected-host <host> --expected-database <name> [--apply]",
  "expected-database-mismatch": "The target database does not match --expected-database.",
  "schema-incomplete":
    "The midyaf schema lacks the SUPPLIER-001/OPS-COLLAB-001 additive objects; apply the reviewed additive SQL first.",
  "account-count-mismatch": `The target does not hold exactly ${SUPPLIER_FIXTURE.expectedUsers} accounts.`,
  "demo-linkage-missing":
    "The allow-listed demo event/intake is missing, unlinked or not QUOTING with HOTEL demand.",
  "hotel-supplier-missing": "Exactly one HOTEL supplier linked to a SUPPLIER account is required.",
  "legacy-quotes-mismatch": `The demo intake does not hold exactly ${SUPPLIER_FIXTURE.expectedLegacyQuotes} legacy quotes.`,
  "fixture-conflict":
    "A supplier quote or note already exists for this request with different content; refusing to overwrite.",
  "database-error": "A database query failed (details withheld).",
  "transaction-failed": "The fixture transaction failed and was rolled back (details withheld)."
} as const;

export type SupplierDemoFailure = keyof typeof SUPPLIER_DEMO_FAILURES;

export class SupplierDemoError extends Error {
  constructor(readonly reason: SupplierDemoFailure) {
    super(SUPPLIER_DEMO_FAILURES[reason]);
    this.name = "SupplierDemoError";
  }
}

export function describeSupplierDemoFailure(error: unknown) {
  if (error instanceof SupplierDemoError) return { reason: error.reason, message: error.message };
  if (error instanceof DemoProvisioningError) return { reason: error.reason, message: error.message };
  return { reason: "unexpected", message: "Unexpected failure (details withheld)." };
}

export type SupplierDemoOptions = {
  apply: boolean;
  expectedHost: string;
  expectedDatabase: string;
};

const HOST = /^[A-Za-z0-9.-]{1,253}$/;
const DATABASE = /^[A-Za-z0-9_-]{1,63}$/;

export function parseSupplierDemoArgs(argv: string[], allowApply = true): SupplierDemoOptions {
  let apply = false;
  let expectedHost: string | undefined;
  let expectedDatabase: string | undefined;

  const take = (index: number) => {
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new SupplierDemoError("args-invalid");
    return value;
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply" && allowApply && !apply) {
      apply = true;
    } else if (arg === "--expected-host" && expectedHost === undefined) {
      expectedHost = take(index).toLowerCase();
      index += 1;
    } else if (arg === "--expected-database" && expectedDatabase === undefined) {
      expectedDatabase = take(index);
      index += 1;
    } else {
      throw new SupplierDemoError("args-invalid");
    }
  }

  if (!expectedHost || !HOST.test(expectedHost) || !expectedDatabase || !DATABASE.test(expectedDatabase)) {
    throw new SupplierDemoError("args-invalid");
  }
  return { apply, expectedHost, expectedDatabase };
}

export function resolveSupplierDemoTarget(root: string, options: SupplierDemoOptions): DemoTarget {
  assertRepositoryRoot(root);
  const target = validateTargetUrl(loadTargetUrl(root));
  assertExpectedHost(target, options.expectedHost);
  if (target.database !== options.expectedDatabase) {
    throw new SupplierDemoError("expected-database-mismatch");
  }
  return target;
}

type Db = Pick<
  PrismaClient,
  | "user"
  | "event"
  | "activityIntake"
  | "supplier"
  | "vendorQuote"
  | "supplierRequestNote"
  | "auditLog"
  | "$queryRaw"
  | "$transaction"
>;

/** Tables present in the midyaf schema (injectable for tests). */
export type SchemaTables = (db: Db) => Promise<Set<string>>;

export const readSchemaTables: SchemaTables = async (db) => {
  const rows = await db.$queryRaw<Array<{ name: string }>>`
    SELECT table_name::text AS name
      FROM information_schema.tables
     WHERE table_schema::text = ${DEMO_SCHEMA}
       AND table_type = 'BASE TABLE'`;
  return new Set(rows.map((row) => row.name));
};

export type SupplierDemoState = {
  accountFingerprint: string;
  supplierId: string;
  supplierUserId: string;
  legacyQuotes: number;
  existingQuote: "absent" | "matches";
  existingNote: "absent" | "matches";
};

async function guarded<T>(reason: SupplierDemoFailure, work: () => Promise<T>) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof SupplierDemoError) throw error;
    throw new SupplierDemoError(reason);
  }
}

/**
 * Read-only preflight shared by dry run, apply (inside the transaction) and
 * verification. Throws a fixed reason on any mismatch or conflict.
 */
export async function inspectSupplierDemo(db: Db, tables: Set<string>): Promise<SupplierDemoState> {
  if (APPLICATION_MODELS.some((model) => !tables.has(model))) {
    throw new SupplierDemoError("schema-incomplete");
  }

  const demo = SUPPLIER_DEMO_REQUESTS[0];
  return guarded("database-error", async () => {
    const users = await db.user.findMany({
      select: { email: true, role: true },
      orderBy: { email: "asc" }
    });
    if (users.length !== SUPPLIER_FIXTURE.expectedUsers) {
      throw new SupplierDemoError("account-count-mismatch");
    }
    const accountFingerprint = createHash("sha256")
      .update(users.map((user) => `${user.email.toLowerCase()}|${user.role}`).join("\n"))
      .digest("hex")
      .slice(0, 16);

    const intake = await db.activityIntake.findUnique({ where: { id: demo.intakeId } });
    const event = await db.event.findUnique({
      where: { id: demo.eventId },
      select: { id: true, date: true, currency: true, timezone: true }
    });
    if (!evaluateSupplierRequest(intake, event, SupplierCategory.HOTEL)) {
      throw new SupplierDemoError("demo-linkage-missing");
    }

    const hotels = await db.supplier.findMany({
      where: { category: SupplierCategory.HOTEL, userId: { not: null }, user: { role: Role.SUPPLIER } },
      select: { id: true, userId: true, commissionPercent: true }
    });
    const hotel = hotels[0];
    const supplierUserId = hotel?.userId;
    if (hotels.length !== 1 || !supplierUserId) {
      throw new SupplierDemoError("hotel-supplier-missing");
    }

    const legacyQuotes = await db.vendorQuote.count({
      where: { intakeId: demo.intakeId, supplierId: null }
    });
    if (legacyQuotes !== SUPPLIER_FIXTURE.expectedLegacyQuotes) {
      throw new SupplierDemoError("legacy-quotes-mismatch");
    }

    const quote = await db.vendorQuote.findFirst({
      where: { intakeId: demo.intakeId, supplierId: hotel.id, category: SupplierCategory.HOTEL },
      select: { item: true, quantity: true, unitPrice: true, status: true, isVaultSealed: true }
    });
    let existingQuote: SupplierDemoState["existingQuote"] = "absent";
    if (quote) {
      const matches =
        quote.item === SUPPLIER_FIXTURE.item &&
        quote.quantity === SUPPLIER_FIXTURE.quantity &&
        Number(quote.unitPrice) === SUPPLIER_FIXTURE.unitPrice &&
        quote.isVaultSealed &&
        (quote.status === QuoteStatus.RECEIVED || quote.status === QuoteStatus.REJECTED);
      if (!matches) throw new SupplierDemoError("fixture-conflict");
      existingQuote = "matches";
    }

    const notes = await db.supplierRequestNote.findMany({
      where: { intakeId: demo.intakeId, supplierId: hotel.id },
      select: { text: true }
    });
    let existingNote: SupplierDemoState["existingNote"] = "absent";
    if (notes.length > 0) {
      if (notes.length !== 1 || notes[0].text !== SUPPLIER_FIXTURE.noteText) {
        throw new SupplierDemoError("fixture-conflict");
      }
      existingNote = "matches";
    }

    return {
      accountFingerprint,
      supplierId: hotel.id,
      supplierUserId,
      legacyQuotes,
      existingQuote,
      existingNote
    };
  });
}

/** The fixture writes inside one transaction; returns what was created. */
export async function writeSupplierFixture(db: Db, tables: Set<string>, now: Date) {
  const demo = SUPPLIER_DEMO_REQUESTS[0];
  try {
    return await db.$transaction(async (tx) => {
      await lockIntake(tx, demo.intakeId);
      const state = await inspectSupplierDemo(tx as unknown as Db, tables);
      const created = { quote: false, note: false };

      if (state.existingQuote === "absent") {
        const supplier = await tx.supplier.findUnique({
          where: { id: state.supplierId },
          select: { name: true, commissionPercent: true }
        });
        const terms = computeQuoteTerms(
          SUPPLIER_FIXTURE.quantity,
          SUPPLIER_FIXTURE.unitPrice,
          supplier?.commissionPercent
        );
        const quote = await tx.vendorQuote.create({
          data: {
            intakeId: demo.intakeId,
            supplierId: state.supplierId,
            category: SupplierCategory.HOTEL,
            vendorName: supplier?.name ?? "Synthetic hotel supplier",
            item: SUPPLIER_FIXTURE.item,
            quantity: SUPPLIER_FIXTURE.quantity,
            unitPrice: terms.unitPrice,
            totalPrice: terms.totalPrice,
            commissionPercent: terms.commissionPercent,
            commissionAmount: terms.commissionAmount,
            score: 0,
            status: QuoteStatus.RECEIVED,
            isVaultSealed: true,
            createdAt: now
          },
          select: { id: true }
        });
        await tx.auditLog.create({
          data: fixtureAudit("supplier_quote.submit", "VENDOR_QUOTE", quote.id, state, {
            quoteId: quote.id
          })
        });
        created.quote = true;
      }

      if (state.existingNote === "absent") {
        const note = await tx.supplierRequestNote.create({
          data: {
            intakeId: demo.intakeId,
            supplierId: state.supplierId,
            authorUserId: state.supplierUserId,
            text: SUPPLIER_FIXTURE.noteText,
            createdAt: now
          },
          select: { id: true }
        });
        await tx.auditLog.create({
          data: fixtureAudit("supplier_note.append", "SUPPLIER_NOTE", note.id, state, {
            noteId: note.id
          })
        });
        created.note = true;
      }

      return { state, created };
    });
  } catch (error) {
    if (error instanceof SupplierDemoError) throw error;
    throw new SupplierDemoError("transaction-failed");
  }
}

function fixtureAudit(
  action: string,
  entityType: string,
  entityId: string,
  state: SupplierDemoState,
  extra: Record<string, string>
) {
  const demo = SUPPLIER_DEMO_REQUESTS[0];
  return {
    actorUserId: state.supplierUserId,
    actorRole: Role.SUPPLIER,
    action,
    entityType,
    entityId,
    eventId: demo.eventId,
    metadata: {
      intakeId: demo.intakeId,
      supplierId: state.supplierId,
      source: "SUPPLIER-001 synthetic fixture",
      ...extra
    }
  };
}

export type SupplierDemoDeps = {
  root: string;
  createClient: (url: string) => Promise<Db & { $disconnect(): Promise<void> }>;
  schemaTables?: SchemaTables;
  log: (line: string) => void;
  now?: () => Date;
};

export async function runSupplierDemo(argv: string[], deps: SupplierDemoDeps) {
  const options = parseSupplierDemoArgs(argv);
  const target = resolveSupplierDemoTarget(deps.root, options);
  const log = deps.log;
  log(`target: host=${target.host} database=${target.database} schema=${target.schema}`);
  log(`mode: ${options.apply ? "APPLY" : "DRY RUN (no writes)"}`);

  const db = await deps.createClient(target.url);
  try {
    const tables = await guarded("database-error", () => (deps.schemaTables ?? readSchemaTables)(db));
    const state = await inspectSupplierDemo(db, tables);
    log(`preflight: accounts=${SUPPLIER_FIXTURE.expectedUsers} fingerprint=${state.accountFingerprint}`);
    log(`preflight: legacy quotes on demo intake=${state.legacyQuotes} (unchanged)`);
    log(`preflight: fixture quote=${state.existingQuote} note=${state.existingNote}`);

    if (!options.apply) {
      const planned = [
        state.existingQuote === "absent" ? "1 sealed RECEIVED HOTEL quote (+1 audit)" : null,
        state.existingNote === "absent" ? "1 synthetic note (+1 audit)" : null
      ].filter(Boolean);
      log(`plan: ${planned.length ? planned.join(", ") : "nothing to write (already applied)"}`);
      log("status: dry run complete; nothing was written");
      return { applied: false, created: { quote: false, note: false } };
    }

    const result = await writeSupplierFixture(db, tables, (deps.now ?? (() => new Date()))());
    log(`written: quote=${result.created.quote} note=${result.created.note}`);
    log("status: applied");
    return { applied: true, created: result.created };
  } finally {
    await db.$disconnect();
  }
}

export type VerifyCheck = { name: string; ok: boolean };

/** Read-only verification; never mutates. */
export async function runSupplierDemoVerify(argv: string[], deps: SupplierDemoDeps) {
  const options = parseSupplierDemoArgs(argv, false);
  const target = resolveSupplierDemoTarget(deps.root, options);
  deps.log(`target: host=${target.host} database=${target.database} schema=${target.schema} (read-only)`);

  const db = await deps.createClient(target.url);
  const checks: VerifyCheck[] = [];
  const check = (name: string, ok: boolean) => {
    checks.push({ name, ok });
    deps.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  };
  try {
    const tables = await guarded("database-error", () => (deps.schemaTables ?? readSchemaTables)(db));
    check("schema: every application table present", APPLICATION_MODELS.every((m) => tables.has(m)));
    let state: SupplierDemoState | undefined;
    try {
      state = await inspectSupplierDemo(db, tables);
    } catch (error) {
      check(`preflight: ${describeSupplierDemoFailure(error).reason}`, false);
    }
    if (state) {
      check("accounts: exactly 11 retained", true);
      check("legacy quotes: exactly 2, untouched", state.legacyQuotes === 2);
      check("fixture quote: present, sealed, initial terms", state.existingQuote === "matches");
      check("fixture note: present", state.existingNote === "matches");
      const demo = SUPPLIER_DEMO_REQUESTS[0];
      const contracts = await guarded("database-error", () =>
        db.vendorQuote.count({
          where: { intakeId: demo.intakeId, supplierId: { not: null }, status: QuoteStatus.APPROVED }
        })
      );
      check("supplier quotes: none approved (D-011 pending)", contracts === 0);
    }
  } finally {
    await db.$disconnect();
  }

  return {
    passed: checks.filter((c) => c.ok).length,
    failed: checks.filter((c) => !c.ok).length
  };
}
