/**
 * PLAN_READY_1 Sprint 4: Safe local PostgreSQL backup wrapper (`pg_dump`).
 *
 * Safety rules:
 * - Never prints DATABASE_URL or credentials.
 * - Refuses to write inside a git repository or OneDrive-synced folder.
 * - Writes a SHA-256 checksum alongside the backup file.
 * - Supports `--dry-run` for non-destructive verification.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export function defaultBackupDir(platform = process.platform, env = process.env) {
  if (platform === "win32" && env.LOCALAPPDATA) {
    return path.join(env.LOCALAPPDATA, "midyaf-backups");
  }
  return path.join(os.homedir(), ".local", "share", "midyaf-backups");
}

export function sanitizeLabel(raw) {
  const cleaned = String(raw ?? "snapshot")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned.slice(0, 40) || "snapshot";
}

export function assertSafeOutputDir(outDir, repoRoot) {
  const resolvedOut = path.resolve(outDir);
  const resolvedRepo = path.resolve(repoRoot);
  const normalizedOut = resolvedOut.toLowerCase();
  const normalizedRepo = resolvedRepo.toLowerCase();

  if (
    normalizedOut === normalizedRepo ||
    normalizedOut.startsWith(`${normalizedRepo}${path.sep}`)
  ) {
    throw new Error("Refusing to write database backups inside the git repository.");
  }

  if (/(^|[\\/])onedrive([\\/]|$)/i.test(resolvedOut)) {
    throw new Error("Refusing to write database backups inside a OneDrive-synced directory.");
  }

  return resolvedOut;
}

export function parseArgs(argv) {
  let outDir = null;
  let label = "snapshot";
  let dryRun = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--out-dir" && argv[i + 1]) {
      outDir = argv[++i];
    } else if (arg === "--label" && argv[i + 1]) {
      label = argv[++i];
    } else if (arg === "--help" || arg === "-h") {
      return { help: true, outDir, label, dryRun };
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return { help: false, outDir, label: sanitizeLabel(label), dryRun };
}

/**
 * Turns a (Prisma-style) PostgreSQL URL into libpq PG* environment variables so the
 * password never appears in pg_dump's argv / the OS process list. Prisma-only query
 * params (schema, pgbouncer, connection_limit, ...) are dropped; `schema` becomes a
 * `--schema` argument. A Neon pooled host (`-pooler.`) is switched to the direct
 * endpoint because pg_dump must not run through PgBouncer.
 */
export function pgConnectionFromUrl(databaseUrl) {
  const url = new URL(databaseUrl);
  if (!/^postgres(?:ql)?:$/i.test(url.protocol)) {
    throw new Error("Connection string must start with postgres:// or postgresql://");
  }
  const host = url.hostname.replace("-pooler.", ".");
  const env = {
    PGHOST: host,
    PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.replace(/^\//, "")) || "postgres",
    PGSSLMODE: url.searchParams.get("sslmode") || "require",
    PGAPPNAME: "midyaf-backup"
  };
  const schema = url.searchParams.get("schema");
  return {
    env,
    schemaArgs: schema && /^[A-Za-z0-9_]+$/.test(schema) ? [`--schema=${schema}`] : [],
    pooledHostSwitched: host !== url.hostname
  };
}

/** Removes a password from pg_dump diagnostics before they are printed. */
export function redactSecret(text, secret) {
  const value = String(text ?? "");
  return secret ? value.split(secret).join("***") : value;
}

export function buildBackupFilename(label, now = new Date()) {
  const stamp = now.toISOString().replace(/[:.]/g, "-").replace(/Z$/, "Z");
  return `midyaf-${sanitizeLabel(label)}-${stamp}.dump`;
}

export function runBackup(options = {}) {
  const argv = options.argv ?? process.argv.slice(2);
  const env = options.env ?? process.env;
  const repoRoot = options.repoRoot ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const runner = options.runner ?? spawnSync;
  const parsed = parseArgs(argv);

  if (parsed.help) {
    return {
      ok: true,
      dryRun: true,
      message: "Usage: node scripts/ops/backup-db.mjs [--label pre-event] [--out-dir <non-synced-dir>] [--dry-run]"
    };
  }

  const outDir = assertSafeOutputDir(parsed.outDir ?? defaultBackupDir(process.platform, env), repoRoot);
  const databaseUrl = env.BACKUP_DATABASE_URL || env.DATABASE_URL || "";
  if (!parsed.dryRun && !/^postgres(?:ql)?:\/\//i.test(databaseUrl)) {
    throw new Error("Set BACKUP_DATABASE_URL (or DATABASE_URL) to a valid PostgreSQL connection string.");
  }

  const fileName = buildBackupFilename(parsed.label, options.now ?? new Date());
  const filePath = path.join(outDir, fileName);

  if (parsed.dryRun) {
    const version = runner("pg_dump", ["--version"], { encoding: "utf8" });
    return {
      ok: true,
      dryRun: true,
      outDir,
      filePath,
      pgDumpAvailable: version.status === 0,
      hasDatabaseUrl: /^postgres(?:ql)?:\/\//i.test(databaseUrl)
    };
  }

  fs.mkdirSync(outDir, { recursive: true, mode: 0o700 });
  const connection = pgConnectionFromUrl(databaseUrl);
  // Credentials travel only in the child's environment (PG* vars), never in argv.
  const result = runner(
    "pg_dump",
    [
      "--format=custom",
      "--compress=9",
      "--no-owner",
      "--no-privileges",
      ...connection.schemaArgs,
      `--file=${filePath}`
    ],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...env, ...connection.env, DATABASE_URL: undefined, BACKUP_DATABASE_URL: undefined }
    }
  );

  if (result.status !== 0) {
    fs.rmSync(filePath, { force: true });
    const detail = redactSecret(result.stderr, connection.env.PGPASSWORD).trim().split(/\r?\n/).slice(-3).join(" | ");
    throw new Error(`pg_dump failed with exit code ${result.status ?? "unknown"}${detail ? `: ${detail}` : ""}`);
  }

  const sha256 = createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
  const checksumPath = `${filePath}.sha256`;
  fs.writeFileSync(checksumPath, `${sha256}  ${fileName}\n`, { encoding: "utf8", mode: 0o600 });

  return {
    ok: true,
    dryRun: false,
    filePath,
    checksumPath,
    sha256
  };
}

const isDirectExecution =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectExecution) {
  try {
    const summary = runBackup();
    console.log(JSON.stringify(summary, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Backup failed");
    process.exit(1);
  }
}
