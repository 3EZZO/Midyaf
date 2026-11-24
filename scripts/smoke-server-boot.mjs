import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

/**
 * Post-build native Node ESM boot smoke check.
 *
 * Catches production-only startup crashes that TypeScript (`esModuleInterop`)
 * and Vitest (Vite ESM/CJS interop) can hide — such as default-importing an
 * ESM-only dependency that only provides named exports.
 *
 * Runs with a strictly synthetic environment in an empty temporary working
 * directory so it never inherits secrets, reads a local `.env`, or connects
 * to a real database.
 */

export const DEFAULT_ENTRY = "dist/server/src/index.js";
export const READY_BANNER = "Midyaf API listening";
// A healthy cold boot measured 6-14 s on a loaded Windows dev box; the check returns
// as soon as the server listens, so a generous ceiling costs nothing when healthy.
export const DEFAULT_TIMEOUT_MS = 60_000;
export const MAX_STDERR_LINES = 25;
export const MAX_STDERR_CHARS = 2000;

const MAX_STDERR_BUFFER_BYTES = 32 * 1024;
const FORCE_KILL_AFTER_MS = 1500;

/**
 * Builds an explicit, synthetic environment for the smoke child process.
 * Never spreads `hostEnv`, so DATABASE_URL and third-party secrets cannot leak.
 */
export function buildSmokeEnv(hostEnv = process.env) {
  const env = {
    NODE_ENV: "test",
    PORT: "0",
    CLIENT_ORIGIN: "http://127.0.0.1:5173",
    JWT_ACCESS_SECRET: "smoke-boot-access-secret",
    JWT_REFRESH_SECRET: "smoke-boot-refresh-secret",
    DATABASE_URL: "postgresql://smoke:smoke@127.0.0.1:1/smoke?schema=midyaf",
    // Keep every optional integration explicitly inert.
    SENTRY_DSN: "",
    BREVO_API_KEY: "",
    MAIL_FROM_EMAIL: "",
    PUBLIC_APP_URL: "",
    CLOUDINARY_URL: "",
    CLOUDINARY_CLOUD_NAME: "",
    CLOUDINARY_API_KEY: "",
    CLOUDINARY_API_SECRET: "",
    VAPID_PUBLIC_KEY: "",
    VAPID_PRIVATE_KEY: "",
    OPENAI_API_KEY: "",
    HYPERPAY_ENTITY_ID: "",
    HYPERPAY_ACCESS_TOKEN: ""
  };

  // Preserve only minimal OS runtime variables needed by Node sockets on Windows/POSIX.
  const hostPath = hostEnv.PATH ?? hostEnv.Path;
  if (typeof hostPath === "string" && hostPath.length > 0) {
    env.PATH = hostPath;
  }
  const systemRoot = hostEnv.SystemRoot ?? hostEnv.SYSTEMROOT;
  if (typeof systemRoot === "string" && systemRoot.length > 0) {
    env.SystemRoot = systemRoot;
  }

  return env;
}

/**
 * Returns only the bounded tail of child stderr so failures stay concise.
 */
export function formatStderrTail(
  raw,
  maxLines = MAX_STDERR_LINES,
  maxChars = MAX_STDERR_CHARS
) {
  if (!raw || typeof raw !== "string") return "";
  const normalized = raw.replace(/\r\n/g, "\n").trim();
  if (!normalized) return "";
  const lines = normalized.split("\n").slice(-maxLines).join("\n");
  if (lines.length <= maxChars) return lines;
  return lines.slice(-maxChars);
}

function terminateChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(forceTimer);
      resolve();
    };

    child.once("exit", finish);
    child.once("close", finish);

    try {
      // On Windows Node maps kill() to TerminateProcess; on POSIX SIGTERM runs graceful shutdown.
      child.kill(process.platform === "win32" ? undefined : "SIGTERM");
    } catch {
      finish();
      return;
    }

    const forceTimer = setTimeout(() => {
      try {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill("SIGKILL");
        }
      } catch {
        // Already gone.
      }
      finish();
    }, FORCE_KILL_AFTER_MS);
    forceTimer.unref();
  });
}

