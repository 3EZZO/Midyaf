import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { afterEach, describe, expect, it } from "vitest";
import { createMemoryPrisma } from "../testing/memoryPrisma.js";
import {
  FIRST_ADMIN_AUDIT_ACTION,
  MIN_PASSWORD_LENGTH,
  assertSafeOutputDir,
  generateStrongPassword,
  resolveTargetDatabaseUrl,
  runCreateFirstAdmin
} from "./createFirstAdmin.js";

const tempDirs: string[] = [];

function makeSafeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "midyaf-first-admin-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("ops:first-admin (createFirstAdmin.ts)", () => {
  const targetUrl = "postgresql://liveuser:super-secret-db-pass@ep-live.neon.tech/neondb?sslmode=require";

  it("uses TARGET_DATABASE_URL only (never DATABASE_URL) and appends schema=midyaf", () => {
    expect(() =>
      resolveTargetDatabaseUrl({
        DATABASE_URL: "postgresql://wrong:pass@db.example/wrong"
      })
    ).toThrow(/TARGET_DATABASE_URL is required/);

    expect(
      resolveTargetDatabaseUrl({
        TARGET_DATABASE_URL: "postgresql://u:p@h.neon.tech/midyaf"
      })
    ).toBe("postgresql://u:p@h.neon.tech/midyaf?schema=midyaf");

    expect(
      resolveTargetDatabaseUrl({
        TARGET_DATABASE_URL: "postgresql://u:p@h.neon.tech/midyaf?sslmode=require"
      })
    ).toBe("postgresql://u:p@h.neon.tech/midyaf?sslmode=require&schema=midyaf");

    expect(
      resolveTargetDatabaseUrl({
        TARGET_DATABASE_URL: "postgresql://u:p@h.neon.tech/midyaf?sslmode=require&schema=custom"
      })
    ).toBe("postgresql://u:p@h.neon.tech/midyaf?sslmode=require&schema=custom");
  });

  it("refuses output paths inside the git repo or any OneDrive folder", () => {
    const fakeRepo = path.join(os.tmpdir(), "midyaf-fake-repo");
    expect(() => assertSafeOutputDir(path.join(fakeRepo, "admin.txt"), fakeRepo)).toThrow(
      /git repository/i
    );
    expect(() =>
      assertSafeOutputDir(path.join(os.tmpdir(), "OneDrive", "Documents", "admin.txt"), fakeRepo)
    ).toThrow(/OneDrive/i);
  });

  it("creates the first SUPER_ADMIN with bcrypt cost 12, audit log, 0600 out file, and prints nothing secret", async () => {
    const mem = createMemoryPrisma();
    const outDir = makeSafeTempDir();
    const outFile = path.join(outDir, "first-admin.creds");
    const logs: string[] = [];
    let capturedUrl = "";

    const result = await runCreateFirstAdmin(
      [
        "--email",
        "Owner@Midyaf.SA",
        "--name",
        "Live Event Owner",
        "--phone",
        "+966501234567",
        "--out",
        outFile
      ],
      {
        env: {
          TARGET_DATABASE_URL: targetUrl,
          DATABASE_URL: "postgresql://ignored:ignored@wrong.example/ignored"
        },
        repoRoot: path.join(os.tmpdir(), "midyaf-other-repo"),
        createClient: (url) => {
          capturedUrl = url;
          return mem.prisma;
        },
        log: (line) => logs.push(line)
      }
    );

    expect(capturedUrl).toBe(`${targetUrl}&schema=midyaf`);
    expect(result.email).toBe("owner@midyaf.sa");
    expect(result.outPath).toBe(path.resolve(outFile));

    // User row assertions
    const users = mem.rows("user");
    expect(users).toHaveLength(1);
    const admin = users[0];
    expect(admin.role).toBe(Role.SUPER_ADMIN);
    expect(admin.email).toBe("owner@midyaf.sa");
    expect(admin.name).toBe("Live Event Owner");
    expect(admin.phone).toBe("+966501234567");
    expect(admin.onboardingPending).toBe(false);
    expect(String(admin.passwordHash)).toMatch(/^\$2[ab]\$12\$/);

    // Credentials file assertions
    expect(fs.existsSync(outFile)).toBe(true);
    const content = fs.readFileSync(outFile, "utf8");
    const emailMatch = content.match(/^email=(.+)$/m);
    const passMatch = content.match(/^password=(.+)$/m);
    expect(emailMatch?.[1]).toBe("owner@midyaf.sa");
    const writtenPassword = passMatch?.[1] ?? "";
    expect(writtenPassword.length).toBeGreaterThanOrEqual(MIN_PASSWORD_LENGTH);
    expect(await bcrypt.compare(writtenPassword, String(admin.passwordHash))).toBe(true);

    if (process.platform !== "win32") {
      expect(fs.statSync(outFile).mode & 0o777).toBe(0o600);
    }

    // AuditLog row assertions (no secrets!)
    const auditLogs = mem.rows("auditLog");
    expect(auditLogs).toHaveLength(1);
    const audit = auditLogs[0];
    expect(audit.action).toBe(FIRST_ADMIN_AUDIT_ACTION);
    expect(audit.entityType).toBe("USER");
    expect(audit.entityId).toBe(admin.id);
    expect(audit.actorUserId).toBe(admin.id);
    expect(audit.actorRole).toBe(Role.SUPER_ADMIN);
    const auditJson = JSON.stringify(audit);
    expect(auditJson).not.toContain(writtenPassword);
    expect(auditJson).not.toContain(String(admin.passwordHash));
    expect(auditJson).not.toContain("super-secret-db-pass");

    // Printed stdout contains NOTHING secret
    const output = logs.join("\n");
    expect(output).toContain("owner@midyaf.sa");
    expect(output).not.toContain(writtenPassword);
    expect(output).not.toContain(String(admin.passwordHash));
    expect(output).not.toContain("super-secret-db-pass");
    expect(output).not.toContain("ep-live.neon.tech");
  });

  it("refuses when a SUPER_ADMIN already exists and does not write the out file", async () => {
    const mem = createMemoryPrisma();
    mem.seed({
      user: [
        {
          id: "u_existing_admin",
          name: "Existing Admin",
          email: "existing@midyaf.sa",
          phone: "+966509999999",
          role: Role.SUPER_ADMIN,
          onboardingPending: false,
          passwordHash: "$2a$12$existinghash"
        }
      ]
    });

    const outFile = path.join(makeSafeTempDir(), "should-not-exist.creds");
    const logs: string[] = [];

    await expect(
      runCreateFirstAdmin(
        [
          "--email",
          "second@midyaf.sa",
          "--name",
          "Second Admin",
          "--phone",
          "+966501111111",
          "--out",
          outFile
        ],
        {
          env: { TARGET_DATABASE_URL: targetUrl },
          repoRoot: path.join(os.tmpdir(), "midyaf-other-repo"),
          createClient: () => mem.prisma,
          log: (line) => logs.push(line)
        }
      )
    ).rejects.toThrow(/SUPER_ADMIN account already exists/);

    expect(mem.rows("user")).toHaveLength(1);
    expect(mem.rows("auditLog")).toHaveLength(0);
    expect(fs.existsSync(outFile)).toBe(false);
    expect(logs).toHaveLength(0);
  });

  it("refuses a duplicate email or duplicate phone (even for non-admin users)", async () => {
    const mem = createMemoryPrisma();
    mem.seed({
      user: [
        {
          id: "u_coord",
          name: "Coordinator",
          email: "dup@midyaf.sa",
          phone: "+966502222222",
          role: Role.COORDINATOR,
          onboardingPending: false,
          passwordHash: "$2a$12$existinghash"
        }
      ]
    });

    const outDir = makeSafeTempDir();
    const outFile1 = path.join(outDir, "dup-email.creds");
    await expect(
      runCreateFirstAdmin(
        [
          "--email",
          "DUP@midyaf.sa",
          "--name",
          "Owner",
          "--phone",
          "+966503333333",
          "--out",
          outFile1
        ],
        {
          env: { TARGET_DATABASE_URL: targetUrl },
          repoRoot: path.join(os.tmpdir(), "midyaf-other-repo"),
          createClient: () => mem.prisma
        }
      )
    ).rejects.toThrow(/email already exists/i);
    expect(fs.existsSync(outFile1)).toBe(false);

    const outFile2 = path.join(outDir, "dup-phone.creds");
    await expect(
      runCreateFirstAdmin(
        [
          "--email",
          "fresh@midyaf.sa",
          "--name",
          "Owner",
          "--phone",
          "+966502222222",
          "--out",
          outFile2
        ],
        {
          env: { TARGET_DATABASE_URL: targetUrl },
          repoRoot: path.join(os.tmpdir(), "midyaf-other-repo"),
          createClient: () => mem.prisma
        }
      )
    ).rejects.toThrow(/phone already exists/i);
    expect(fs.existsSync(outFile2)).toBe(false);
    expect(mem.rows("user")).toHaveLength(1);
    expect(mem.rows("auditLog")).toHaveLength(0);
  });

  it("generates distinct >=20-char strong passwords with mixed character classes", () => {
    const p1 = generateStrongPassword();
    const p2 = generateStrongPassword();
    expect(p1.length).toBeGreaterThanOrEqual(MIN_PASSWORD_LENGTH);
    expect(p1).not.toBe(p2);
    expect(p1).toMatch(/[A-Z]/);
    expect(p1).toMatch(/[a-z]/);
    expect(p1).toMatch(/[0-9]/);
    expect(p1).toMatch(/[^A-Za-z0-9]/);
  });
});
