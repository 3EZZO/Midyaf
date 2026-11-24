import { randomInt } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import bcrypt from "bcryptjs";
import { PrismaClient, Role } from "@prisma/client";
import { z } from "zod";

/**
 * Operational bootstrap CLI for a fresh, schema-only live database.
 *
 * Usage:
 *   TARGET_DATABASE_URL="postgresql://..." npm run ops:first-admin -- \
 *     --email admin@example.com --name "Admin Name" --phone "+9665XXXXXXXX" \
 *     --out /safe/path/outside-repo-and-onedrive/admin.txt
 *
 * Safety rules:
 * - Reads target connection string ONLY from TARGET_DATABASE_URL (never DATABASE_URL).
 * - Appends schema=midyaf when no schema query parameter is present (matching start.mjs).
 * - Refuses (exit 1) if any SUPER_ADMIN already exists, or if email/phone already exists.
 * - Generates a >=20-char crypto-random password hashed with bcrypt cost 12.
 * - Never prints the password or TARGET_DATABASE_URL to stdout or stderr.
 * - Refuses to write --out inside the git repo or any OneDrive-synced folder; writes mode 0600.
 */

export const LEGACY_SCHEMA = "midyaf";
export const BCRYPT_COST = 12;
export const MIN_PASSWORD_LENGTH = 20;
export const DEFAULT_PASSWORD_LENGTH = 24;
export const FIRST_ADMIN_AUDIT_ACTION = "ops.first_admin.created";

const UPPERCASE = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWERCASE = "abcdefghijkmnopqrstuvwxyz";
const DIGITS = "23456789";
const SYMBOLS = "!@#$%^&*()-_=+?";
const ALL_PASSWORD_CHARS = `${UPPERCASE}${LOWERCASE}${DIGITS}${SYMBOLS}`;

const inputSchema = z.object({
  email: z.string().trim().email("Valid --email is required").max(254).toLowerCase(),
  name: z.string().trim().min(2, "--name must be at least 2 characters").max(120),
  phone: z
    .string()
    .trim()
    .regex(/^\+9665\d{8}$/, "--phone must match +9665XXXXXXXX"),
  outPath: z.string().trim().min(1, "--out file path is required")
});

export type FirstAdminCliInput = z.infer<typeof inputSchema>;

export class FirstAdminError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "FirstAdminError";
    this.code = code;
  }
}

