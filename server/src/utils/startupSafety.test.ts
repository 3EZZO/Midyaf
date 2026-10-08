import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  SEED_OPT_IN_FLAG,
  assertSeedAllowed,
  evaluateSeedPermission
} from "./seedSafety.js";

/**
 * T-01: startup must never create schemas, push the Prisma schema, seed or
 * rewrite data, and the destructive seed must refuse unless explicitly
 * allowed. These tests never start the application, run a shell database
 * command or connect to a database: the launcher gets a fake spawn and the
 * seed module gets a mocked Prisma client.
 */

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

// Mocked client for the seed-module tests: construction is recorded and every
// model call goes to an in-memory fake that records the call order.
const prismaFake = vi.hoisted(() => {
  const calls: string[] = [];
  let created = 0;
  let nextId = 0;
  let resolveDisconnected: () => void = () => undefined;
  let disconnected = new Promise<void>((resolve) => {
    resolveDisconnected = resolve;
  });

  const model = (name: string) =>
    new Proxy(
      {},
      {
        get: (_target, method: string) => async (args?: { data?: unknown }) => {
          calls.push(`${name}.${method}`);
          if (method === "createMany") return { count: 0 };
          const data = args?.data && !Array.isArray(args.data) ? args.data : {};
          return { id: `${name}_${++nextId}`, ...(data as object) };
        }
      }
    );

  class PrismaClient {
    constructor() {
      created += 1;
      const client: object = new Proxy(this, {
        get: (_target, key: string) => {
          if (key === "$connect") return async () => undefined;
          if (key === "$disconnect") {
            return async () => {
              calls.push("$disconnect");
              resolveDisconnected();
            };
          }
          if (key === "$transaction") {
            return async (work: unknown) =>
              Array.isArray(work)
                ? Promise.all(work)
                : (work as (tx: object) => Promise<unknown>)(client);
          }
          if (key === "then") return undefined;
          return model(key);
        }
      });
      return client;
    }
  }

  return {
    PrismaClient,
    calls,
    created: () => created,
    /** Resolves when the seed's finally block disconnects the client. */
    disconnected: () => disconnected,
    reset: () => {
      calls.length = 0;
      created = 0;
      nextId = 0;
      disconnected = new Promise<void>((resolve) => {
        resolveDisconnected = resolve;
      });
    }
  };
});

vi.mock("@prisma/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@prisma/client")>()),
  PrismaClient: prismaFake.PrismaClient
}));

describe("destructive seed policy", () => {
  const cases: Array<[string, Record<string, string | undefined>, boolean]> = [
    ["production without opt-in", { NODE_ENV: "production" }, false],
    ["production with opt-in", { NODE_ENV: "production", [SEED_OPT_IN_FLAG]: "true" }, false],
    ["development without opt-in", { NODE_ENV: "development" }, false],
    ["test without opt-in", { NODE_ENV: "test" }, false],
    ["development with opt-in", { NODE_ENV: "development", [SEED_OPT_IN_FLAG]: "true" }, true],
    ["test with opt-in", { NODE_ENV: "test", [SEED_OPT_IN_FLAG]: "true" }, true],
    ["unset NODE_ENV with opt-in", { [SEED_OPT_IN_FLAG]: "true" }, false],
    ["empty NODE_ENV with opt-in", { NODE_ENV: "", [SEED_OPT_IN_FLAG]: "true" }, false],
    ["unknown NODE_ENV with opt-in", { NODE_ENV: "staging", [SEED_OPT_IN_FLAG]: "true" }, false],
    ["differently cased NODE_ENV", { NODE_ENV: "Development", [SEED_OPT_IN_FLAG]: "true" }, false],
    ["flag TRUE", { NODE_ENV: "development", [SEED_OPT_IN_FLAG]: "TRUE" }, false],
    ["flag 1", { NODE_ENV: "development", [SEED_OPT_IN_FLAG]: "1" }, false],
    ["flag yes", { NODE_ENV: "development", [SEED_OPT_IN_FLAG]: "yes" }, false],
    ["flag with spaces", { NODE_ENV: "development", [SEED_OPT_IN_FLAG]: " true " }, false],
    ["flag empty", { NODE_ENV: "development", [SEED_OPT_IN_FLAG]: "" }, false]
  ];

  it.each(cases)("%s", (_name, env, allowed) => {
    expect(evaluateSeedPermission(env).allowed).toBe(allowed);
    if (allowed) {
      expect(() => assertSeedAllowed(env)).not.toThrow();
    } else {
      expect(() => assertSeedAllowed(env)).toThrow(/Refusing to run the destructive seed/);
    }
  });

  it("explains a production refusal even when the flag is set", () => {
    expect(
      evaluateSeedPermission({ NODE_ENV: "production", [SEED_OPT_IN_FLAG]: "true" })
    ).toEqual({
      allowed: false,
      reason: "destructive seeding is never allowed when NODE_ENV=production"
    });
  });
});

