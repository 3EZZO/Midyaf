import fs from "node:fs";
import path from "node:path";
import { randomBytes as nodeRandomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import { Prisma, type PrismaClient, type Role } from "@prisma/client";
import { findSensitiveFieldPaths } from "./safeResponse.js";

/**
 * DEMO-DB-001 (D-013): one-off provisioning and verification of a NEW, EMPTY
 * Free Neon database holding synthetic showcase records and accounts.
 *
 * - The target is the DATABASE_URL key of `.env.neon.local` only (parsed,
 *   never loaded into process.env). An inherited DATABASE_URL or the default
 *   `.env` is never a fallback.
 * - Plan mode (default) constructs no client, connects nowhere, writes nothing
 *   and generates no secrets.
 * - Apply mode needs `--apply` and an exact `--expected-host` pin. It refuses a
 *   target with any existing application data and never deletes, truncates,
 *   upserts or resets anything. `--create-schema` additionally requires a
 *   target with no user tables, views, sequences or enums at all.
 * - Output and errors carry fixed reason categories only: never URLs,
 *   passwords, hashes, raw database errors or subprocess output.
 *
 * This is not the destructive `prisma/seed.ts` and does not import it.
 */

export const TARGET_FILE_NAME = ".env.neon.local";
/** Key inside .env.neon.local only; process.env.DATABASE_URL is never read. */
export const TARGET_URL_KEY = "DATABASE_URL";
export const DEMO_SCHEMA = "midyaf";
export const BCRYPT_COST = 12;
export const PASSWORD_BYTES = 24;
export const MIN_PASSWORD_LENGTH = 20;
export const CREDENTIALS_RELATIVE_PATH = path.join("scratch", "neon-demo", "accounts.json");
export const CREDENTIALS_FORMAT = "midyaf-demo-accounts/v1";

const NEON_HOST_SUFFIX = ".neon.tech";
const HOST_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

// ---------------------------------------------------------------------------
// Safe failures
// ---------------------------------------------------------------------------

export const FAILURE_REASONS = {
  "wrong-working-directory": "Run this command from the repository root (prisma/schema.prisma not found).",
  "args-invalid": "Unrecognized, repeated or incomplete command-line options.",
  "expected-host-required": "--expected-host <neon-host> is required for this mode.",
  "expected-host-mismatch": "The target host does not equal --expected-host.",
  "target-file-missing": `${TARGET_FILE_NAME} is missing or unreadable in the repository root.`,
  "target-url-missing": `${TARGET_URL_KEY} is not set in ${TARGET_FILE_NAME}.`,
  "target-url-invalid": "The target is not a valid PostgreSQL connection on the default port.",
  "target-host-not-neon": "The target host is not a *.neon.tech hostname.",
  "target-pooled-endpoint": "The target is a pooled endpoint; provisioning needs the direct endpoint.",
  "target-sslmode": "The target URL must contain exactly sslmode=require.",
  "target-credentials-incomplete": "The target URL must contain a user name and password.",
  "target-database-missing": "The target URL must name a database.",
  "target-schema-not-midyaf": `The target URL names a schema other than ${DEMO_SCHEMA}.`,
  "credentials-file-exists": `${CREDENTIALS_RELATIVE_PATH} already exists; it is never overwritten.`,
  "credentials-file-write-failed": `${CREDENTIALS_RELATIVE_PATH} could not be created securely. No records or accounts were written; an empty schema created earlier in this run by --create-schema remains.`,
  "credentials-status-not-updated": `Records were committed, but the status in ${CREDENTIALS_RELATIVE_PATH} could not be updated. The original complete bundle was kept unchanged with status pending; its passwords are valid.`,
  "credentials-file-missing": `${CREDENTIALS_RELATIVE_PATH} is missing or unreadable.`,
  "credentials-file-invalid": `${CREDENTIALS_RELATIVE_PATH} is not a valid demo credential bundle.`,
  "credentials-file-failed-run": `${CREDENTIALS_RELATIVE_PATH} belongs to a failed provisioning run.`,
  "credentials-file-host-mismatch": `${CREDENTIALS_RELATIVE_PATH} was created for a different host.`,
  "password-generation-failed": "Generated passwords were not unique or too short.",
  "target-not-empty": "The target already contains user tables, views, sequences or enums; --create-schema needs a fresh database.",
  "schema-incomplete": `The ${DEMO_SCHEMA} schema does not contain every application table.`,
  "data-not-empty": "Application tables already contain rows; provisioning only writes to empty tables.",
  "prisma-cli-missing": "The locally installed Prisma CLI was not found (node_modules/prisma).",
  "schema-push-failed": "prisma db push failed (output withheld). The target may hold a partial schema.",
  "database-error": "A database operation failed (details withheld).",
  "transaction-failed": "The provisioning transaction failed and was rolled back (details withheld).",
  "smoke-server-failed": "The local loopback smoke server could not start (details withheld).",
  "verification-failed": "One or more verification checks failed.",
  "unexpected-error": "An unexpected error occurred (details withheld)."
} as const;

export type FailureReason = keyof typeof FAILURE_REASONS;

export class DemoProvisioningError extends Error {
  readonly reason: FailureReason;

  constructor(reason: FailureReason) {
    super(FAILURE_REASONS[reason]);
    this.name = "DemoProvisioningError";
    this.reason = reason;
  }
}

/** Reason category and fixed text only; never the original error message. */
export function describeFailure(error: unknown): { reason: FailureReason; message: string } {
  const reason = error instanceof DemoProvisioningError ? error.reason : "unexpected-error";
  return { reason, message: FAILURE_REASONS[reason] };
}

async function guarded<T>(reason: FailureReason, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof DemoProvisioningError) throw error;
    throw new DemoProvisioningError(reason);
  }
}

// ---------------------------------------------------------------------------
// Target loading and validation
// ---------------------------------------------------------------------------

export type DemoTarget = {
  /** Normalized URL (schema=midyaf). Secret: never print. */
  url: string;
  host: string;
  database: string;
  schema: typeof DEMO_SCHEMA;
};

export type ReadTextFile = (file: string) => string;

const readUtf8: ReadTextFile = (file) => fs.readFileSync(file, "utf8");

export function assertRepositoryRoot(root: string, exists: (file: string) => boolean = fs.existsSync) {
  if (!exists(path.join(root, "prisma", "schema.prisma"))) {
    throw new DemoProvisioningError("wrong-working-directory");
  }
}

/**
 * Reads DATABASE_URL only from `<root>/.env.neon.local` with dotenv.parse.
 * process.env is neither read nor modified, so an ambient DATABASE_URL (or the
 * default `.env`) is never a fallback when the file's key is empty.
 */
export function loadTargetUrl(root: string, readFile: ReadTextFile = readUtf8): string {
  let content: string;
  try {
    content = readFile(path.join(root, TARGET_FILE_NAME));
  } catch {
    throw new DemoProvisioningError("target-file-missing");
  }

  const value = dotenv.parse(content)[TARGET_URL_KEY]?.trim();
  if (!value) {
    throw new DemoProvisioningError("target-url-missing");
  }
  return value;
}

/**
 * Accepts only a direct Neon PostgreSQL URL with credentials, a database,
 * sslmode=require and either no schema (normalized to midyaf) or schema=midyaf.
 */