/**
 * Spawns the built server entrypoint under native Node ESM and waits for the
 * listening banner, terminating the child on both pass and fail.
 */
export async function runServerBootSmoke({
  entry = DEFAULT_ENTRY,
  rootDir = process.cwd(),
  timeoutMs = DEFAULT_TIMEOUT_MS,
  readyBanner = READY_BANNER,
  nodeExecPath = process.execPath,
  hostEnv = process.env
} = {}) {
  const resolvedEntry = path.resolve(rootDir, entry);
  if (!fs.existsSync(resolvedEntry)) {
    return {
      ok: false,
      reason: "missing_entry",
      stderrTail: `Built server entry not found: ${entry}`
    };
  }

  // Run in an isolated empty temp directory so dotenv.config() cannot pick up a local `.env`.
  const tempCwd = fs.mkdtempSync(path.join(os.tmpdir(), "midyaf-boot-smoke-"));
  const startedAt = Date.now();

  try {
    return await new Promise((resolve) => {
      let stdoutBuf = "";
      let stderrBuf = "";
      let settled = false;

      const child = spawn(nodeExecPath, [resolvedEntry], {
        cwd: tempCwd,
        env: buildSmokeEnv(hostEnv),
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true
      });

      const settle = async (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        await terminateChild(child);
        resolve(result);
      };

      const timer = setTimeout(() => {
        void settle({
          ok: false,
          reason: "timeout",
          durationMs: Date.now() - startedAt,
          stderrTail: formatStderrTail(stderrBuf)
        });
      }, timeoutMs);
      timer.unref();

      child.stdout?.on("data", (chunk) => {
        if (settled) return;
        stdoutBuf += chunk.toString("utf8");
        if (stdoutBuf.includes(readyBanner)) {
          void settle({
            ok: true,
            durationMs: Date.now() - startedAt,
            stderrTail: ""
          });
        } else if (stdoutBuf.length > MAX_STDERR_BUFFER_BYTES) {
          stdoutBuf = stdoutBuf.slice(-4096);
        }
      });

      child.stderr?.on("data", (chunk) => {
        stderrBuf += chunk.toString("utf8");
        if (stderrBuf.length > MAX_STDERR_BUFFER_BYTES) {
          stderrBuf = stderrBuf.slice(-MAX_STDERR_BUFFER_BYTES);
        }
      });

      child.once("error", (err) => {
        void settle({
          ok: false,
          reason: "spawn_error",
          durationMs: Date.now() - startedAt,
          stderrTail: formatStderrTail(err.message)
        });
      });

      // Listen on "close" (not "exit") so all buffered stderr chunks flush before reporting.
      child.once("close", (code, signal) => {
        if (settled) return;
        void settle({
          ok: false,
          reason: "exited_before_ready",
          exitCode: code,
          signal,
          durationMs: Date.now() - startedAt,
          stderrTail: formatStderrTail(stderrBuf)
        });
      });
    });
  } finally {
    try {
      fs.rmSync(tempCwd, { recursive: true, force: true });
    } catch {
      // Best-effort temp cleanup.
    }
  }
}

async function main() {
  const override = Number(process.env.SMOKE_BOOT_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(override) && override >= 1000 ? override : DEFAULT_TIMEOUT_MS;
  const result = await runServerBootSmoke({ timeoutMs });
  if (result.ok) {
    console.log(`server-boot-smoke: ok (${result.durationMs}ms)`);
    return;
  }

  console.error(`server-boot-smoke: FAILED (${result.reason})`);
  if (result.stderrTail) {
    console.error(result.stderrTail);
  }
  process.exitCode = 1;
}

const isEntrypoint =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isEntrypoint) {
  await main();
}
