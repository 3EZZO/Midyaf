import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import {
  APPLICATION_MODELS,
  BOOTSTRAP_EXPECTATIONS,
  CREDENTIALS_FORMAT,
  DEMO_ACCOUNTS,
  DEMO_SCHEMA,
  DemoProvisioningError,
  FORBIDDEN_PRISMA_ARGS,
  TARGET_FILE_NAME,
  TARGET_URL_KEY,
  buildSchemaPushCommand,
  delegateName,
  describeFailure,
  fileCredentialStore,
  generateAccountPasswords,
  hashDemoPassword,
  loadTargetUrl,
  parseCredentialBundle,
  parseProvisionArgs,
  plannedCounts,
  runHttpSmoke,
  runProvision,
  runSchemaPush,
  runVerify,
  validateTargetUrl,
  type CredentialBundle,
  type CredentialStore,
  type DemoClient,
  type FetchLike,
  type ProvisionDeps,
  type ShapeContext,
  type SpawnRunner
} from "./demoProvisioning.js";

/**
 * DEMO-DB-001: the demo provisioning CLI must only ever touch an explicitly
 * pinned, fresh Neon target, never print secrets and never run anything
 * destructive. Persistence, the Prisma CLI subprocess and HTTP are faked; no
 * database, network or provider is contacted. One test uses a temporary
 * directory to prove the credential file is created exclusively.
 */

const ROOT = path.resolve("/midyaf-demo-test-root");
const HOST = "ep-quiet-demo-123456.eu-central-1.aws.neon.tech";
const SECRET = "Sup3r-Secret-Target-Pass";
const DIRECT_URL = `postgresql://demo_owner:${SECRET}@${HOST}/neondb?sslmode=require`;
const AMBIENT_URL = "postgresql://ambient_owner:ambient-pass@ep-ambient-999999.eu-central-1.aws.neon.tech/neondb?sslmode=require";

function expectReason(work: () => unknown, reason: string) {
  try {
    work();
  } catch (error) {
    expect(error).toBeInstanceOf(DemoProvisioningError);
    expect((error as DemoProvisioningError).reason).toBe(reason);
    return error as DemoProvisioningError;
  }
  throw new Error(`expected ${reason}`);
}

async function expectAsyncReason(work: Promise<unknown>, reason: string) {
  const error = await work.then(
    () => undefined,
    (caught: unknown) => caught
  );
  expect(error).toBeInstanceOf(DemoProvisioningError);
  expect((error as DemoProvisioningError).reason).toBe(reason);
  return error as DemoProvisioningError;
}

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

type Row = Record<string, unknown> & { id: string };

function fakeDb(
  order: string[],
  options: {
    tables?: readonly string[];
    objects?: { relations: number; enums: number };
    counts?: (model: string, inside: boolean) => number;
    failTransaction?: Error;
  } = {}
) {
  const created: Record<string, Row[]> = {};
  let inside = false;
  let nextId = 0;
  const record = (model: string, data: Record<string, unknown>) => {
    const row = { id: `${model}_${++nextId}`, ...data };
    (created[model] ??= []).push(row);
    order.push(`create:${model}`);
    return row;
  };

  const client: Record<string, unknown> = {
    $queryRaw: vi.fn(async (strings: TemplateStringsArray) => {
      const sql = strings.join("?");
      if (sql.includes("information_schema.tables")) {
        return (options.tables ?? APPLICATION_MODELS).map((name) => ({ name }));
      }
      if (sql.includes("pg_catalog.pg_class")) {
        return [options.objects ?? { relations: 0, enums: 0 }];
      }
      throw new Error("unexpected query");
    }),
    $transaction: vi.fn(async (work: (tx: unknown) => Promise<unknown>) => {
      order.push("transaction");
      inside = true;
      try {
        if (options.failTransaction) throw options.failTransaction;
        return await work(client);
      } finally {
        inside = false;
      }
    }),
    $disconnect: vi.fn(async () => {
      order.push("disconnect");
    })
  };

  for (const model of APPLICATION_MODELS) {
    client[delegateName(model)] = {
      count: vi.fn(async () => options.counts?.(model, inside) ?? 0),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => record(model, data)),
      createMany: vi.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => {
        data.forEach((item) => record(model, item));
        return { count: data.length };
      })
    };
  }

  return { client: client as unknown as DemoClient, created };
}

function memoryStore(order: string[], existing = false) {
  const writes: CredentialBundle[] = [];
  const store: CredentialStore = {
    displayPath: "scratch/neon-demo/accounts.json",
    exists: () => existing,
    reserve: vi.fn((bundle: CredentialBundle) => {
      order.push("reserve");
      writes.push(structuredClone(bundle));
      return {
        update: (next: CredentialBundle) => {
          order.push(`status:${next.status}`);
          writes.push(structuredClone(next));
        }
      };
    }),
    read: () => {
      throw new Error("not used");
    }
  };
  return { store, writes };
}