export function validateTargetUrl(raw: string): DemoTarget {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new DemoProvisioningError("target-url-invalid");
  }

  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new DemoProvisioningError("target-url-invalid");
  }
  if (url.port && url.port !== "5432") {
    throw new DemoProvisioningError("target-url-invalid");
  }

  const host = url.hostname.toLowerCase();
  if (!HOST_PATTERN.test(host) || !host.endsWith(NEON_HOST_SUFFIX) || host.length <= NEON_HOST_SUFFIX.length) {
    throw new DemoProvisioningError("target-host-not-neon");
  }
  if (host.split(".").some((label) => label.endsWith("-pooler")) || url.searchParams.has("pgbouncer")) {
    throw new DemoProvisioningError("target-pooled-endpoint");
  }

  if (!url.username || !url.password) {
    throw new DemoProvisioningError("target-credentials-incomplete");
  }

  let database: string;
  try {
    database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  } catch {
    throw new DemoProvisioningError("target-database-missing");
  }
  if (!database || database.includes("/")) {
    throw new DemoProvisioningError("target-database-missing");
  }

  const sslModes = url.searchParams.getAll("sslmode");
  if (sslModes.length !== 1 || sslModes[0] !== "require") {
    throw new DemoProvisioningError("target-sslmode");
  }

  const schemas = url.searchParams.getAll("schema");
  if (schemas.length > 1 || (schemas.length === 1 && schemas[0] !== DEMO_SCHEMA)) {
    throw new DemoProvisioningError("target-schema-not-midyaf");
  }
  if (schemas.length === 0) {
    url.searchParams.set("schema", DEMO_SCHEMA);
  }

  return { url: url.toString(), host, database, schema: DEMO_SCHEMA };
}

export function assertExpectedHost(target: DemoTarget, expectedHost: string | undefined) {
  if (!expectedHost) {
    throw new DemoProvisioningError("expected-host-required");
  }
  if (expectedHost.trim().toLowerCase() !== target.host) {
    throw new DemoProvisioningError("expected-host-mismatch");
  }
}

// ---------------------------------------------------------------------------
// Command-line options
// ---------------------------------------------------------------------------

export type ProvisionOptions = { apply: boolean; createSchema: boolean; expectedHost?: string };
export type VerifyOptions = { expectedHost: string };

function parseFlags(argv: string[], booleans: string[]) {
  const flags = new Set<string>();
  let expectedHost: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (booleans.includes(arg)) {
      if (flags.has(arg)) throw new DemoProvisioningError("args-invalid");
      flags.add(arg);
      continue;
    }

    let value: string | undefined;
    if (arg === "--expected-host") {
      value = argv[index + 1];
      index += 1;
    } else if (arg.startsWith("--expected-host=")) {
      value = arg.slice("--expected-host=".length);
    } else {
      throw new DemoProvisioningError("args-invalid");
    }

    if (expectedHost !== undefined || !value || !/^[A-Za-z0-9.-]+$/.test(value)) {
      throw new DemoProvisioningError("args-invalid");
    }
    expectedHost = value.toLowerCase();
  }

  return { flags, expectedHost };
}

export function parseProvisionArgs(argv: string[]): ProvisionOptions {
  const { flags, expectedHost } = parseFlags(argv, ["--apply", "--create-schema"]);
  const apply = flags.has("--apply");
  const createSchema = flags.has("--create-schema");

  if (createSchema && !apply) {
    throw new DemoProvisioningError("args-invalid");
  }
  if (apply && !expectedHost) {
    throw new DemoProvisioningError("expected-host-required");
  }
  return { apply, createSchema, expectedHost };
}

export function parseVerifyArgs(argv: string[]): VerifyOptions {
  const { expectedHost } = parseFlags(argv, []);
  if (!expectedHost) {
    throw new DemoProvisioningError("expected-host-required");
  }
  return { expectedHost };
}

// ---------------------------------------------------------------------------
// Synthetic accounts and passwords
// ---------------------------------------------------------------------------

/**
 * Seven login-screen personas (selector emails kept so the UI needs no change)
 * plus a supplier, a coordinator, a second ordinary guest and a second driver.
 * Every name is visibly synthetic; the VIP guest is a display code (D-003).
 */
export const DEMO_ACCOUNTS = [
  { key: "admin", email: "admin@midyaf.local", role: "SUPER_ADMIN", name: "Demo Admin (Synthetic)", phone: "+966500009001", language: "en" },
  { key: "company", email: "company@midyaf.local", role: "COMPANY_ORGANIZER", name: "Demo Company Organizer (Synthetic)", phone: "+966500009002", language: "en" },
  { key: "logistics", email: "organizer@midyaf.local", role: "LOGISTICS_MANAGER", name: "Demo Logistics Manager (Synthetic)", phone: "+966500009003", language: "en" },
  { key: "eventLead", email: "event.lead@sila.com", role: "ORGANIZER", name: "Demo Event Manager (Synthetic)", phone: "+966500009004", language: "en" },
  { key: "client", email: "client.vip@tourism.gov.sa", role: "COMPANY_ORGANIZER", name: "Demo Client Portal (Synthetic)", phone: "+966500009005", language: "en" },
  { key: "driver", email: "driver@midyaf.local", role: "DRIVER", name: "Demo Captain One (Synthetic)", phone: "+966500009006", language: "ar" },
  { key: "guestVip", email: "guest.vip@midyaf.local", role: "GUEST", name: "VIP-D01 (Synthetic guest code)", phone: "+966500009007", language: "ar" },
  { key: "supplier", email: "supplier@midyaf.local", role: "SUPPLIER", name: "Demo Supplier Account (Synthetic)", phone: "+966500009008", language: "en" },
  { key: "coordinator", email: "coordinator@midyaf.local", role: "COORDINATOR", name: "Demo Coordinator (Synthetic)", phone: "+966500009009", language: "ar" },
  { key: "guest", email: "guest@midyaf.local", role: "GUEST", name: "GST-D02 (Synthetic guest code)", phone: "+966500009010", language: "en" },
  { key: "driverTwo", email: "driver.two@midyaf.local", role: "DRIVER", name: "Demo Captain Two (Synthetic)", phone: "+966500009011", language: "ar" }
] as const satisfies ReadonlyArray<{
  key: string;
  email: string;
  role: Role;
  name: string;
  phone: string;
  language: "ar" | "en";
}>;

export type DemoAccountKey = (typeof DEMO_ACCOUNTS)[number]["key"];
export type AccountHashes = Record<DemoAccountKey, string>;
export type AccountPasswords = Record<DemoAccountKey, string>;

export type RandomBytes = (size: number) => Buffer;

/** Independent cryptographically random password (32 base64url characters). */
export function generatePassword(random: RandomBytes = nodeRandomBytes): string {
  return random(PASSWORD_BYTES).toString("base64url");
}

export function generateAccountPasswords(random: RandomBytes = nodeRandomBytes): AccountPasswords {
  const passwords = {} as AccountPasswords;
  for (const account of DEMO_ACCOUNTS) {
    passwords[account.key] = generatePassword(random);
  }

  const values = Object.values(passwords);
  if (new Set(values).size !== values.length || values.some((value) => value.length < MIN_PASSWORD_LENGTH)) {
    throw new DemoProvisioningError("password-generation-failed");
  }
  return passwords;
}

export type HashPassword = (password: string) => Promise<string>;

export const hashDemoPassword: HashPassword = (password) => bcrypt.hash(password, BCRYPT_COST);

// ---------------------------------------------------------------------------
// Credential bundle (local, ignored, exclusive)
// ---------------------------------------------------------------------------

export type CredentialStatus = "pending" | "failed" | "complete";