export function resolveTargetDatabaseUrl(
  env: Record<string, string | undefined>
): string {
  const rawUrl = env.TARGET_DATABASE_URL?.trim();
  if (!rawUrl) {
    throw new FirstAdminError(
      "missing_target_url",
      "TARGET_DATABASE_URL is required (DATABASE_URL is intentionally ignored)."
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new FirstAdminError(
      "invalid_target_url",
      "TARGET_DATABASE_URL must be a valid postgres:// or postgresql:// URL."
    );
  }

  if (!/^postgres(?:ql)?:$/i.test(parsed.protocol)) {
    throw new FirstAdminError(
      "invalid_target_url",
      "TARGET_DATABASE_URL must start with postgres:// or postgresql://."
    );
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

/**
 * Reuses the safe-output rules from scripts/ops/backup-db.mjs:
 * refuses paths inside the git repository or any OneDrive-synced folder.
 */
export function assertSafeOutputDir(outDir: string, repoRoot: string): string {
  const resolvedOut = path.resolve(outDir);
  const resolvedRepo = path.resolve(repoRoot);
  const normalizedOut = resolvedOut.toLowerCase();
  const normalizedRepo = resolvedRepo.toLowerCase();

  if (
    normalizedOut === normalizedRepo ||
    normalizedOut.startsWith(`${normalizedRepo}${path.sep}`)
  ) {
    throw new FirstAdminError(
      "unsafe_out_path",
      "Refusing to write credentials inside the git repository."
    );
  }

  if (/(^|[\\/])onedrive([\\/]|$)/i.test(resolvedOut)) {
    throw new FirstAdminError(
      "unsafe_out_path",
      "Refusing to write credentials inside a OneDrive-synced directory."
    );
  }

  return resolvedOut;
}

export function assertSafeOutputFile(outPath: string, repoRoot: string): string {
  const resolvedFile = assertSafeOutputDir(outPath, repoRoot);
  const parentDir = path.dirname(resolvedFile);
  assertSafeOutputDir(parentDir, repoRoot);

  // Also check canonical parent path if it already exists, to block symlinks into repo/OneDrive.
  if (fs.existsSync(parentDir)) {
    assertSafeOutputDir(fs.realpathSync(parentDir), repoRoot);
  }

  if (fs.existsSync(resolvedFile)) {
    throw new FirstAdminError(
      "out_file_exists",
      "Refusing to overwrite an existing --out file. Provide a new file path."
    );
  }

  return resolvedFile;
}

export function parseArgs(argv: string[]): FirstAdminCliInput {
  const raw: Record<string, string | undefined> = {};

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--") continue;

    let flag = token;
    let value: string | undefined;

    const eqIdx = token.indexOf("=");
    if (token.startsWith("--") && eqIdx !== -1) {
      flag = token.slice(0, eqIdx);
      value = token.slice(eqIdx + 1);
    } else if (
      token === "--email" ||
      token === "--name" ||
      token === "--phone" ||
      token === "--out"
    ) {
      value = argv[++i];
    } else {
      throw new FirstAdminError("unknown_argument", `Unknown argument: ${token}`);
    }

    if (value === undefined || value.startsWith("--")) {
      throw new FirstAdminError("missing_value", `Missing value for ${flag}`);
    }

    if (flag === "--email") raw.email = value;
    else if (flag === "--name") raw.name = value;
    else if (flag === "--phone") raw.phone = value;
    else if (flag === "--out") raw.outPath = value;
    else throw new FirstAdminError("unknown_argument", `Unknown argument: ${flag}`);
  }

  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    throw new FirstAdminError(
      "invalid_arguments",
      firstIssue?.message ?? "Invalid CLI arguments."
    );
  }

  return parsed.data;
}

export function generateStrongPassword(length = DEFAULT_PASSWORD_LENGTH): string {
  if (length < MIN_PASSWORD_LENGTH || length > 72) {
    throw new FirstAdminError(
      "invalid_password_length",
      `Password length must be between ${MIN_PASSWORD_LENGTH} and 72.`
    );
  }

  const chars: string[] = [
    UPPERCASE[randomInt(UPPERCASE.length)],
    LOWERCASE[randomInt(LOWERCASE.length)],
    DIGITS[randomInt(DIGITS.length)],
    SYMBOLS[randomInt(SYMBOLS.length)]
  ];

  while (chars.length < length) {
    chars.push(ALL_PASSWORD_CHARS[randomInt(ALL_PASSWORD_CHARS.length)]);
  }

  // Fisher-Yates shuffle using crypto.randomInt
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    const tmp = chars[i];
    chars[i] = chars[j];
    chars[j] = tmp;
  }

  return chars.join("");
}