/**
 * Real node:fs with injected faults: "write-temp" fails writes to status
 * update temp files, "write-any" fails every write, "rename" fails the
 * atomic replace.
 */
function faultyFs(fail: "write-temp" | "write-any" | "rename"): typeof fs {
  const tempFds = new Set<number>();
  const fault = (code: string) => Object.assign(new Error(`injected ${code}`), { code });
  return {
    ...fs,
    openSync: ((file: fs.PathLike, flags: fs.OpenMode, mode?: fs.Mode | null) => {
      const fd = fs.openSync(file, flags, mode);
      if (String(file).endsWith(".tmp")) tempFds.add(fd);
      return fd;
    }) as typeof fs.openSync,
    writeSync: ((fd: number, ...rest: unknown[]) => {
      if (fail === "write-any" || (fail === "write-temp" && tempFds.has(fd))) throw fault("EIO");
      return Reflect.apply(fs.writeSync, fs, [fd, ...rest]) as number;
    }) as typeof fs.writeSync,
    renameSync: ((from: fs.PathLike, to: fs.PathLike) => {
      if (fail === "rename") throw fault("EPERM");
      fs.renameSync(from, to);
    }) as typeof fs.renameSync
  };
}

function setup(
  options: {
    file?: string;
    existing?: boolean;
    db?: Parameters<typeof fakeDb>[1];
    schemaPush?: ProvisionDeps["schemaPush"];
    store?: CredentialStore;
  } = {}
) {
  const order: string[] = [];
  const logs: string[] = [];
  const db = fakeDb(order, options.db);
  const credentials = memoryStore(order, options.existing);
  const deps = {
    root: ROOT,
    rootExists: () => true,
    readFile: vi.fn((file: string) => {
      if (file === path.join(ROOT, TARGET_FILE_NAME)) return options.file ?? `${TARGET_URL_KEY}=${DIRECT_URL}\n`;
      throw new Error("ENOENT");
    }),
    createClient: vi.fn(async () => db.client),
    credentialStore: options.store ?? credentials.store,
    schemaPush: vi.fn(options.schemaPush ?? (() => undefined)),
    hashPassword: vi.fn(async (password: string) => {
      order.push("hash");
      return bcrypt.hash(password, 4);
    }),
    random: vi.fn((size: number) => randomBytes(size)),
    now: () => new Date("2026-10-08T09:00:00Z"),
    log: (line: string) => logs.push(line)
  } satisfies ProvisionDeps;
  return { order, logs, db, credentials, deps };
}

const APPLY = ["--apply", "--expected-host", HOST];

