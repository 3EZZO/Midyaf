import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error ESM .mjs smoke helper imported directly for unit testing
import { READY_BANNER, buildSmokeEnv, formatStderrTail, runServerBootSmoke } from "../../../scripts/smoke-server-boot.mjs";

const tempDirs: string[] = [];

function makeTempEntry(filename: string, code: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "midyaf-smoke-test-"));
  tempDirs.push(dir);
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, code, "utf8");
  return filePath;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("smoke-server-boot", () => {
  it("builds a synthetic env and never inherits DATABASE_URL or secrets", () => {
    const env = buildSmokeEnv({
      PATH: "/usr/bin",
      SystemRoot: "C:\\Windows",
      DATABASE_URL: "postgresql://prod:supersecret@neon.example/midyaf",
      SENTRY_DSN: "https://key@sentry.example/1",
      BREVO_API_KEY: "xkeysib-secret",
      CLOUDINARY_URL: "cloudinary://k:s@cloud",
      VAPID_PRIVATE_KEY: "vapid-secret",
      JWT_ACCESS_SECRET: "prod-jwt-secret",
      OPENAI_API_KEY: "sk-prod",
      UNRELATED_SECRET: "must-not-leak"
    });

    expect(env.NODE_ENV).toBe("test");
    expect(env.PORT).toBe("0");
    expect(env.DATABASE_URL).toBe(
      "postgresql://smoke:smoke@127.0.0.1:1/smoke?schema=midyaf"
    );
    expect(env.DATABASE_URL).not.toContain("supersecret");
    expect(env.SENTRY_DSN).toBe("");
    expect(env.BREVO_API_KEY).toBe("");
    expect(env.CLOUDINARY_URL).toBe("");
    expect(env.VAPID_PRIVATE_KEY).toBe("");
    expect(env.OPENAI_API_KEY).toBe("");
    expect(env.JWT_ACCESS_SECRET).not.toBe("prod-jwt-secret");
    expect("UNRELATED_SECRET" in env).toBe(false);
    expect(env.PATH).toBe("/usr/bin");
    expect(env.SystemRoot).toBe("C:\\Windows");
  });

  it("bounds stderr output to the configured tail", () => {
    const lines = Array.from({ length: 40 }, (_, i) => `line-${i + 1}`).join("\n");
    const tail = formatStderrTail(lines, 5, 500);
    expect(tail.split("\n")).toEqual([
      "line-36",
      "line-37",
      "line-38",
      "line-39",
      "line-40"
    ]);

    const longLine = "x".repeat(500);
    expect(formatStderrTail(longLine, 5, 100)).toHaveLength(100);
  });

  it("passes when the child prints the listening banner and terminates the child", async () => {
    const entry = makeTempEntry(
      "ok-server.mjs",
      `console.log(${JSON.stringify(`${READY_BANNER} on http://localhost:0`)});\nsetInterval(() => {}, 10_000);\n`
    );

    const result = await runServerBootSmoke({ entry, timeoutMs: 5_000 });
    expect(result.ok).toBe(true);
    expect(result.stderrTail).toBe("");
  });

  it("fails with stderr tail when the child crashes on an ESM export error", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "midyaf-smoke-esm-"));
    tempDirs.push(dir);
    fs.writeFileSync(
      path.join(dir, "named-only.mjs"),
      "export const sendNotification = () => {};\n",
      "utf8"
    );
    const entry = path.join(dir, "bad-default.mjs");
    fs.writeFileSync(
      entry,
      'import broken from "./named-only.mjs";\nconsole.log(broken);\n',
      "utf8"
    );

    const result = await runServerBootSmoke({ entry, timeoutMs: 5_000 });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("exited_before_ready");
    expect(result.stderrTail).toMatch(/does not provide an export named 'default'/);
  });

  it("times out and kills a hanging child", async () => {
    const entry = makeTempEntry("hang.mjs", "setInterval(() => {}, 10_000);\n");

    const result = await runServerBootSmoke({ entry, timeoutMs: 300 });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("timeout");
  });

  it("is chained into package.json build:server", () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), "package.json"), "utf8")
    );
    expect(pkg.scripts["build:server"]).toBe(
      "tsc -p server/tsconfig.json && node scripts/smoke-server-boot.mjs"
    );
  });
});