describe("prisma/seed.ts guard", () => {
  const seedUrl = pathToFileURL(path.join(root, "prisma/seed.ts")).href;

  beforeEach(() => {
    prismaFake.reset();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it.each([
    ["production with opt-in", "production", "true"],
    ["production without opt-in", "production", ""],
    ["development without opt-in", "development", ""],
    ["unknown environment", "staging", "true"]
  ])("refuses before constructing a client (%s)", async (_name, nodeEnv, flag) => {
    vi.stubEnv("NODE_ENV", nodeEnv);
    vi.stubEnv(SEED_OPT_IN_FLAG, flag);
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);

    await expect(import(/* @vite-ignore */ seedUrl)).rejects.toThrow(
      /Refusing to run the destructive seed/
    );
    expect(prismaFake.created()).toBe(0);
    expect(prismaFake.calls).toEqual([]);
    expect(exit).not.toHaveBeenCalled();
  });

  // Wipe order of prisma/seed.ts at baseline commit d7a9131 (before T-01).
  const BASELINE_WIPE_ORDER = [
    "captainFeedback", "auditLog", "fileAsset", "companyReport", "coordinatorRequest",
    "guestJourneyRecord", "vaultSession", "vendorContract", "vendorQuote", "aiLogisticsPlan",
    "activityIntake", "message", "notification", "booking", "service", "supplier", "task",
    "driver", "hospitalityRider", "guest", "event", "user", "commissionConfig", "cityConfig"
  ].map((model) => `${model}.deleteMany`);

  it("runs to completion only against the fake client when explicitly allowed, wiping in the baseline order", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv(SEED_OPT_IN_FLAG, "true");
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await import(/* @vite-ignore */ seedUrl);
    // main() resolved and its finally block disconnected the (fake) client.
    await prismaFake.disconnected();

    expect(prismaFake.created()).toBe(1);
    expect(prismaFake.calls.slice(0, BASELINE_WIPE_ORDER.length)).toEqual(BASELINE_WIPE_ORDER);
    expect(prismaFake.calls[BASELINE_WIPE_ORDER.length]).not.toMatch(/deleteMany/);
    expect(prismaFake.calls.at(-1)).toBe("$disconnect");
    expect(log).toHaveBeenCalledWith("Seed complete: Midyaf sovereign workspace data is ready.");
    expect(error).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
  }, 30_000);
});