export type CredentialBundle = {
  format: typeof CREDENTIALS_FORMAT;
  status: CredentialStatus;
  createdAt: string;
  target: { host: string; database: string; schema: string };
  accounts: Array<{ key: DemoAccountKey; email: string; role: Role; password: string }>;
};

export type CredentialHandle = {
  /**
   * Replaces the saved bundle with `bundle` atomically. On failure it throws
   * and the previously saved bundle is left byte-for-byte unchanged.
   */
  update(bundle: CredentialBundle): void;
};

export type CredentialStore = {
  /** Repository-relative path, for output. */
  displayPath: string;
  exists(): boolean;
  /** Exclusive create (never overwrites); the bundle is written, flushed and closed. */
  reserve(bundle: CredentialBundle): CredentialHandle;
  read(): CredentialBundle;
};

/**
 * File store fixed to `<root>/scratch/neon-demo/accounts.json` (scratch/ is
 * gitignored). Created with flag "wx" and mode 0600; Windows ignores the mode,
 * so the runbook covers ACLs and OneDrive.
 *
 * After the initial write the saved bundle is never reopened for writing. A
 * status update writes a complete sibling temp file, flushes and closes it,
 * then renames it over the bundle. No handle on the bundle stays open, so the
 * Windows rename is not blocked by this process; if the rename (or anything
 * before it) fails, the original complete bundle is still in place.
 */
export function fileCredentialStore(root: string, fsImpl: typeof fs = fs): CredentialStore {
  const file = path.join(root, CREDENTIALS_RELATIVE_PATH);
  const serialize = (bundle: CredentialBundle) => Buffer.from(`${JSON.stringify(bundle, null, 2)}\n`, "utf8");

  /** Creates `target` exclusively and writes, flushes and closes it. Removes it if that fails. */
  const writeNew = (target: string, bundle: CredentialBundle) => {
    const data = serialize(bundle);
    const fd = fsImpl.openSync(target, "wx", 0o600);
    let open = true;
    try {
      let offset = 0;
      while (offset < data.length) {
        const written = fsImpl.writeSync(fd, data, offset, data.length - offset, offset);
        if (written <= 0) throw new Error("short write");
        offset += written;
      }
      fsImpl.fsyncSync(fd);
      open = false;
      fsImpl.closeSync(fd);
    } catch (error) {
      if (open) {
        try {
          fsImpl.closeSync(fd);
        } catch {
          // Already failing; the write error is what matters.
        }
      }
      try {
        fsImpl.unlinkSync(target);
      } catch {
        // A leftover partial file still blocks reuse; the write error is what matters.
      }
      throw error;
    }
  };

  return {
    displayPath: CREDENTIALS_RELATIVE_PATH.split(path.sep).join("/"),
    exists: () => fsImpl.existsSync(file),
    reserve(bundle) {
      try {
        fsImpl.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
        writeNew(file, bundle);
      } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code === "EEXIST") {
          throw new DemoProvisioningError("credentials-file-exists");
        }
        throw new DemoProvisioningError("credentials-file-write-failed");
      }

      return {
        update(next) {
          const temp = `${file}.${nodeRandomBytes(6).toString("hex")}.tmp`;
          writeNew(temp, next);
          try {
            fsImpl.renameSync(temp, file);
          } catch (error) {
            try {
              fsImpl.unlinkSync(temp);
            } catch {
              // The original bundle is intact either way.
            }
            throw error;
          }
        }
      };
    },
    read() {
      let raw: string;
      try {
        raw = fsImpl.readFileSync(file, "utf8");
      } catch {
        throw new DemoProvisioningError("credentials-file-missing");
      }
      return parseCredentialBundle(raw);
    }
  };
}

export function parseCredentialBundle(raw: string): CredentialBundle {
  let value: CredentialBundle;
  try {
    value = JSON.parse(raw) as CredentialBundle;
  } catch {
    throw new DemoProvisioningError("credentials-file-invalid");
  }

  const known = new Map<string, (typeof DEMO_ACCOUNTS)[number]>(DEMO_ACCOUNTS.map((account) => [account.key, account]));
  const valid =
    value?.format === CREDENTIALS_FORMAT &&
    ["pending", "failed", "complete"].includes(value.status) &&
    typeof value.target?.host === "string" &&
    Array.isArray(value.accounts) &&
    value.accounts.length === DEMO_ACCOUNTS.length &&
    value.accounts.every((account) => {
      const spec = known.get(account?.key);
      return (
        spec !== undefined &&
        account.email === spec.email &&
        account.role === spec.role &&
        typeof account.password === "string" &&
        account.password.length >= MIN_PASSWORD_LENGTH
      );
    }) &&
    new Set(value.accounts.map((account) => account.key)).size === DEMO_ACCOUNTS.length;

  if (!valid) {
    throw new DemoProvisioningError("credentials-file-invalid");
  }
  return value;
}

// ---------------------------------------------------------------------------
// Schema and emptiness checks (static queries; no identifier interpolation)
// ---------------------------------------------------------------------------

/** Every model in the checked-in Prisma schema (table names equal model names). */
export const APPLICATION_MODELS: readonly string[] = Object.values(Prisma.ModelName);

export function delegateName(model: string) {
  return `${model.charAt(0).toLowerCase()}${model.slice(1)}`;
}

type QueryClient = Pick<PrismaClient, "$queryRaw">;

/** Counts user relations and enums in every non-system schema of the database. */
export async function inspectTargetObjects(db: QueryClient): Promise<{ relations: number; enums: number }> {
  const rows = await db.$queryRaw<Array<{ relations: number; enums: number }>>`
    SELECT
      (SELECT count(*)::int
         FROM pg_catalog.pg_class c
         JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
          AND left(n.nspname, 3) <> 'pg_'
          AND n.nspname <> 'information_schema') AS relations,
      (SELECT count(*)::int
         FROM pg_catalog.pg_type t
         JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typtype = 'e'
          AND left(n.nspname, 3) <> 'pg_'
          AND n.nspname <> 'information_schema') AS enums`;
  const row = rows[0];
  return { relations: Number(row?.relations ?? -1), enums: Number(row?.enums ?? -1) };
}

export async function assertTargetEmpty(db: QueryClient) {
  const { relations, enums } = await guarded("database-error", () => inspectTargetObjects(db));
  if (relations !== 0 || enums !== 0) {
    throw new DemoProvisioningError("target-not-empty");
  }
}

export async function assertSchemaComplete(db: QueryClient, schema: string = DEMO_SCHEMA) {
  const rows = await guarded("database-error", () =>
    db.$queryRaw<Array<{ name: string }>>`
      SELECT table_name::text AS name
        FROM information_schema.tables
       WHERE table_schema::text = ${schema}
         AND table_type = 'BASE TABLE'`
  );
  const tables = new Set(rows.map((row) => row.name));
  if (APPLICATION_MODELS.some((model) => !tables.has(model))) {
    throw new DemoProvisioningError("schema-incomplete");
  }
}

type CountDelegate = { count: () => Promise<number> };

/** Row counts for every application model through its Prisma delegate. */
export async function countApplicationRows(db: unknown): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const model of APPLICATION_MODELS) {
    const delegate = (db as Record<string, CountDelegate | undefined>)[delegateName(model)];
    if (!delegate || typeof delegate.count !== "function") {
      throw new DemoProvisioningError("schema-incomplete");
    }
    counts[model] = await delegate.count();
  }
  return counts;
}

export async function assertApplicationDataEmpty(db: unknown) {
  const counts = await guarded("database-error", () => countApplicationRows(db));
  if (Object.values(counts).some((count) => count !== 0)) {
    throw new DemoProvisioningError("data-not-empty");
  }
}