function expectNoSecrets(text: string, passwords: string[] = []) {
  expect(text).not.toContain(SECRET);
  expect(text).not.toContain("demo_owner");
  expect(text).not.toMatch(/postgres(ql)?:\/\//);
  expect(text).not.toMatch(/\$2[aby]\$/);
  for (const password of passwords) expect(text).not.toContain(password);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// Target guards
// ---------------------------------------------------------------------------

describe("target URL validation", () => {
  it("accepts a direct Neon URL and pins schema=midyaf", () => {
    const target = validateTargetUrl(DIRECT_URL);
    expect(target).toMatchObject({ host: HOST, database: "neondb", schema: DEMO_SCHEMA });
    expect(new URL(target.url).searchParams.get("schema")).toBe("midyaf");
    expect(new URL(target.url).searchParams.get("sslmode")).toBe("require");
    expect(validateTargetUrl(`${DIRECT_URL}&schema=midyaf&channel_binding=require`).host).toBe(HOST);
  });

  it.each([
    ["not a URL", "not a url", "target-url-invalid"],
    ["mysql scheme", DIRECT_URL.replace("postgresql:", "mysql:"), "target-url-invalid"],
    ["non-default port", DIRECT_URL.replace(HOST, `${HOST}:6543`), "target-url-invalid"],
    ["lookalike suffix host", DIRECT_URL.replace(HOST, "ep-x.neon.tech.evil.example"), "target-host-not-neon"],
    ["lookalike label host", DIRECT_URL.replace(HOST, "ep-x.evilneon.tech"), "target-host-not-neon"],
    ["hyphenated lookalike", DIRECT_URL.replace(HOST, "ep-x-neon.tech"), "target-host-not-neon"],
    ["bare neon.tech", DIRECT_URL.replace(HOST, "neon.tech"), "target-host-not-neon"],
    ["render host", DIRECT_URL.replace(HOST, "dpg-old.oregon-postgres.render.com"), "target-host-not-neon"],
    ["pooled endpoint", DIRECT_URL.replace("ep-quiet-demo-123456", "ep-quiet-demo-123456-pooler"), "target-pooled-endpoint"],
    ["pgbouncer flag", `${DIRECT_URL}&pgbouncer=true`, "target-pooled-endpoint"],
    ["no password", DIRECT_URL.replace(`:${SECRET}`, ""), "target-credentials-incomplete"],
    ["no user", DIRECT_URL.replace(`demo_owner:${SECRET}@`, ""), "target-credentials-incomplete"],
    ["no database", DIRECT_URL.replace("/neondb", "/"), "target-database-missing"],
    ["no sslmode", DIRECT_URL.replace("?sslmode=require", ""), "target-sslmode"],
    ["weaker sslmode", DIRECT_URL.replace("sslmode=require", "sslmode=prefer"), "target-sslmode"],
    ["two sslmodes", `${DIRECT_URL}&sslmode=disable`, "target-sslmode"],
    ["public schema", `${DIRECT_URL}&schema=public`, "target-schema-not-midyaf"],
    ["two schemas", `${DIRECT_URL}&schema=midyaf&schema=other`, "target-schema-not-midyaf"]
  ])("rejects %s without echoing the URL", (_name, url, reason) => {
    const error = expectReason(() => validateTargetUrl(url), reason);
    expectNoSecrets(`${error.message} ${String(error.stack)} ${JSON.stringify(describeFailure(error))}`);
  });
});

describe("target file loading", () => {
  it("reads only .env.neon.local and never falls back to the environment", () => {
    vi.stubEnv("DATABASE_URL", AMBIENT_URL);
    const readFile = vi.fn(() => {
      throw new Error("ENOENT");
    });

    expectReason(() => loadTargetUrl(ROOT, readFile), "target-file-missing");
    expect(readFile).toHaveBeenCalledTimes(1);
    expect(readFile).toHaveBeenCalledWith(path.join(ROOT, ".env.neon.local"));
  });

  it("uses the file's DATABASE_URL and leaves process.env untouched", () => {
    expect(TARGET_URL_KEY).toBe("DATABASE_URL");
    vi.stubEnv("DATABASE_URL", AMBIENT_URL);

    expect(loadTargetUrl(ROOT, () => `DATABASE_URL=${DIRECT_URL}\nDEMO_ONLY_MARKER=1\n`)).toBe(DIRECT_URL);
    expect(process.env.DATABASE_URL).toBe(AMBIENT_URL);
    expect(process.env.DEMO_ONLY_MARKER).toBeUndefined();
  });

  it.each([
    ["an empty file", ""],
    ["an empty key", "DATABASE_URL=\n"],
    ["a blank key", "DATABASE_URL=   \n"],
    ["only another key", `NEON_DEMO_DIRECT_URL=${DIRECT_URL}\n`]
  ])("rejects %s even when an ambient DATABASE_URL is set", (_name, content) => {
    vi.stubEnv("DATABASE_URL", AMBIENT_URL);
    const error = expectReason(() => loadTargetUrl(ROOT, () => content), "target-url-missing");
    expect(error.message).not.toContain("ambient");
  });

  it("plan mode with an empty target file fails without using the ambient DATABASE_URL", async () => {
    vi.stubEnv("DATABASE_URL", AMBIENT_URL);
    const { deps, logs } = setup({ file: "DATABASE_URL=\n" });
    await expectAsyncReason(runProvision([], deps), "target-url-missing");
    expect(deps.createClient).not.toHaveBeenCalled();
    expect(logs).toEqual([]);
  });
});

describe("command-line options", () => {
  it("defaults to plan mode", () => {
    expect(parseProvisionArgs([])).toEqual({ apply: false, createSchema: false, expectedHost: undefined });
  });

  it("requires an explicit host pin for apply and apply for --create-schema", () => {
    expectReason(() => parseProvisionArgs(["--apply"]), "expected-host-required");
    expectReason(() => parseProvisionArgs(["--create-schema", "--expected-host", HOST]), "args-invalid");
    expect(parseProvisionArgs([...APPLY, "--create-schema"])).toEqual({ apply: true, createSchema: true, expectedHost: HOST });
    expect(parseProvisionArgs(["--apply", `--expected-host=${HOST}`]).expectedHost).toBe(HOST);
  });

  it.each([
    [["--force"]],
    [["--accept-data-loss"]],
    [["--apply", "--apply", "--expected-host", HOST]],
    [["--apply", "--expected-host"]],
    [["--apply", "--expected-host", "postgresql://u:p@h/db"]],
    [["--apply", "--expected-host", HOST, "--expected-host", HOST]]
  ])("rejects unknown, repeated or malformed options %j", (argv) => {
    expect(() => parseProvisionArgs(argv)).toThrow(DemoProvisioningError);
  });
});

// ---------------------------------------------------------------------------
// Plan mode
// ---------------------------------------------------------------------------

describe("plan mode", () => {
  it("connects nowhere, generates no secrets and writes nothing", async () => {
    const { deps, logs, credentials, order } = setup();

    const outcome = await runProvision([], deps);

    expect(outcome.mode).toBe("plan");
    expect(deps.createClient).not.toHaveBeenCalled();
    expect(deps.random).not.toHaveBeenCalled();
    expect(deps.hashPassword).not.toHaveBeenCalled();
    expect(deps.schemaPush).not.toHaveBeenCalled();
    expect(credentials.store.reserve).not.toHaveBeenCalled();
    expect(order).toEqual([]);

    const output = logs.join("\n");
    expect(output).toContain(`Target host: ${HOST}`);
    expect(output).toContain("Target database: neondb");
    expect(output).toContain("Target schema: midyaf");
    expect(output).toContain(`User=${DEMO_ACCOUNTS.length}`);
    expectNoSecrets(output);
  });

  it("still validates the target before printing anything", async () => {
    const { deps, logs } = setup({ file: `${TARGET_URL_KEY}=${DIRECT_URL.replace(HOST, "ep-x-pooler.neon.tech")}` });
    await expectAsyncReason(runProvision([], deps), "target-pooled-endpoint");
    expect(logs).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Apply refusals
// ---------------------------------------------------------------------------

describe("apply refusals", () => {
  it("refuses a host that differs from the pin before connecting", async () => {
    const { deps } = setup();
    await expectAsyncReason(
      runProvision(["--apply", "--expected-host", "ep-other-000000.eu-central-1.aws.neon.tech"], deps),
      "expected-host-mismatch"
    );
    expect(deps.createClient).not.toHaveBeenCalled();
  });

  it("refuses when a credential bundle already exists, before connecting", async () => {
    const { deps, credentials } = setup({ existing: true });
    await expectAsyncReason(runProvision(APPLY, deps), "credentials-file-exists");
    expect(deps.createClient).not.toHaveBeenCalled();
    expect(credentials.store.reserve).not.toHaveBeenCalled();
  });

  it("refuses an incomplete schema without --create-schema", async () => {
    const { deps, credentials, order } = setup({ db: { tables: APPLICATION_MODELS.filter((model) => model !== "Task") } });
    await expectAsyncReason(runProvision(APPLY, deps), "schema-incomplete");
    expect(credentials.store.reserve).not.toHaveBeenCalled();
    expect(order).toEqual(["disconnect"]);
  });

  it("refuses any existing application rows without generating secrets or writing", async () => {
    const { deps, credentials, order } = setup({ db: { counts: (model) => (model === "Event" ? 1 : 0) } });
    await expectAsyncReason(runProvision(APPLY, deps), "data-not-empty");
    expect(deps.random).not.toHaveBeenCalled();
    expect(deps.hashPassword).not.toHaveBeenCalled();
    expect(credentials.store.reserve).not.toHaveBeenCalled();
    expect(order).toEqual(["disconnect"]);
  });

  it("--create-schema refuses a target that already has tables, views or enums", async () => {
    for (const objects of [{ relations: 2, enums: 0 }, { relations: 0, enums: 1 }]) {
      const { deps, credentials } = setup({ db: { objects } });
      await expectAsyncReason(runProvision([...APPLY, "--create-schema"], deps), "target-not-empty");
      expect(deps.schemaPush).not.toHaveBeenCalled();
      expect(credentials.store.reserve).not.toHaveBeenCalled();
    }
  });

  it("a rival writer seen inside the serializable transaction fails it closed", async () => {
    const { deps, credentials, db } = setup({ db: { counts: (model, inside) => (inside && model === "User" ? 1 : 0) } });
    await expectAsyncReason(runProvision(APPLY, deps), "data-not-empty");
    expect(db.created).toEqual({});
    expect(credentials.writes.at(-1)?.status).toBe("failed");
  });

  it("a failed transaction is reported by category only and marks the bundle failed", async () => {
    const { deps, credentials, logs, order } = setup({
      db: { failTransaction: new Error(`terminating connection to ${DIRECT_URL}`) }
    });

    const error = await expectAsyncReason(runProvision(APPLY, deps), "transaction-failed");

    expectNoSecrets(`${error.message} ${JSON.stringify(describeFailure(error))} ${logs.join("\n")}`);
    expect(credentials.writes.map((bundle) => bundle.status)).toEqual(["pending", "failed"]);
    expect(order.at(-1)).toBe("disconnect");
  });
});

// ---------------------------------------------------------------------------
// Successful apply
// ---------------------------------------------------------------------------

describe("apply on an empty target", () => {
  it("hashes first, saves credentials before the transaction and creates linked synthetic fixtures", async () => {
    const { deps, credentials, db, order, logs } = setup();

    const outcome = await runProvision(APPLY, deps);
    expect(outcome).toMatchObject({ mode: "apply", status: "complete" });

    // Order: every hash, then the credential reservation, then the transaction.
    const firstReserve = order.indexOf("reserve");
    expect(order.lastIndexOf("hash")).toBeLessThan(firstReserve);
    expect(firstReserve).toBeLessThan(order.indexOf("transaction"));
    expect(order.indexOf("transaction")).toBeLessThan(order.indexOf("create:User"));
    expect(order.slice(-2)).toEqual(["status:complete", "disconnect"]);
    expect((db.client.$transaction as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1]).toMatchObject({
      isolationLevel: "Serializable"
    });

    // Credentials: one bundle, unique strong passwords matching stored hashes.
    expect(credentials.writes.map((bundle) => bundle.status)).toEqual(["pending", "complete"]);
    const bundle = credentials.writes[1];
    expect(bundle).toMatchObject({ format: CREDENTIALS_FORMAT, target: { host: HOST, database: "neondb", schema: "midyaf" } });
    const passwords = bundle.accounts.map((account) => account.password);
    expect(new Set(passwords).size).toBe(DEMO_ACCOUNTS.length);
    expect(passwords.every((password) => password.length >= 20)).toBe(true);

    const users = db.created.User;
    expect(users.map((user) => user.email)).toEqual(DEMO_ACCOUNTS.map((account) => account.email));
    for (const account of bundle.accounts) {
      const user = users.find((row) => row.email === account.email)!;
      expect(user.role).toBe(account.role);
      expect(await bcrypt.compare(account.password, user.passwordHash as string)).toBe(true);
      expect(user).not.toHaveProperty("password");
    }
    expect(new Set(users.map((user) => user.passwordHash)).size).toBe(users.length);
    expect(users.every((user) => /Synthetic/.test(user.name as string))).toBe(true);

    // Links between the synthetic records.
    const idOf = (email: string) => users.find((user) => user.email === email)!.id;
    const [event] = db.created.Event;
    expect(event).toMatchObject({ status: "LIVE", organizerId: idOf("event.lead@sila.com"), cityId: db.created.CityConfig[0].id });
    expect((event.date as Date).getTime()).toBeGreaterThan(deps.now().getTime());

    const guestIds = db.created.Guest.map((guest) => guest.id);
    const driverIds = db.created.Driver.map((driver) => driver.id);
    expect(db.created.Guest.map((guest) => guest.userId)).toEqual([idOf("guest.vip@midyaf.local"), idOf("guest@midyaf.local")]);
    expect(db.created.Driver.map((driver) => driver.userId)).toEqual([idOf("driver@midyaf.local"), idOf("driver.two@midyaf.local")]);
    expect(db.created.Driver.every((driver) => String(driver.nationalIdIqama).startsWith("DEMO-") && String(driver.licenseNo).startsWith("DEMO-"))).toBe(true);
    const linkedTasks = db.created.Task.filter((task) => task.driverId && task.guestId);
    expect(linkedTasks.length).toBeGreaterThanOrEqual(2);
    expect(linkedTasks.every((task) => driverIds.includes(task.driverId as string) && guestIds.includes(task.guestId as string))).toBe(true);
    expect(db.created.Task.every((task) => task.eventId === event.id && (task.scheduledAt as Date) > deps.now())).toBe(true);
    expect(db.created.HospitalityRider[0].guestId).toBe(guestIds[0]);

    const supplier = db.created.Supplier.find((row) => row.userId === idOf("supplier@midyaf.local"))!;
    expect(db.created.Service.some((service) => service.supplierId === supplier.id)).toBe(true);
    expect(db.created.Booking.some((booking) => booking.supplierId === supplier.id && booking.eventId === event.id)).toBe(true);

    const [intake] = db.created.ActivityIntake;
    expect(intake).toMatchObject({ submittedBy: "company@midyaf.local", eventId: event.id });
    expect(db.created.AiLogisticsPlan).toEqual([expect.objectContaining({ intakeId: intake.id, confirmed: false })]);
    expect(db.created.VendorQuote.every((quote) => quote.intakeId === intake.id && quote.status !== "APPROVED")).toBe(true);
    expect(db.created.VaultSession).toEqual([expect.objectContaining({ intakeId: intake.id, status: "LOCKED" })]);
    expect(db.created.VendorContract).toBeUndefined();
    expect(db.created.Notification.every((row) => row.channel === "IN_APP" && !row.provider && !row.recipientPhone)).toBe(true);
    expect(db.created.GuestJourneyRecord.every((row) => guestIds.includes(row.guestId as string))).toBe(true);
    expect(db.created.CompanyReport).toEqual([expect.objectContaining({ status: "DRAFT" })]);
    expect(db.created.FileAsset).toBeUndefined();

    // Counts match the plan; output holds only safe facts.
    const actual = Object.fromEntries(APPLICATION_MODELS.map((model) => [model, db.created[model]?.length ?? 0]));
    expect(actual).toEqual(plannedCounts());
    expect(outcome.mode === "apply" && outcome.counts).toEqual(plannedCounts());
    const output = logs.join("\n");
    expect(output).toContain("Status: complete");
    expect(output).toContain("Credentials file: scratch/neon-demo/accounts.json");
    expectNoSecrets(output, passwords);
  });

  it("--create-schema checks emptiness, pushes once, then requires the complete schema", async () => {
    const { deps, order } = setup({ schemaPush: () => void order.push("push") });
    const outcome = await runProvision([...APPLY, "--create-schema"], deps);
    expect(outcome.mode).toBe("apply");
    expect(deps.schemaPush).toHaveBeenCalledTimes(1);
    expect(order.indexOf("push")).toBeLessThan(order.indexOf("reserve"));
  });

  it("covers every model in the Prisma schema", () => {
    expect(APPLICATION_MODELS).toHaveLength(24);
    expect(APPLICATION_MODELS).toEqual(expect.arrayContaining(["User", "Driver", "VaultSession", "FileAsset", "CaptainFeedback"]));
    expect(Object.keys(plannedCounts()).sort()).toEqual([...APPLICATION_MODELS].sort());
  });
});

// ---------------------------------------------------------------------------
// Passwords and credential file
// ---------------------------------------------------------------------------

describe("passwords", () => {
  it("are independent, unique and at least 20 characters", () => {
    const passwords = Object.values(generateAccountPasswords());
    expect(passwords).toHaveLength(DEMO_ACCOUNTS.length);
    expect(new Set(passwords).size).toBe(passwords.length);
    expect(passwords.every((password) => password.length >= 20)).toBe(true);
  });

  it("refuses a random source that repeats", () => {
    expectReason(() => generateAccountPasswords(() => Buffer.alloc(24, 7)), "password-generation-failed");
  });

  it("are hashed with bcrypt cost 12", async () => {
    const hash = await hashDemoPassword("synthetic-demo-password-value");
    expect(bcrypt.getRounds(hash)).toBe(12);
    expect(await bcrypt.compare("synthetic-demo-password-value", hash)).toBe(true);
  });
});

describe("credential file", () => {
  let dir = "";
  afterEach(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
    dir = "";
  });

  const sampleBundle = (status: CredentialBundle["status"] = "pending"): CredentialBundle => ({
    format: CREDENTIALS_FORMAT,
    status,
    createdAt: "2026-10-08T09:00:00.000Z",
    target: { host: HOST, database: "neondb", schema: "midyaf" },
    accounts: DEMO_ACCOUNTS.map((account) => ({
      key: account.key,
      email: account.email,
      role: account.role,
      password: randomBytes(24).toString("base64url")
    }))
  });

  it("is created exclusively under scratch/neon-demo and never overwritten", () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "midyaf-demo-"));
    const store = fileCredentialStore(dir);
    const file = path.join(dir, "scratch", "neon-demo", "accounts.json");

    const original = sampleBundle();
    const handle = store.reserve(original);
    handle.update({ ...original, status: "complete" });
    expect(store.exists()).toBe(true);
    expect(store.read()).toEqual({ ...original, status: "complete" });
    expect(fs.readdirSync(path.dirname(file))).toEqual(["accounts.json"]);
    const before = fs.readFileSync(file, "utf8");

    expectReason(() => fileCredentialStore(dir).reserve(sampleBundle()), "credentials-file-exists");
    expect(fs.readFileSync(file, "utf8")).toBe(before);
  });

  it.each(["write-temp", "rename"] as const)(
    "a %s failure during a status update keeps the saved bundle complete and readable",
    (fail) => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), "midyaf-demo-"));
      const file = path.join(dir, "scratch", "neon-demo", "accounts.json");
      const original = sampleBundle();

      const handle = fileCredentialStore(dir, faultyFs(fail)).reserve(original);
      const before = fs.readFileSync(file, "utf8");
      expect(() => handle.update({ ...original, status: "complete" })).toThrow();

      // Byte-for-byte the original bundle, every password still readable, no temp file left.
      expect(fs.readFileSync(file, "utf8")).toBe(before);
      expect(fileCredentialStore(dir).read()).toEqual(original);
      expect(fs.readdirSync(path.dirname(file))).toEqual(["accounts.json"]);
    }
  );

  it("a failed status update after commit reports pending and every saved password matches its committed hash", async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "midyaf-demo-"));
    const { deps, db, logs } = setup({ store: fileCredentialStore(dir, faultyFs("rename")) });

    const error = await expectAsyncReason(runProvision(APPLY, deps), "credentials-status-not-updated");

    expect(db.created.User).toHaveLength(DEMO_ACCOUNTS.length);
    const saved = fileCredentialStore(dir).read();
    expect(saved.status).toBe("pending");
    for (const account of saved.accounts) {
      const user = db.created.User.find((row) => row.email === account.email)!;
      expect(await bcrypt.compare(account.password, user.passwordHash as string)).toBe(true);
    }
    expect(fs.readdirSync(path.join(dir, "scratch", "neon-demo"))).toEqual(["accounts.json"]);
    expectNoSecrets(`${error.message} ${logs.join("\n")}`, saved.accounts.map((account) => account.password));
  });

  it("a failed initial write removes the partial file and writes no records", async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "midyaf-demo-"));
    const { deps, db, order } = setup({ store: fileCredentialStore(dir, faultyFs("write-any")) });

    await expectAsyncReason(runProvision(APPLY, deps), "credentials-file-write-failed");

    expect(order).not.toContain("transaction");
    expect(db.created).toEqual({});
    expect(fs.existsSync(path.join(dir, "scratch", "neon-demo", "accounts.json"))).toBe(false);
  });

  it("leaves an unrelated pre-existing file untouched", () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "midyaf-demo-"));
    const file = path.join(dir, "scratch", "neon-demo", "accounts.json");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "keep me");

    expectReason(() => fileCredentialStore(dir).reserve(sampleBundle()), "credentials-file-exists");
    expect(fs.readFileSync(file, "utf8")).toBe("keep me");
    expectReason(() => fileCredentialStore(dir).read(), "credentials-file-invalid");
  });

  it("rejects malformed bundles", () => {
    const valid = sampleBundle("complete");
    expect(parseCredentialBundle(JSON.stringify(valid)).status).toBe("complete");
    for (const broken of [
      { ...valid, format: "other" },
      { ...valid, status: "unknown" },
      { ...valid, accounts: valid.accounts.slice(1) },
      { ...valid, accounts: valid.accounts.map((account, index) => (index === 0 ? { ...account, password: "short" } : account)) },
      { ...valid, accounts: valid.accounts.map((account, index) => (index === 0 ? { ...account, role: "GUEST" } : account)) }
    ]) {
      expectReason(() => parseCredentialBundle(JSON.stringify(broken)), "credentials-file-invalid");
    }
  });
});