export function sanitizeErrorMessage(
  error: unknown,
  secrets: Array<string | undefined> = []
): string {
  let text = error instanceof Error ? error.message : String(error);
  text = text.replace(/postgres(?:ql)?:\/\/[^\s'"]+/gi, "[REDACTED_URL]");
  for (const secret of secrets) {
    if (secret && secret.length > 0) {
      text = text.split(secret).join("[REDACTED]");
    }
  }
  return text;
}

function writeCredentialsFile(outFilePath: string, email: string, password: string): void {
  const parentDir = path.dirname(outFilePath);
  fs.mkdirSync(parentDir, { recursive: true, mode: 0o700 });

  const payload = `email=${email}\npassword=${password}\n`;
  const fd = fs.openSync(outFilePath, "wx", 0o600);
  try {
    fs.writeFileSync(fd, payload, { encoding: "utf8" });
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }

  // Explicitly enforce 0600 on POSIX regardless of process umask.
  try {
    fs.chmodSync(outFilePath, 0o600);
  } catch {
    // Windows ignores POSIX chmod bits.
  }
}

export type FirstAdminDbClient = {
  user: {
    findFirst: (args: any) => Promise<any>;
    create: (args: any) => Promise<any>;
  };
  auditLog: {
    create: (args: any) => Promise<any>;
  };
  $transaction: <T>(
    fn: (tx: any) => Promise<T>,
    options?: { timeout?: number; maxWait?: number }
  ) => Promise<T>;
  $disconnect?: () => Promise<void>;
};

export type CreateFirstAdminOptions = {
  env?: Record<string, string | undefined>;
  repoRoot?: string;
  createClient?: (targetDatabaseUrl: string) => FirstAdminDbClient | Promise<FirstAdminDbClient>;
  generatePassword?: () => string;
  hashPassword?: (password: string) => Promise<string>;
  log?: (line: string) => void;
};

export type CreateFirstAdminResult = {
  userId: string;
  email: string;
  outPath: string;
};

export async function runCreateFirstAdmin(
  argv: string[],
  options: CreateFirstAdminOptions = {}
): Promise<CreateFirstAdminResult> {
  const env = options.env ?? process.env;
  const repoRoot = options.repoRoot ?? process.cwd();
  const log = options.log ?? ((line: string) => console.log(line));
  const generatePassword = options.generatePassword ?? (() => generateStrongPassword());
  const hashPassword =
    options.hashPassword ?? ((password: string) => bcrypt.hash(password, BCRYPT_COST));

  const parsed = parseArgs(argv);
  const targetUrl = resolveTargetDatabaseUrl(env);
  const resolvedOut = assertSafeOutputFile(parsed.outPath, repoRoot);

  const client = options.createClient
    ? await options.createClient(targetUrl)
    : (new PrismaClient({ datasourceUrl: targetUrl, log: [] }) as unknown as FirstAdminDbClient);

  let generatedPassword: string | undefined;
  let wroteFile = false;

  try {
    const created = await client.$transaction(async (tx: FirstAdminDbClient) => {
      const existingAdmin = await tx.user.findFirst({
        where: { role: Role.SUPER_ADMIN },
        select: { id: true }
      });
      if (existingAdmin) {
        throw new FirstAdminError(
          "super_admin_exists",
          "Refusing to bootstrap: a SUPER_ADMIN account already exists."
        );
      }

      const existingEmail = await tx.user.findFirst({
        where: { email: parsed.email },
        select: { id: true }
      });
      if (existingEmail) {
        throw new FirstAdminError(
          "duplicate_email",
          "Refusing to bootstrap: an account with that email already exists."
        );
      }

      const existingPhone = await tx.user.findFirst({
        where: { phone: parsed.phone },
        select: { id: true }
      });
      if (existingPhone) {
        throw new FirstAdminError(
          "duplicate_phone",
          "Refusing to bootstrap: an account with that phone already exists."
        );
      }

      generatedPassword = generatePassword();
      if (
        generatedPassword.length < MIN_PASSWORD_LENGTH ||
        Buffer.byteLength(generatedPassword, "utf8") > 72
      ) {
        throw new FirstAdminError(
          "invalid_password",
          "Generated password did not meet length policy."
        );
      }

      const passwordHash = await hashPassword(generatedPassword);

      const user = await tx.user.create({
        data: {
          name: parsed.name,
          email: parsed.email,
          phone: parsed.phone,
          role: Role.SUPER_ADMIN,
          onboardingPending: false,
          language: "ar",
          passwordHash
        }
      });

      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          actorRole: Role.SUPER_ADMIN,
          action: FIRST_ADMIN_AUDIT_ACTION,
          entityType: "USER",
          entityId: user.id,
          metadata: {
            email: user.email,
            role: Role.SUPER_ADMIN,
            source: "ops:first-admin"
          }
        }
      });

      // Write credentials inside the transaction so a file write error rolls back the DB write.
      writeCredentialsFile(resolvedOut, user.email, generatedPassword);
      wroteFile = true;

      return { userId: String(user.id), email: String(user.email) };
      // Several Neon round trips + a bcrypt(12) hash can exceed Prisma's 5 s default
      // interactive-transaction timeout on a cold compute; allow 30 s.
    }, { timeout: 30_000, maxWait: 10_000 });

    log(
      `First SUPER_ADMIN created (id=${created.userId}, email=${created.email}). Credentials written to ${resolvedOut}.`
    );

    return {
      userId: created.userId,
      email: created.email,
      outPath: resolvedOut
    };
  } catch (error) {
    if (wroteFile) {
      try {
        fs.rmSync(resolvedOut, { force: true });
      } catch {
        // Best-effort cleanup if transaction rolled back after writing the file.
      }
    }
    if (error instanceof FirstAdminError) {
      throw error;
    }
    throw new FirstAdminError(
      "bootstrap_failed",
      sanitizeErrorMessage(error, [generatedPassword, env.TARGET_DATABASE_URL, targetUrl])
    );
  } finally {
    if (client.$disconnect) {
      await client.$disconnect().catch(() => undefined);
    }
  }
}

const isEntrypoint =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isEntrypoint) {
  runCreateFirstAdmin(process.argv.slice(2)).then(
    () => {
      process.exitCode = 0;
    },
    (error: unknown) => {
      const code = error instanceof FirstAdminError ? error.code : "bootstrap_failed";
      const message = sanitizeErrorMessage(error, [process.env.TARGET_DATABASE_URL]);
      console.error(`ops:first-admin FAILED [${code}] ${message}`);
      process.exitCode = 1;
    }
  );
}