// ---------------------------------------------------------------------------
// Schema creation through the local Prisma CLI (fresh target only)
// ---------------------------------------------------------------------------

/** Non-secret OS variables the Prisma CLI needs to run; nothing else is inherited. */
const SUBPROCESS_ENV_ALLOWLIST = [
  "PATH",
  "Path",
  "SystemRoot",
  "SYSTEMROOT",
  "windir",
  "ComSpec",
  "TEMP",
  "TMP",
  "TMPDIR",
  "HOME",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA"
];

export const FORBIDDEN_PRISMA_ARGS = ["--accept-data-loss", "--force-reset", "migrate", "reset", "seed", "--force"];

export type SchemaPushCommand = {
  command: string;
  args: string[];
  options: {
    cwd: string;
    env: Record<string, string>;
    encoding: "utf8";
    stdio: "pipe";
    shell: false;
    windowsHide: true;
    timeout: number;
    maxBuffer: number;
  };
};

export function buildSchemaPushCommand(
  root: string,
  target: DemoTarget,
  baseEnv: Record<string, string | undefined> = process.env
): SchemaPushCommand {
  const env: Record<string, string> = {};
  for (const key of SUBPROCESS_ENV_ALLOWLIST) {
    const value = baseEnv[key];
    if (value) env[key] = value;
  }
  env.DATABASE_URL = target.url;
  env.CHECKPOINT_DISABLE = "1";
  env.PRISMA_HIDE_UPDATE_MESSAGE = "1";
  env.NO_COLOR = "1";

  return {
    command: process.execPath,
    args: [
      path.join(root, "node_modules", "prisma", "build", "index.js"),
      "db",
      "push",
      "--skip-generate",
      "--schema",
      path.join(root, "prisma", "schema.prisma")
    ],
    options: {
      cwd: root,
      env,
      encoding: "utf8",
      stdio: "pipe",
      shell: false,
      windowsHide: true,
      timeout: 300_000,
      maxBuffer: 16 * 1024 * 1024
    }
  };
}

export type SpawnRunner = (
  command: string,
  args: string[],
  options: SchemaPushCommand["options"]
) => { status: number | null; error?: Error; stdout?: unknown; stderr?: unknown };

/** Runs `prisma db push --skip-generate`; output is captured and discarded. */
export function runSchemaPush(
  root: string,
  target: DemoTarget,
  {
    spawn = spawnSync as unknown as SpawnRunner,
    exists = fs.existsSync,
    baseEnv = process.env
  }: { spawn?: SpawnRunner; exists?: (file: string) => boolean; baseEnv?: Record<string, string | undefined> } = {}
) {
  const { command, args, options } = buildSchemaPushCommand(root, target, baseEnv);
  if (args.some((arg) => FORBIDDEN_PRISMA_ARGS.includes(arg))) {
    throw new DemoProvisioningError("schema-push-failed");
  }
  if (!exists(args[0])) {
    throw new DemoProvisioningError("prisma-cli-missing");
  }

  let result: ReturnType<SpawnRunner>;
  try {
    result = spawn(command, args, options);
  } catch {
    throw new DemoProvisioningError("schema-push-failed");
  }
  if (result.error || result.status !== 0) {
    throw new DemoProvisioningError("schema-push-failed");
  }
}

// ---------------------------------------------------------------------------
// Synthetic fixtures
// ---------------------------------------------------------------------------

/** Records created by writeDemoFixtures, per model. Models not listed get 0. */
export const PLANNED_RECORD_COUNTS: Readonly<Record<string, number>> = {
  User: DEMO_ACCOUNTS.length,
  CityConfig: 1,
  CommissionConfig: 3,
  Event: 1,
  Guest: 2,
  HospitalityRider: 1,
  Driver: 2,
  Task: 3,
  Supplier: 2,
  Service: 2,
  Booking: 2,
  Notification: 2,
  ActivityIntake: 1,
  AiLogisticsPlan: 1,
  VendorQuote: 2,
  VaultSession: 1,
  GuestJourneyRecord: 2,
  CoordinatorRequest: 1,
  CompanyReport: 1
};

export function plannedCounts(): Record<string, number> {
  return Object.fromEntries(APPLICATION_MODELS.map((model) => [model, PLANNED_RECORD_COUNTS[model] ?? 0]));
}

type FixtureClient = Prisma.TransactionClient;

/**
 * Creates the linked synthetic showcase inside the caller's transaction.
 * Dates are relative to `now` so the schedule is never stale. No
 * notification is delivered and no provider is called.
 */