// ---------------------------------------------------------------------------
// Schema push subprocess
// ---------------------------------------------------------------------------

describe("schema push subprocess", () => {
  const target = validateTargetUrl(DIRECT_URL);

  it("runs the local Prisma CLI with db push --skip-generate only", () => {
    const { command, args, options } = buildSchemaPushCommand(ROOT, target, {});
    expect(command).toBe(process.execPath);
    expect(args).toEqual([
      path.join(ROOT, "node_modules", "prisma", "build", "index.js"),
      "db",
      "push",
      "--skip-generate",
      "--schema",
      path.join(ROOT, "prisma", "schema.prisma")
    ]);
    expect(args.some((arg) => FORBIDDEN_PRISMA_ARGS.includes(arg))).toBe(false);
    expect(args.join(" ")).not.toMatch(/npx|accept-data-loss|force-reset|migrate|seed/);
    expect(options).toMatchObject({ shell: false, stdio: "pipe", cwd: ROOT });
  });

  it("passes the target URL and no ambient secrets", () => {
    const { options } = buildSchemaPushCommand(ROOT, target, {
      PATH: "/usr/bin",
      DATABASE_URL: "postgresql://ambient:ambient@old.example/db",
      OPENAI_API_KEY: "sk-ambient",
      JWT_ACCESS_SECRET: "ambient-jwt"
    });
    expect(options.env.DATABASE_URL).toBe(target.url);
    expect(options.env.PATH).toBe("/usr/bin");
    expect(JSON.stringify(options.env)).not.toMatch(/ambient/);
  });

  it("captures output and reports only a category on failure", () => {
    const spawn = vi.fn<SpawnRunner>(() => ({
      status: 1,
      stdout: "Datasource \"db\": PostgreSQL",
      stderr: `Error: P1000 authentication failed for ${DIRECT_URL}`
    }));
    const error = expectReason(() => runSchemaPush(ROOT, target, { spawn, exists: () => true, baseEnv: {} }), "schema-push-failed");
    expect(spawn).toHaveBeenCalledTimes(1);
    expectNoSecrets(`${error.message} ${JSON.stringify(describeFailure(error))}`);

    const thrown = vi.fn<SpawnRunner>(() => {
      throw new Error(`spawn failed for ${DIRECT_URL}`);
    });
    expectNoSecrets(expectReason(() => runSchemaPush(ROOT, target, { spawn: thrown, exists: () => true, baseEnv: {} }), "schema-push-failed").message);
  });

  it("does not fall back to npx when the local CLI is missing", () => {
    const spawn = vi.fn<SpawnRunner>();
    expectReason(() => runSchemaPush(ROOT, target, { spawn, exists: () => false, baseEnv: {} }), "prisma-cli-missing");
    expect(spawn).not.toHaveBeenCalled();
  });

  it("a push failure during apply stops before any credential or data write", async () => {
    const { deps, credentials, logs, order } = setup({
      schemaPush: (pinned) =>
        runSchemaPush(ROOT, pinned, {
          spawn: () => ({ status: 1, stderr: `failed for ${DIRECT_URL}` }),
          exists: () => true,
          baseEnv: {}
        })
    });
    const error = await expectAsyncReason(runProvision([...APPLY, "--create-schema"], deps), "schema-push-failed");
    expect(credentials.store.reserve).not.toHaveBeenCalled();
    expect(order).toEqual(["disconnect"]);
    expectNoSecrets(`${error.message} ${logs.join("\n")}`);
  });
});

