import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error ESM .mjs ops helper imported directly for unit testing
import { assertSafeOutputDir, buildBackupFilename, parseArgs, runBackup, sanitizeLabel } from "../../../scripts/ops/backup-db.mjs";

describe("scripts/ops/backup-db.mjs (PLAN_READY_1 Sprint 4)", () => {
  it("sanitizes labels and builds deterministic timestamped filenames", () => {
    expect(sanitizeLabel("Pre Event / Day 1!")).toBe("pre-event-day-1");
    expect(sanitizeLabel("   ")).toBe("snapshot");
    expect(buildBackupFilename("Pre Event", new Date("2026-11-24T09:15:30.000Z"))).toBe(
      "midyaf-pre-event-2026-11-24T09-15-30-000Z.dump"
    );
  });

  it("refuses to write backups inside the git repo or any OneDrive-synced folder", () => {
    const repo = path.resolve(os.tmpdir(), "midyaf-fake-repo");
    expect(() => assertSafeOutputDir(path.join(repo, "backups"), repo)).toThrow(/git repository/i);
    expect(() => assertSafeOutputDir(repo, repo)).toThrow(/git repository/i);
    expect(() =>
      assertSafeOutputDir(path.join(os.tmpdir(), "OneDrive", "Documents", "backups"), repo)
    ).toThrow(/OneDrive/i);

    const safeDir = path.join(os.tmpdir(), "midyaf-safe-backups-test");
    expect(assertSafeOutputDir(safeDir, repo)).toBe(path.resolve(safeDir));
  });

  it("supports --dry-run safely without touching disk or printing credentials", () => {
    const repo = path.resolve(os.tmpdir(), "midyaf-fake-repo");
    const safeDir = path.join(os.tmpdir(), "midyaf-dryrun-backups");
    const result = runBackup({
      argv: ["--dry-run", "--label", "rehearsal", "--out-dir", safeDir],
      env: { BACKUP_DATABASE_URL: "postgresql://secret-user:secret-pass@db.example.test/midyaf" },
      repoRoot: repo,
      now: new Date("2026-11-24T10:00:00.000Z"),
      runner: () => ({ status: 0, stdout: "pg_dump 17", stderr: "" })
    });

    expect(result).toMatchObject({
      ok: true,
      dryRun: true,
      pgDumpAvailable: true,
      hasDatabaseUrl: true
    });
    expect(JSON.stringify(result)).not.toContain("secret-pass");
    expect(JSON.stringify(result)).not.toContain("secret-user");
  });

  it("writes a SHA-256 checksum alongside the dump on successful backup", () => {
    const repo = path.resolve(os.tmpdir(), "midyaf-fake-repo");
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "midyaf-backup-ok-"));
    try {
      const result = runBackup({
        argv: ["--label", "daily", "--out-dir", outDir],
        env: { BACKUP_DATABASE_URL: "postgresql://u:p@localhost:5432/midyaf" },
        repoRoot: repo,
        now: new Date("2026-11-24T11:00:00.000Z"),
        runner: (_cmd: string, args: string[]) => {
          const fileArg = args.find((a) => a.startsWith("--file="))!.slice("--file=".length);
          fs.writeFileSync(fileArg, "synthetic-dump-bytes");
          return { status: 0, stdout: "", stderr: "" };
        }
      });

      expect(result.ok).toBe(true);
      expect(result.dryRun).toBe(false);
      expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(fs.existsSync(result.checksumPath)).toBe(true);
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  });

  it("keeps credentials out of pg_dump argv and handles Prisma/Neon URLs", () => {
    const repo = path.resolve(os.tmpdir(), "midyaf-fake-repo");
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "midyaf-backup-env-"));
    let seenArgs: string[] = [];
    let seenEnv: Record<string, string | undefined> = {};
    try {
      runBackup({
        argv: ["--label", "pre-event", "--out-dir", outDir],
        env: {
          DATABASE_URL:
            "postgresql://neon_user:s3cr3t-pass@ep-cool-1234-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require&schema=midyaf&pgbouncer=true"
        },
        repoRoot: repo,
        runner: (_cmd: string, args: string[], opts: { env: Record<string, string | undefined> }) => {
          seenArgs = args;
          seenEnv = opts.env;
          const fileArg = args.find((a) => a.startsWith("--file="))!.slice("--file=".length);
          fs.writeFileSync(fileArg, "synthetic-dump-bytes");
          return { status: 0, stdout: "", stderr: "" };
        }
      });
      expect(seenArgs.join(" ")).not.toContain("s3cr3t-pass");
      expect(seenArgs.join(" ")).not.toContain("postgresql://");
      expect(seenArgs).toContain("--schema=midyaf");
      expect(seenEnv.PGPASSWORD).toBe("s3cr3t-pass");
      expect(seenEnv.PGHOST).toBe("ep-cool-1234.eu-central-1.aws.neon.tech");
      expect(seenEnv.PGDATABASE).toBe("neondb");
      expect(seenEnv.PGSSLMODE).toBe("require");
      expect(seenEnv.DATABASE_URL).toBeUndefined();
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  });

  it("redacts the password from pg_dump failure output", () => {
    const repo = path.resolve(os.tmpdir(), "midyaf-fake-repo");
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "midyaf-backup-fail-"));
    try {
      expect(() =>
        runBackup({
          argv: ["--out-dir", outDir],
          env: { BACKUP_DATABASE_URL: "postgresql://u:leaky-pass@localhost:5432/midyaf" },
          repoRoot: repo,
          runner: () => ({ status: 1, stdout: "", stderr: "connection failed for password leaky-pass\n" })
        })
      ).toThrow(/pg_dump failed with exit code 1: connection failed for password \*\*\*/);
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  });

  it("rejects unknown CLI arguments", () => {
    expect(() => parseArgs(["--invalid-flag"])).toThrow(/Unknown argument/);
  });
});