export async function writeDemoFixtures(tx: FixtureClient, hashes: AccountHashes, now: Date) {
  const at = (minutes: number) => new Date(now.getTime() + minutes * 60_000);
  const created: Record<string, number> = {};
  const bump = (model: string, count = 1) => {
    created[model] = (created[model] ?? 0) + count;
  };

  const users = {} as Record<DemoAccountKey, { id: string; name: string; phone: string; email: string }>;
  for (const account of DEMO_ACCOUNTS) {
    users[account.key] = await tx.user.create({
      data: {
        name: account.name,
        email: account.email,
        phone: account.phone,
        role: account.role,
        language: account.language,
        passwordHash: hashes[account.key]
      },
      select: { id: true, name: true, phone: true, email: true }
    });
    bump("User");
  }

  const city = await tx.cityConfig.create({
    data: {
      code: "riyadh",
      nameAr: "الرياض (عرض تجريبي)",
      nameEn: "Riyadh (Demo)",
      centerLat: 24.7136,
      centerLng: 46.6753,
      defaultZoom: 12,
      timezone: "Asia/Riyadh",
      currency: "SAR",
      vatPercent: 15,
      enabled: true
    }
  });
  bump("CityConfig");

  await tx.commissionConfig.createMany({
    data: [
      { defaultPercent: 12, minPercent: 10, maxPercent: 15 },
      { category: "HOTEL", defaultPercent: 12, minPercent: 10, maxPercent: 15 },
      { category: "CAR", defaultPercent: 15, minPercent: 10, maxPercent: 15 }
    ]
  });
  bump("CommissionConfig", 3);

  const event = await tx.event.create({
    data: {
      name: "MIDYAF Demo Summit (Synthetic)",
      date: at(240),
      venue: "Demo Venue Hall (Synthetic)",
      venueLat: 24.7642,
      venueLng: 46.6406,
      cityId: city.id,
      organizerId: users.eventLead.id,
      status: "LIVE",
      brief: "Synthetic showcase event. No real guests, drivers, suppliers or documents."
    }
  });
  bump("Event");

  const vipGuest = await tx.guest.create({
    data: {
      userId: users.guestVip.id,
      eventId: event.id,
      rsvpStatus: "CONFIRMED",
      isVIP: true,
      tier: "vip",
      qrCode: "DEMO-VIP-D01"
    }
  });
  const standardGuest = await tx.guest.create({
    data: {
      userId: users.guest.id,
      eventId: event.id,
      rsvpStatus: "CONFIRMED",
      isVIP: false,
      tier: "standard",
      qrCode: "DEMO-GST-D02"
    }
  });
  bump("Guest", 2);

  await tx.hospitalityRider.create({
    data: {
      guestId: vipGuest.id,
      dietaryNeeds: ["Synthetic: halal catering"],
      roomPreferences: ["Synthetic: quiet room"],
      vehicleRider: ["Synthetic: sedan, cabin at 21C"],
      securityNotes: ["Synthetic: bilingual captain"],
      fulfilled: false
    }
  });
  bump("HospitalityRider");

  const driverOne = await tx.driver.create({
    data: {
      userId: users.driver.id,
      licenseNo: "DEMO-LIC-0001",
      nationalIdIqama: "DEMO-ID-0001",
      currentLat: 24.7600,
      currentLng: 46.6450,
      zone: "CENTRAL_ZONE",
      status: "ASSIGNED",
      captainType: "VIP_CAPTAIN",
      shiftStart: at(-120),
      shiftEnd: at(480),
      lastLocationAt: now
    }
  });
  const driverTwo = await tx.driver.create({
    data: {
      userId: users.driverTwo.id,
      licenseNo: "DEMO-LIC-0002",
      nationalIdIqama: "DEMO-ID-0002",
      currentLat: 24.8100,
      currentLng: 46.6700,
      zone: "NORTH_ZONE",
      status: "AVAILABLE",
      captainType: "SHUTTLE",
      shiftStart: at(-60),
      shiftEnd: at(540),
      lastLocationAt: now
    }
  });
  bump("Driver", 2);

  await tx.task.createMany({
    data: [
      {
        eventId: event.id,
        driverId: driverOne.id,
        guestId: vipGuest.id,
        type: "AIRPORT_PICKUP",
        status: "ASSIGNED",
        pickupLocation: "Demo Airport Terminal (Synthetic)",
        dropoffLocation: "Demo Hotel (Synthetic)",
        pickupLat: 24.9576,
        pickupLng: 46.6988,
        dropoffLat: 24.6907,
        dropoffLng: 46.6851,
        scheduledAt: at(45),
        deadlineAt: at(105),
        ownerName: "VIP-D01"
      },
      {
        eventId: event.id,
        driverId: driverTwo.id,
        guestId: standardGuest.id,
        type: "VENUE_TRANSFER",
        status: "ASSIGNED",
        pickupLocation: "Demo Hotel (Synthetic)",
        dropoffLocation: "Demo Venue Hall (Synthetic)",
        pickupLat: 24.6907,
        pickupLng: 46.6851,
        dropoffLat: 24.7642,
        dropoffLng: 46.6406,
        scheduledAt: at(150),
        deadlineAt: at(210),
        ownerName: "GST-D02"
      },
      {
        eventId: event.id,
        guestId: standardGuest.id,
        type: "HOTEL_TRANSFER",
        status: "PENDING",
        pickupLocation: "Demo Venue Hall (Synthetic)",
        dropoffLocation: "Demo Hotel (Synthetic)",
        scheduledAt: at(420),
        ownerName: "GST-D02"
      }
    ]
  });
  bump("Task", 3);

  const hotelSupplier = await tx.supplier.create({
    data: {
      userId: users.supplier.id,
      cityId: city.id,
      name: "Demo Hotel Supplier (Synthetic)",
      category: "HOTEL",
      rating: 4.6,
      verified: true,
      crNumber: "DEMO-CR-0001",
      commissionPercent: 12,
      zone: "CENTRAL_ZONE"
    }
  });
  const fleetSupplier = await tx.supplier.create({
    data: {
      cityId: city.id,
      name: "Demo Fleet Supplier (Synthetic)",
      category: "CAR",
      rating: 4.4,
      verified: true,
      crNumber: "DEMO-CR-0002",
      commissionPercent: 15,
      zone: "NORTH_ZONE"
    }
  });
  bump("Supplier", 2);

  const suiteService = await tx.service.create({
    data: {
      supplierId: hotelSupplier.id,
      name: "Demo suite night (Synthetic)",
      price: 1200,
      unit: "night",
      description: "Synthetic service for the showcase."
    }
  });
  const transferService = await tx.service.create({
    data: {
      supplierId: fleetSupplier.id,
      name: "Demo VIP transfer (Synthetic)",
      price: 300,
      unit: "trip",
      description: "Synthetic service for the showcase."
    }
  });
  bump("Service", 2);

  await tx.booking.createMany({
    data: [
      {
        eventId: event.id,
        supplierId: hotelSupplier.id,
        serviceId: suiteService.id,
        quantity: 10,
        totalPrice: 12000,
        commissionPercent: 12,
        commissionAmount: 1440,
        status: "CONFIRMED"
      },
      {
        eventId: event.id,
        supplierId: fleetSupplier.id,
        serviceId: transferService.id,
        quantity: 20,
        totalPrice: 6000,
        commissionPercent: 15,
        commissionAmount: 900,
        status: "PENDING"
      }
    ]
  });
  bump("Booking", 2);

  // In-app rows only: no provider, phone or delivery attempt.
  await tx.notification.createMany({
    data: [
      {
        userId: users.guestVip.id,
        title: "Welcome (demo)",
        body: "Synthetic in-app message: your captain is assigned.",
        channel: "IN_APP"
      },
      {
        userId: users.eventLead.id,
        title: "Operations ready (demo)",
        body: "Synthetic in-app message: two captains are on shift.",
        channel: "IN_APP"
      }
    ]
  });
  bump("Notification", 2);

  const intake = await tx.activityIntake.create({
    data: {
      eventId: event.id,
      activityName: "Demo delegation programme (Synthetic)",
      activityPlace: "Demo Venue Hall (Synthetic)",
      visitorCount: 24,
      vipVisitorCount: 6,
      normalVisitorCount: 18,
      transportationType: "MIXED",
      ticketType: "MIXED",
      hotelType: "MIXED",
      carType: "MIXED",
      status: "QUOTING",
      // Bootstrap scopes company intakes by the submitting account's email.
      submittedBy: users.company.email,
      submittedAt: at(-1440)
    }
  });
  bump("ActivityIntake");

  await tx.aiLogisticsPlan.create({
    data: {
      intakeId: intake.id,
      summary: "Draft advisory plan (synthetic). Requires manager review; not confirmed.",
      assumptions: ["Synthetic: 6 VIP guests use dedicated cars.", "Synthetic: 18 guests share shuttles."],
      visitorGrouping: "6 VIP dedicated vehicles; 18 guests in shuttle groups (synthetic).",
      vipCars: 6,
      shuttleVehicles: 5,
      hotelRooms: 20,
      firstClassTickets: 6,
      normalTickets: 18,
      phases: [
        { name: "Quote collection", owner: "Demo Procurement (Synthetic)", deadline: at(1440).toISOString(), status: "PLANNED" }
      ],
      risks: ["Synthetic: evening traffic near the venue."],
      confirmed: false
    }
  });
  bump("AiLogisticsPlan");

  await tx.vendorQuote.createMany({
    data: [
      {
        intakeId: intake.id,
        category: "HOTEL_OPERATOR",
        vendorName: "Demo Hotel Supplier (Synthetic)",
        item: "20 rooms, 3 nights (synthetic)",
        quantity: 20,
        unitPrice: 1200,
        totalPrice: 24000,
        commissionPercent: 12,
        commissionAmount: 2880,
        score: 88,
        status: "RECEIVED",
        isVaultSealed: true
      },
      {
        intakeId: intake.id,
        category: "CAR_RENTAL",
        vendorName: "Demo Fleet Supplier (Synthetic)",
        item: "6 sedans, 3 days (synthetic)",
        quantity: 6,
        unitPrice: 900,
        totalPrice: 5400,
        commissionPercent: 15,
        commissionAmount: 810,
        score: 84,
        status: "RECEIVED",
        isVaultSealed: true
      }
    ]
  });
  bump("VendorQuote", 2);

  await tx.vaultSession.create({ data: { intakeId: intake.id, status: "LOCKED" } });
  bump("VaultSession");

  await tx.guestJourneyRecord.createMany({
    data: [
      {
        guestId: vipGuest.id,
        stage: "ARRIVAL",
        arrivalStatus: "PRE_ARRIVAL",
        arrivalGate: "DEMO-A1",
        promoVideos: [],
        driverName: users.driver.name,
        driverPhone: users.driver.phone,
        carDetails: "Demo sedan, plate DEMO-01 (synthetic)",
        etaMinutes: 45,
        personalTripRequests: [],
        notes: ["Synthetic journey record for the showcase."],
        complaints: [],
        departureFlight: "DEMO-001",
        departurePickupTime: at(4320),
        departureConfirmed: false,
        leavingWithMidyaf: true
      },
      {
        guestId: standardGuest.id,
        stage: "EVENT_TRANSPORTATION",
        arrivalStatus: "PICKED_UP",
        arrivalGate: "DEMO-B2",
        promoVideos: [],
        driverName: users.driverTwo.name,
        driverPhone: users.driverTwo.phone,
        carDetails: "Demo shuttle, plate DEMO-02 (synthetic)",
        etaMinutes: 150,
        personalTripRequests: [],
        notes: ["Synthetic journey record for the showcase."],
        complaints: [],
        departureFlight: "DEMO-002",
        departurePickupTime: at(4380),
        departureConfirmed: false,
        leavingWithMidyaf: true
      }
    ]
  });
  bump("GuestJourneyRecord", 2);

  await tx.coordinatorRequest.create({
    data: {
      guestName: "VIP-D01",
      request: "Synthetic: extra water in the vehicle",
      route: "Demo Hotel to Demo Venue Hall",
      priority: "VIP",
      status: "NEW",
      supervisor: "Demo Supervisor (Synthetic)",
      deadline: at(60)
    }
  });
  bump("CoordinatorRequest");

  await tx.companyReport.create({
    data: {
      title: "Demo daily logistics report (Synthetic draft)",
      status: "DRAFT",
      kpis: [
        { label: "Synthetic arrivals planned", value: "2" },
        { label: "Synthetic captains on shift", value: "2" }
      ]
    }
  });
  bump("CompanyReport");

  return Object.fromEntries(APPLICATION_MODELS.map((model) => [model, created[model] ?? 0]));
}