// ---------------------------------------------------------------------------
// Verification guards and HTTP smoke
// ---------------------------------------------------------------------------

describe("verification", () => {
  const bundleFor = (status: CredentialBundle["status"], host = HOST): CredentialBundle => ({
    format: CREDENTIALS_FORMAT,
    status,
    createdAt: "2026-10-08T09:00:00.000Z",
    target: { host, database: "neondb", schema: "midyaf" },
    accounts: DEMO_ACCOUNTS.map((account) => ({
      key: account.key,
      email: account.email,
      role: account.role,
      password: randomBytes(24).toString("base64url")
    }))
  });

  const verifyDeps = (bundle: CredentialBundle) => ({
    root: ROOT,
    rootExists: () => true,
    readFile: () => `${TARGET_URL_KEY}=${DIRECT_URL}\n`,
    credentialStore: { displayPath: "scratch/neon-demo/accounts.json", read: () => bundle },
    connect: vi.fn(async () => {
      throw new Error("must not connect");
    }),
    fetch: vi.fn<FetchLike>(),
    log: vi.fn()
  });

  it.each([
    ["no host pin", [], bundleFor("complete"), "expected-host-required"],
    ["failed bundle", ["--expected-host", HOST], bundleFor("failed"), "credentials-file-failed-run"],
    ["bundle for another host", ["--expected-host", HOST], bundleFor("complete", "ep-other.eu-central-1.aws.neon.tech"), "credentials-file-host-mismatch"]
  ])("refuses before connecting: %s", async (_name, argv, bundle, reason) => {
    const deps = verifyDeps(bundle);
    await expectAsyncReason(runVerify(argv as string[], deps), reason);
    expect(deps.connect).not.toHaveBeenCalled();
  });

  const ctx: ShapeContext = {
    eventId: "evt",
    intakeId: "intake",
    supplierId: "sup",
    guestIds: { guestVip: "g1", guest: "g2" },
    driverIds: { driver: "d1", driverTwo: "d2" }
  };

  it("logs in every account, flags a leaked national ID and returns no secrets", async () => {
    const bundle = bundleFor("complete");
    const respond = (status: number, body: unknown) => ({ status, text: async () => JSON.stringify(body) });
    const fetchImpl = vi.fn<FetchLike>(async (url, init) => {
      if (url.endsWith("/api/auth/login")) {
        const { email, password } = JSON.parse(init!.body!) as { email: string; password: string };
        const account = bundle.accounts.find((entry) => entry.email === email);
        if (!account || account.password !== password) {
          return respond(401, { error: { message: "Invalid email or password" } });
        }
        return respond(200, { user: { id: `u-${account.key}`, email, role: account.role }, accessToken: `token-${account.key}` });
      }
      const token = init?.headers?.Authorization?.replace("Bearer token-", "");
      if (!token) return respond(401, { error: { message: "Missing bearer token" } });
      if (url.endsWith("/api/auth/me")) return respond(200, { user: { id: `u-${token}` } });
      return respond(200, { events: [], drivers: [{ id: "d1", nationalIdIqama: "DEMO-ID-0001" }] });
    });

    const checks = await runHttpSmoke("http://127.0.0.1:1", bundle, ctx, fetchImpl);
    const byName = (prefix: string) => checks.filter((entry) => entry.name.startsWith(prefix));

    expect(byName("login ")).toHaveLength(DEMO_ACCOUNTS.length);
    expect(byName("login ").every((entry) => entry.ok)).toBe(true);
    expect(byName("me ").every((entry) => entry.ok)).toBe(true);
    expect(checks.filter((entry) => /no hash or national ID/.test(entry.name)).every((entry) => !entry.ok)).toBe(true);
    expect(byName("denial").every((entry) => entry.ok)).toBe(true);
    expect(byName("denial")).toHaveLength(4);
    expectNoSecrets(JSON.stringify(checks), bundle.accounts.map((account) => account.password));
  });

  it("guest visibility expectations reject another guest's data", () => {
    const ownOnly = {
      events: [{ id: "evt", guests: [{ id: "g1" }], tasks: [{ guestId: "g1" }] }],
      drivers: [{ id: "d1" }],
      suppliers: [],
      vendorQuotes: []
    };
    expect(BOOTSTRAP_EXPECTATIONS.guestVip(ownOnly, ctx)).toBe(true);
    expect(
      BOOTSTRAP_EXPECTATIONS.guestVip({ ...ownOnly, events: [{ id: "evt", guests: [{ id: "g1" }, { id: "g2" }], tasks: [] }] }, ctx)
    ).toBe(false);
    expect(BOOTSTRAP_EXPECTATIONS.client({ events: [], activityIntakes: [], vendorQuotes: [], suppliers: [] }, ctx)).toBe(true);
    expect(BOOTSTRAP_EXPECTATIONS.coordinator({ events: [{ id: "evt" }], drivers: [{}, {}], suppliers: [{ id: "sup" }], vendorQuotes: [] }, ctx)).toBe(false);
  });
});