describe("start.mjs launcher", () => {
  type SpawnCall = { command: string; args: string[]; options: { env: Record<string, string | undefined>; stdio: string } };

  async function loadLauncher() {
    return import(/* @vite-ignore */ pathToFileURL(path.join(root, "start.mjs")).href);
  }

  function fakeSpawn(result: { status?: number | null; error?: Error } = { status: 0 }) {
    const calls: SpawnCall[] = [];
    const spawn = (command: string, args: string[], options: SpawnCall["options"]) => {
      calls.push({ command, args, options });
      return { status: null, ...result };
    };
    return { calls, spawn };
  }

  const DATABASE_COMMANDS = /prisma|db push|db execute|accept-data-loss|seed|migrate|CREATE SCHEMA/i;

  it("launches only the built server, even when DATABASE_URL is present", async () => {
    const { launchServer, SERVER_ENTRY } = await loadLauncher();
    const { calls, spawn } = fakeSpawn({ status: 0 });
    const logs: string[] = [];

    const code = launchServer({
      env: { NODE_ENV: "production", DATABASE_URL: "postgresql://u:secret@db.example/midyaf" },
      spawn,
      log: (line: string) => logs.push(line)
    });

    expect(code).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0].command).toBe(process.execPath);
    expect(calls[0].args).toEqual([SERVER_ENTRY]);
    expect(SERVER_ENTRY).toBe("dist/server/src/index.js");
    expect(calls[0].options.stdio).toBe("inherit");
    expect(JSON.stringify(calls[0].args)).not.toMatch(DATABASE_COMMANDS);
    expect(logs.join("\n")).not.toMatch(/secret|postgresql:|db\.example/);
  });

  it.each([
    ["no query: legacy schema added", "postgresql://u:p@h:5432/midyaf", "postgresql://u:p@h:5432/midyaf?schema=midyaf"],
    ["existing parameters kept", "postgresql://u:p@h/midyaf?sslmode=require", "postgresql://u:p@h/midyaf?sslmode=require&schema=midyaf"],
    ["trailing question mark", "postgresql://u:p@h/midyaf?", "postgresql://u:p@h/midyaf?schema=midyaf"],
    ["explicit schema unchanged", "postgresql://u:p@h/midyaf?schema=public", "postgresql://u:p@h/midyaf?schema=public"],
    ["explicit schema among parameters unchanged", "postgresql://u:p@h/midyaf?sslmode=require&schema=tenant_a", "postgresql://u:p@h/midyaf?sslmode=require&schema=tenant_a"]
  ])("connection target: %s", async (_name, input, expected) => {
    const { launchServer } = await loadLauncher();
    const { calls, spawn } = fakeSpawn();

    launchServer({ env: { DATABASE_URL: input, OTHER: "kept" }, spawn, log: () => undefined });

    expect(calls[0].options.env.DATABASE_URL).toBe(expected);
    expect(calls[0].options.env.OTHER).toBe("kept");
  });

  it("leaves a missing DATABASE_URL missing instead of inventing one", async () => {
    const { launchServer } = await loadLauncher();
    const { calls, spawn } = fakeSpawn();

    launchServer({ env: { NODE_ENV: "production" }, spawn, log: () => undefined });

    expect(calls[0].options.env.DATABASE_URL).toBeUndefined();
  });

  it("propagates a launch failure without any fallback step", async () => {
    const { launchServer } = await loadLauncher();
    const { calls, spawn } = fakeSpawn({ error: new Error("spawn failed") });

    expect(() =>
      launchServer({ env: { DATABASE_URL: "postgresql://u:p@h/db" }, spawn, log: () => undefined })
    ).toThrow("spawn failed");
    expect(calls).toHaveLength(1);
  });

  it("returns the server's exit code, and 1 when it was killed by a signal", async () => {
    const { launchServer } = await loadLauncher();

    expect(launchServer({ env: {}, spawn: fakeSpawn({ status: 3 }).spawn, log: () => undefined })).toBe(3);
    expect(launchServer({ env: {}, spawn: fakeSpawn({ status: null }).spawn, log: () => undefined })).toBe(1);
  });

  it("does not launch anything when imported (only when run as the entry point)", async () => {
    vi.resetModules();
    const spawnSync = vi.fn();
    vi.doMock("node:child_process", () => ({ spawnSync }));

    await loadLauncher();

    expect(spawnSync).not.toHaveBeenCalled();
    vi.doUnmock("node:child_process");
  });
});

describe("startup configuration (source checks)", () => {
  it("start.mjs contains no schema, push, migrate or seed command", () => {
    const source = read("start.mjs").replace(/^\s*(\/\/|\*|\/\*\*).*$/gm, "");
    expect(source).not.toMatch(/execSync|db push|db execute|accept-data-loss|db seed|migrate|CREATE SCHEMA|npx prisma/);
  });

  it("Docker starts the built server only and keeps its DATABASE_URL", () => {
    const dockerfile = read("Dockerfile");
    const cmd = dockerfile.split(/\r?\n/).filter((line) => line.startsWith("CMD"));
    expect(cmd).toEqual(['CMD ["node", "dist/server/src/index.js"]']);
    expect(dockerfile).not.toMatch(/db push|db:seed|db seed|start\.mjs|schema=/);
    expect(dockerfile).toMatch(/RUN npm run db:generate && npm run build:server && npm run build:client/);
  });

  it("Render still starts through start.mjs (render.yaml unchanged)", () => {
    expect(read("render.yaml")).toMatch(/startCommand: node start\.mjs/);
  });

  it("the server no longer rewrites data at boot but keeps realtime and lifecycle", () => {
    const index = read("server/src/index.ts");
    expect(index).not.toMatch(/activityIntake\.updateMany|Fixed corrupted Arabic records|Failed to fix records/);
    expect(index).not.toMatch(/\bprisma\.\w+\.(updateMany|deleteMany|create|update|upsert)\(/);
    expect(index).toMatch(/configureRealtime\(io\);/);
    expect(index).toMatch(/server\.listen\(env\.PORT/);
    expect(index).toMatch(/process\.on\("SIGTERM", shutdown\)/);
    expect(index).toMatch(/await prisma\.\$disconnect\(\);/);
  });

  it("the seed calls the guard before constructing its client", () => {
    const seed = read("prisma/seed.ts");
    const guard = seed.indexOf("assertSeedAllowed(process.env);");
    const client = seed.indexOf("new PrismaClient()");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(client);
  });
});