// ---------------------------------------------------------------------------
// Provisioning command
// ---------------------------------------------------------------------------

export type DemoClient = PrismaClient;

export type ProvisionDeps = {
  root: string;
  readFile?: ReadTextFile;
  rootExists?: (file: string) => boolean;
  createClient: (url: string) => Promise<DemoClient>;
  credentialStore: CredentialStore;
  schemaPush: (target: DemoTarget) => void;
  hashPassword?: HashPassword;
  random?: RandomBytes;
  now?: () => Date;
  log: (line: string) => void;
};

export type ProvisionOutcome =
  | { mode: "plan"; target: DemoTarget }
  | { mode: "apply"; target: DemoTarget; status: "complete"; counts: Record<string, number> };

export const TRANSACTION_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 20_000,
  timeout: 120_000
};

function formatCounts(counts: Record<string, number>) {
  return Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([model, count]) => `${model}=${count}`)
    .join(", ");
}

function logTarget(log: (line: string) => void, target: DemoTarget) {
  log(`Target host: ${target.host}`);
  log(`Target database: ${target.database}`);
  log(`Target schema: ${target.schema}`);
}

export async function runProvision(argv: string[], deps: ProvisionDeps): Promise<ProvisionOutcome> {
  const options = parseProvisionArgs(argv);
  assertRepositoryRoot(deps.root, deps.rootExists);
  const target = validateTargetUrl(loadTargetUrl(deps.root, deps.readFile));

  if (!options.apply) {
    deps.log("MIDYAF demo provisioning: PLAN (no connection, no writes, no secrets generated)");
    logTarget(deps.log, target);
    if (options.expectedHost) {
      deps.log(`Expected host pin: ${options.expectedHost === target.host ? "matches" : "DOES NOT MATCH"}`);
    }
    deps.log(
      `Credentials file: ${deps.credentialStore.displayPath} (${
        deps.credentialStore.exists() ? "present: apply would refuse" : "absent"
      })`
    );
    deps.log(`Planned records: ${formatCounts(plannedCounts())}`);
    deps.log("Apply: npm run demo:provision -- --apply --expected-host <host> [--create-schema]");
    return { mode: "plan", target };
  }

  assertExpectedHost(target, options.expectedHost);
  if (deps.credentialStore.exists()) {
    throw new DemoProvisioningError("credentials-file-exists");
  }

  const db = await guarded("database-error", () => deps.createClient(target.url));
  try {
    if (options.createSchema) {
      await assertTargetEmpty(db);
      deps.schemaPush(target);
    }
    await assertSchemaComplete(db, target.schema);
    await assertApplicationDataEmpty(db);

    // Secrets and hashes exist only from here on, before any write.
    const passwords = generateAccountPasswords(deps.random);
    const hashPassword = deps.hashPassword ?? hashDemoPassword;
    const hashes = {} as AccountHashes;
    for (const account of DEMO_ACCOUNTS) {
      hashes[account.key] = await hashPassword(passwords[account.key]);
    }

    const now = deps.now?.() ?? new Date();
    const bundle: CredentialBundle = {
      format: CREDENTIALS_FORMAT,
      status: "pending",
      createdAt: now.toISOString(),
      target: { host: target.host, database: target.database, schema: target.schema },
      accounts: DEMO_ACCOUNTS.map((account) => ({
        key: account.key,
        email: account.email,
        role: account.role,
        password: passwords[account.key]
      }))
    };

    // Saved, flushed and closed before the transaction, so a commit can never
    // leave accounts whose passwords were not recorded. Status updates below
    // replace the file atomically or leave this pending bundle untouched.
    const handle = deps.credentialStore.reserve(bundle);
    let counts: Record<string, number>;
    try {
      counts = await db.$transaction(async (tx) => {
        await assertApplicationDataEmpty(tx);
        return writeDemoFixtures(tx, hashes, now);
      }, TRANSACTION_OPTIONS);
    } catch (error) {
      try {
        handle.update({ ...bundle, status: "failed" });
      } catch {
        // The transaction failure is the reported reason; the bundle stays pending.
      }
      if (error instanceof DemoProvisioningError) throw error;
      throw new DemoProvisioningError("transaction-failed");
    }

    try {
      handle.update({ ...bundle, status: "complete" });
    } catch {
      throw new DemoProvisioningError("credentials-status-not-updated");
    }

    deps.log("MIDYAF demo provisioning: APPLY");
    logTarget(deps.log, target);
    deps.log(`Status: complete`);
    deps.log(`Credentials file: ${deps.credentialStore.displayPath}`);
    deps.log(`Records created: ${formatCounts(counts)}`);
    return { mode: "apply", target, status: "complete", counts };
  } finally {
    await db.$disconnect().catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------
// Verification (read-only database checks + loopback HTTP smoke)
// ---------------------------------------------------------------------------

export type CheckResult = { name: string; ok: boolean };

export type ShapeContext = {
  eventId: string;
  intakeId: string;
  supplierId: string;
  guestIds: Partial<Record<DemoAccountKey, string>>;
  driverIds: Partial<Record<DemoAccountKey, string>>;
};

const BCRYPT_COST_PATTERN = new RegExp(`^\\$2[aby]\\$${BCRYPT_COST}\\$`);

/** Read-only shape checks; passwords are compared with bcrypt and never printed. */
export async function checkLiveShape(
  db: DemoClient,
  bundle: CredentialBundle
): Promise<{ checks: CheckResult[]; context: ShapeContext }> {
  const checks: CheckResult[] = [];
  const check = (name: string, ok: boolean) => checks.push({ name, ok });
  const byKey = new Map(bundle.accounts.map((account) => [account.key, account]));
  const emailOf = (key: DemoAccountKey) => byKey.get(key)?.email ?? "";

  await assertSchemaComplete(db, bundle.target.schema);

  return guarded("database-error", async () => {
    const users = await db.user.findMany({ select: { id: true, email: true, role: true, name: true, passwordHash: true } });
    const userByEmail = new Map(users.map((user) => [user.email, user]));
    const userIdOf = (key: DemoAccountKey) => userByEmail.get(emailOf(key))?.id ?? "";

    check("accounts: exactly the bundle accounts exist", users.length === bundle.accounts.length &&
      bundle.accounts.every((account) => userByEmail.get(account.email)?.role === account.role));
    check("accounts: names are labelled synthetic", users.every((user) => /Synthetic/.test(user.name)));
    check("accounts: bcrypt cost 12", users.every((user) => BCRYPT_COST_PATTERN.test(user.passwordHash)));
    let matches = 0;
    for (const account of bundle.accounts) {
      const hash = userByEmail.get(account.email)?.passwordHash;
      if (hash && (await bcrypt.compare(account.password, hash))) matches += 1;
    }
    check("accounts: every bundle password matches its bcrypt hash", matches === bundle.accounts.length);
    const distinctHashes = new Set(users.map((user) => user.passwordHash));
    check("accounts: no shared password hash", distinctHashes.size === users.length);

    const event = await db.event.findFirst({
      where: { status: "LIVE", organizerId: userIdOf("eventLead") },
      include: { city: true, guests: { include: { hospitalityRider: true } }, tasks: true, bookings: true }
    });
    check("event: LIVE event owned by the ORGANIZER persona", Boolean(event));
    check("event: linked to the riyadh city", event?.city?.code === "riyadh");

    const guestFor = (key: DemoAccountKey) => event?.guests.find((guest) => guest.userId === userIdOf(key));
    const vipGuest = guestFor("guestVip");
    const standardGuest = guestFor("guest");
    check("guests: VIP and second guest on the event", Boolean(vipGuest && standardGuest));
    check("guests: VIP hospitality rider", Boolean(vipGuest?.hospitalityRider));

    const drivers = await db.driver.findMany({ select: { id: true, userId: true, licenseNo: true, nationalIdIqama: true } });
    const driverFor = (key: DemoAccountKey) => drivers.find((driver) => driver.userId === userIdOf(key));
    check("drivers: two captain profiles", Boolean(driverFor("driver") && driverFor("driverTwo")));
    check("drivers: licence and ID values are synthetic", drivers.every((driver) =>
      driver.licenseNo.startsWith("DEMO-") && driver.nationalIdIqama.startsWith("DEMO-")));

    const linkedTasks = (event?.tasks ?? []).filter((task) => task.driverId && task.guestId);
    check("tasks: at least two driver/guest tasks", linkedTasks.length >= 2);
    check("tasks: captain one assigned to the VIP guest", linkedTasks.some((task) =>
      task.driverId === driverFor("driver")?.id && task.guestId === vipGuest?.id));

    const supplier = await db.supplier.findFirst({
      where: { userId: userIdOf("supplier") },
      include: { services: true }
    });
    check("supplier: linked to the supplier account with services", Boolean(supplier && supplier.services.length > 0));
    check("supplier: booking on the event", Boolean(event?.bookings.some((booking) => booking.supplierId === supplier?.id)));

    const intake = await db.activityIntake.findFirst({ where: { submittedBy: emailOf("company"), eventId: event?.id ?? "" } });
    check("intake: submitted by the company account email", Boolean(intake));
    const intakeId = intake?.id ?? "";
    const plans = await db.aiLogisticsPlan.findMany({ where: { intakeId } });
    check("plan: draft advisory plan, not confirmed", plans.length > 0 && plans.every((plan) => !plan.confirmed));
    const quotes = await db.vendorQuote.findMany({ where: { intakeId } });
    check("quotes: present and none approved", quotes.length > 0 && quotes.every((quote) => quote.status !== "APPROVED"));
    const vault = await db.vaultSession.findUnique({ where: { intakeId } });
    check("vault: LOCKED", vault?.status === "LOCKED");
    check("contracts: none", (await db.vendorContract.count()) === 0);

    const inApp = await db.notification.count({ where: { channel: "IN_APP", provider: null, recipientPhone: null } });
    check("notifications: in-app only, no provider", inApp > 0 && (await db.notification.count({ where: { provider: { not: null } } })) === 0);
    const journeys = await db.guestJourneyRecord.count({ where: { guestId: { in: [vipGuest?.id ?? "", standardGuest?.id ?? ""] } } });
    check("journeys: synthetic journey records", journeys >= 1);
    check("report: draft company report", (await db.companyReport.count({ where: { status: "DRAFT" } })) >= 1);
    check("files: no stored file assets", (await db.fileAsset.count()) === 0);

    return {
      checks,
      context: {
        eventId: event?.id ?? "",
        intakeId,
        supplierId: supplier?.id ?? "",
        guestIds: { guestVip: vipGuest?.id, guest: standardGuest?.id },
        driverIds: { driver: driverFor("driver")?.id, driverTwo: driverFor("driverTwo")?.id }
      }
    };
  });
}

type Body = Record<string, any>;

const list = (value: unknown): Body[] => (Array.isArray(value) ? (value as Body[]) : []);
const ids = (value: unknown) => list(value).map((item) => item.id as string);
const hasEvent = (body: Body, ctx: ShapeContext) => ids(body.events).includes(ctx.eventId);
const eventGuests = (body: Body) => list(body.events).flatMap((event) => list(event.guests));
const eventTasks = (body: Body) => list(body.events).flatMap((event) => list(event.tasks));

const fullAccess = (body: Body, ctx: ShapeContext) =>
  hasEvent(body, ctx) &&
  list(body.drivers).length >= 2 &&
  list(body.suppliers).length >= 2 &&
  list(body.vendorQuotes).length >= 1 &&
  ids(body.activityIntakes).includes(ctx.intakeId);

const ownGuestView = (key: "guestVip" | "guest", driverKey: "driver" | "driverTwo") => (body: Body, ctx: ShapeContext) =>
  list(body.events).length === 1 &&
  hasEvent(body, ctx) &&
  eventGuests(body).length === 1 &&
  eventGuests(body)[0]?.id === ctx.guestIds[key] &&
  eventTasks(body).every((task) => task.guestId === ctx.guestIds[key]) &&
  ids(body.drivers).length === 1 &&
  ids(body.drivers)[0] === ctx.driverIds[driverKey] &&
  list(body.suppliers).length === 0 &&
  list(body.vendorQuotes).length === 0;

const ownDriverView = (key: "driver" | "driverTwo") => (body: Body, ctx: ShapeContext) =>
  hasEvent(body, ctx) &&
  ids(body.drivers).length === 1 &&
  ids(body.drivers)[0] === ctx.driverIds[key] &&
  eventTasks(body).length > 0 &&
  eventTasks(body).every((task) => task.driverId === ctx.driverIds[key]) &&
  list(body.suppliers).length === 0;

/**
 * Bootstrap visibility expected per account under the current role policy.
 * COORDINATOR and COMPANY_ORGANIZER intentionally fail closed for suppliers
 * and quotes; the client persona has no intake, so it sees no event.
 */
export const BOOTSTRAP_EXPECTATIONS: Record<DemoAccountKey, (body: Body, ctx: ShapeContext) => boolean> = {
  admin: fullAccess,
  logistics: fullAccess,
  eventLead: fullAccess,
  coordinator: (body, ctx) =>
    hasEvent(body, ctx) &&
    list(body.drivers).length >= 2 &&
    list(body.suppliers).length === 0 &&
    list(body.vendorQuotes).length === 0,
  company: (body, ctx) =>
    hasEvent(body, ctx) &&
    ids(body.activityIntakes).includes(ctx.intakeId) &&
    eventGuests(body).length === 0 &&
    list(body.suppliers).length === 0 &&
    list(body.vendorQuotes).length === 0,
  client: (body) =>
    list(body.events).length === 0 &&
    list(body.activityIntakes).length === 0 &&
    list(body.vendorQuotes).length === 0 &&
    list(body.suppliers).length === 0,
  supplier: (body, ctx) =>
    hasEvent(body, ctx) &&
    ids(body.suppliers).length === 1 &&
    ids(body.suppliers)[0] === ctx.supplierId &&
    list(body.events).every((event) => list(event.bookings).every((booking) => booking.supplierId === ctx.supplierId)) &&
    list(body.vendorQuotes).length === 0,
  driver: ownDriverView("driver"),
  driverTwo: ownDriverView("driverTwo"),
  guestVip: ownGuestView("guestVip", "driver"),
  guest: ownGuestView("guest", "driverTwo")
};

export type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) =>
  Promise<{ status: number; text(): Promise<string> }>;

async function call(fetchImpl: FetchLike, url: string, init: Parameters<FetchLike>[1] = {}) {
  const res = await fetchImpl(url, init);
  const text = await res.text();
  let json: Body = {};
  try {
    json = JSON.parse(text) as Body;
  } catch {
    // Non-JSON body; checks on it simply fail.
  }
  return { status: res.status, text, json };
}

const leaksSecrets = (text: string, json: Body, password?: string) =>
  findSensitiveFieldPaths(json).length > 0 || (password ? text.includes(password) : false);

/**
 * Real login, /auth/me and /bootstrap for every bundle account against the
 * loopback server, plus generic denials. Only check names and pass/fail are
 * returned; no token or response body leaves this function.
 */
export async function runHttpSmoke(
  baseUrl: string,
  bundle: CredentialBundle,
  ctx: ShapeContext,
  fetchImpl: FetchLike,
  random: RandomBytes = nodeRandomBytes
): Promise<CheckResult[]> {
  const checks: CheckResult[] = [];
  const check = (name: string, ok: boolean) => checks.push({ name, ok });
  const json = (body: unknown) => ({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  for (const account of bundle.accounts) {
    const label = `${account.key} (${account.role})`;
    const login = await call(fetchImpl, `${baseUrl}/api/auth/login`, json({ email: account.email, password: account.password }));
    const token = typeof login.json.accessToken === "string" ? (login.json.accessToken as string) : "";
    check(
      `login ${label}: 200 with matching role and no secrets`,
      login.status === 200 &&
        Boolean(token) &&
        login.json.user?.email === account.email &&
        login.json.user?.role === account.role &&
        !leaksSecrets(login.text, login.json, account.password)
    );
    if (!token) continue;

    const auth = { headers: { Authorization: `Bearer ${token}` } };
    const me = await call(fetchImpl, `${baseUrl}/api/auth/me`, auth);
    check(`me ${label}: 200 same user, no secrets`,
      me.status === 200 && me.json.user?.id === login.json.user?.id && !leaksSecrets(me.text, me.json, account.password));

    const boot = await call(fetchImpl, `${baseUrl}/api/bootstrap`, auth);
    check(`bootstrap ${label}: 200, no hash or national ID`,
      boot.status === 200 && !leaksSecrets(boot.text, boot.json, account.password));
    check(`bootstrap ${label}: role-scoped visibility`, boot.status === 200 && BOOTSTRAP_EXPECTATIONS[account.key](boot.json, ctx));
  }

  const denied = (result: { status: number; json: Body }) =>
    result.status === 401 &&
    result.json.error?.message === "Invalid email or password" &&
    result.json.accessToken === undefined &&
    result.json.user === undefined;

  for (const key of ["admin", "guestVip"] as const) {
    const account = bundle.accounts.find((entry) => entry.key === key);
    if (!account) continue;
    let wrong = generatePassword(random);
    if (wrong === account.password) wrong = `${wrong}x`;
    check(`denial ${key}: wrong password gives the generic 401`,
      denied(await call(fetchImpl, `${baseUrl}/api/auth/login`, json({ email: account.email, password: wrong }))));
  }
  check("denial: unknown synthetic account gives the generic 401",
    denied(await call(fetchImpl, `${baseUrl}/api/auth/login`, json({ email: "no.such.account@demo.invalid", password: generatePassword(random) }))));
  check("denial: bootstrap without a token is 401", (await call(fetchImpl, `${baseUrl}/api/bootstrap`)).status === 401);

  return checks;
}

export type SmokeServer = { baseUrl: string; close(): Promise<void> };

export type VerifyDeps = {
  root: string;
  readFile?: ReadTextFile;
  rootExists?: (file: string) => boolean;
  credentialStore: Pick<CredentialStore, "read" | "displayPath">;
  /** Builds the target client (and whatever the smoke server needs) after all guards pass. */
  connect: (target: DemoTarget) => Promise<{ db: DemoClient; startSmokeServer: () => Promise<SmokeServer> }>;
  fetch: FetchLike;
  log: (line: string) => void;
};

export async function runVerify(argv: string[], deps: VerifyDeps): Promise<{ passed: number; failed: number }> {
  const options = parseVerifyArgs(argv);
  assertRepositoryRoot(deps.root, deps.rootExists);
  const target = validateTargetUrl(loadTargetUrl(deps.root, deps.readFile));
  assertExpectedHost(target, options.expectedHost);

  const bundle = deps.credentialStore.read();
  if (bundle.status === "failed") {
    throw new DemoProvisioningError("credentials-file-failed-run");
  }
  if (bundle.target.host !== target.host || bundle.target.database !== target.database) {
    throw new DemoProvisioningError("credentials-file-host-mismatch");
  }

  const { db, startSmokeServer } = await guarded("database-error", () => deps.connect(target));
  let server: SmokeServer | undefined;
  try {
    const shape = await checkLiveShape(db, bundle);
    server = await guarded("smoke-server-failed", startSmokeServer);
    const http = await guarded("verification-failed", () => runHttpSmoke(server!.baseUrl, bundle, shape.context, deps.fetch));
    const checks = [...shape.checks, ...http];

    deps.log("MIDYAF demo verification (read-only)");
    logTarget(deps.log, target);
    deps.log(`Credentials file: ${deps.credentialStore.displayPath} (status: ${bundle.status})`);
    for (const entry of checks) {
      deps.log(`${entry.ok ? "PASS" : "FAIL"}  ${entry.name}`);
    }
    const failed = checks.filter((entry) => !entry.ok).length;
    deps.log(`Verification: ${checks.length - failed} passed, ${failed} failed`);
    if (failed > 0) {
      throw new DemoProvisioningError("verification-failed");
    }
    return { passed: checks.length, failed };
  } finally {
    if (server) await server.close().catch(() => undefined);
    await db.$disconnect().catch(() => undefined);
  }
}
