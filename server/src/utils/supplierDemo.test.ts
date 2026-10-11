import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ActivityStatus, Prisma, QuoteStatus, Role } from "@prisma/client";
import { createMemoryPrisma, type MemoryPrisma } from "../testing/memoryPrisma.js";
import {
  SUPPLIER_FIXTURE,
  parseSupplierDemoArgs,
  runSupplierDemo,
  runSupplierDemoVerify
} from "./supplierDemo.js";
import { DEMO_ACCOUNTS, accountBaselineFingerprint } from "./demoProvisioning.js";
import { SUPPLIER_DEMO_REQUESTS } from "./supplierPortal.js";

/**
 * SUPPLIER-001 fixture guard tests. Target files live in a temporary
 * directory and the database is the in-memory double: nothing connects to a
 * real database. All values are synthetic.
 */

const DEMO = SUPPLIER_DEMO_REQUESTS[0];
const HOST = "ep-synthetic-supplier-123456.us-west-2.aws.neon.tech";
const URL_OK = `postgresql://synthetic_owner:synthetic-pass@${HOST}/neondb?sslmode=require&schema=midyaf`;
const ARGS = ["--expected-host", HOST, "--expected-database", "neondb"];
const ALL_TABLES = new Set(Object.values(Prisma.ModelName));

let root: string;
let memory: MemoryPrisma;
let lines: string[];

function writeTarget(url = URL_OK) {
  fs.writeFileSync(path.join(root, ".env.neon.local"), `DATABASE_URL="${url}"\n`);
}

function seedDemo() {
  memory.seed({
    user: Array.from({ length: SUPPLIER_FIXTURE.expectedUsers }, (_, index) => ({
      id: `usr_${index}`,
      email: `account${index}@example.test`,
      role: index === 0 ? Role.SUPPLIER : Role.GUEST,
      name: `Account ${index}`
    })),
    event: [{ id: DEMO.eventId, organizerId: "usr_1", date: new Date("2026-11-02T06:00:00Z"), currency: "SAR", timezone: "Asia/Riyadh" }],
    activityIntake: [
      {
        id: DEMO.intakeId,
        eventId: DEMO.eventId,
        status: ActivityStatus.QUOTING,
        visitorCount: 24,
        vipVisitorCount: 6,
        normalVisitorCount: 18,
        ticketType: "MIXED"
      }
    ],
    supplier: [
      { id: "sup_hotel", userId: "usr_0", name: "Synthetic Hotel", category: "HOTEL", commissionPercent: "12.00" },
      { id: "sup_car", userId: null, name: "Synthetic Car", category: "CAR", commissionPercent: "12.00" }
    ],
    vendorQuote: [
      { id: "q1", intakeId: DEMO.intakeId, supplierId: null, category: "Hotels", item: "Legacy", quantity: 1, unitPrice: "1", status: QuoteStatus.RECEIVED },
      { id: "q2", intakeId: DEMO.intakeId, supplierId: null, category: "Cars", item: "Legacy", quantity: 1, unitPrice: "1", status: QuoteStatus.RECEIVED }
    ]
  });
}

function deps(tables: Set<string> = ALL_TABLES) {
  return {
    root,
    createClient: async () => Object.assign(memory.prisma, { $disconnect: async () => undefined }),
    schemaTables: async () => tables,
    log: (line: string) => lines.push(line),
    now: () => new Date("2026-10-11T08:00:00Z")
  };
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "supplier-demo-"));
  fs.mkdirSync(path.join(root, "prisma"));
  fs.writeFileSync(path.join(root, "prisma", "schema.prisma"), "// synthetic\n");
  writeTarget();
  memory = createMemoryPrisma();
  seedDemo();
  lines = [];
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

const supplierQuotes = () => memory.rows("vendorQuote").filter((q) => q.supplierId);

describe("parseSupplierDemoArgs", () => {
  it("requires the expected host and database and allows only --apply", () => {
    expect(parseSupplierDemoArgs(ARGS)).toEqual({ apply: false, expectedHost: HOST, expectedDatabase: "neondb" });
    expect(parseSupplierDemoArgs([...ARGS, "--apply"]).apply).toBe(true);
    for (const argv of [[], ["--apply"], ["--expected-host", HOST], [...ARGS, "--force"], [...ARGS, "--apply", "--apply"]]) {
      expect(() => parseSupplierDemoArgs(argv)).toThrow(expect.objectContaining({ reason: "args-invalid" }));
    }
    expect(() => parseSupplierDemoArgs([...ARGS, "--apply"], false)).toThrow(
      expect.objectContaining({ reason: "args-invalid" })
    );
  });
});

describe("runSupplierDemo", () => {
  it("dry run checks everything and writes nothing", async () => {
    const result = await runSupplierDemo(ARGS, deps());
    expect(result).toEqual({ applied: false, created: { quote: false, note: false } });
    expect(memory.mutations()).toHaveLength(0);
    expect(lines.join("\n")).toContain("DRY RUN");
    expect(lines.join("\n")).not.toMatch(/synthetic-pass|synthetic_owner|example\.test|1200|18000/);
  });

  it("applies exactly one sealed quote and one note, then is a no-op", async () => {
    const first = await runSupplierDemo([...ARGS, "--apply"], deps());
    expect(first.created).toEqual({ quote: true, note: true });
    expect(supplierQuotes()).toEqual([
      expect.objectContaining({
        supplierId: "sup_hotel",
        category: "HOTEL",
        item: SUPPLIER_FIXTURE.item,
        quantity: 15,
        unitPrice: "1200.00",
        totalPrice: "18000.00",
        status: QuoteStatus.RECEIVED,
        isVaultSealed: true,
        score: 0
      })
    ]);
    expect(memory.rows("supplierRequestNote")).toEqual([
      expect.objectContaining({ supplierId: "sup_hotel", authorUserId: "usr_0", text: SUPPLIER_FIXTURE.noteText })
    ]);
    expect(memory.rows("auditLog").map((a) => a.action).sort()).toEqual([
      "supplier_note.append",
      "supplier_quote.submit"
    ]);
    expect(JSON.stringify(memory.rows("auditLog"))).not.toMatch(/1200|18000|Synthetic showcase/);
    // Legacy quotes, accounts and other suppliers are untouched.
    expect(memory.rows("vendorQuote").filter((q) => !q.supplierId).map((q) => q.id)).toEqual(["q1", "q2"]);
    expect(memory.rows("user")).toHaveLength(11);

    const again = await runSupplierDemo([...ARGS, "--apply"], deps());
    expect(again.created).toEqual({ quote: false, note: false });
    expect(supplierQuotes()).toHaveLength(1);
  });

  it("refuses to overwrite different existing state", async () => {
    memory.rows("vendorQuote").push({
      id: "q_other",
      intakeId: DEMO.intakeId,
      supplierId: "sup_hotel",
      category: "HOTEL",
      item: "Something else",
      quantity: 15,
      unitPrice: "1200.00",
      status: QuoteStatus.RECEIVED,
      isVaultSealed: true
    });
    await expect(runSupplierDemo([...ARGS, "--apply"], deps())).rejects.toMatchObject({ reason: "fixture-conflict" });
    expect(memory.rows("supplierRequestNote")).toHaveLength(0);
  });

  it.each([
    ["missing additive tables", () => deps(new Set(["User"])), "schema-incomplete"],
    ["an extra account", () => {
      memory.rows("user").push({ id: "usr_x", email: "x@example.test", role: Role.GUEST });
      return deps();
    }, "account-count-mismatch"],
    ["a closed intake", () => {
      memory.rows("activityIntake")[0].status = ActivityStatus.CONTRACTING;
      return deps();
    }, "demo-linkage-missing"],
    ["a third legacy quote", () => {
      memory.rows("vendorQuote").push({ id: "q3", intakeId: DEMO.intakeId, supplierId: null, category: "x" });
      return deps();
    }, "legacy-quotes-mismatch"],
    ["no linked hotel supplier", () => {
      memory.rows("supplier")[0].userId = null;
      return deps();
    }, "hotel-supplier-missing"]
  ])("refuses on %s before writing", async (_name, prepare, reason) => {
    await expect(runSupplierDemo([...ARGS, "--apply"], prepare())).rejects.toMatchObject({ reason });
    expect(memory.mutations()).toHaveLength(0);
  });

  it.each([
    ["host mismatch", URL_OK, ["--expected-host", "ep-other-1.us-west-2.aws.neon.tech", "--expected-database", "neondb"], "expected-host-mismatch"],
    ["database mismatch", URL_OK, ["--expected-host", HOST, "--expected-database", "otherdb"], "expected-database-mismatch"],
    ["pooled endpoint", URL_OK.replace("ep-synthetic-supplier-123456", "ep-synthetic-supplier-123456-pooler"), ["--expected-host", HOST.replace("123456", "123456-pooler"), "--expected-database", "neondb"], "target-pooled-endpoint"],
    ["other schema", URL_OK.replace("schema=midyaf", "schema=public"), ARGS, "target-schema-not-midyaf"]
  ])("refuses a %s before connecting", async (_name, url, argv, reason) => {
    writeTarget(url);
    let connected = false;
    const guardDeps = { ...deps(), createClient: async () => {
      connected = true;
      return Object.assign(memory.prisma, { $disconnect: async () => undefined });
    } };
    await expect(runSupplierDemo([...argv, "--apply"], guardDeps)).rejects.toMatchObject({ reason });
    expect(connected).toBe(false);
  });

  it.each([
    ["absent", undefined],
    ["pointing at another schema", "postgresql://ambient:ambient@localhost:5432/other?schema=public"]
  ])("locks the validated target's schema when the ambient DATABASE_URL is %s", async (_name, ambient) => {
    const saved = process.env.DATABASE_URL;
    if (ambient === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = ambient;
    try {
      await runSupplierDemo([...ARGS, "--apply"], deps());
    } finally {
      if (saved === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = saved;
    }
    const locks = memory.calls
      .filter((call) => call.method === "$queryRaw")
      .map((call) => (call.args.values[0] as { sql: string }).sql);
    expect(locks).toEqual(['"midyaf"."ActivityIntake"']);
    expect(supplierQuotes()).toHaveLength(1);
  });

  it("rolls back when the audit write fails", async () => {
    memory.failNext("auditLog", "create", new Error("audit unavailable"));
    await expect(runSupplierDemo([...ARGS, "--apply"], deps())).rejects.toMatchObject({ reason: "transaction-failed" });
    expect(supplierQuotes()).toHaveLength(0);
    expect(memory.rows("supplierRequestNote")).toHaveLength(0);
  });
});

describe("runSupplierDemoVerify", () => {
  it("is read-only and reports the fixture state", async () => {
    const before = await runSupplierDemoVerify(ARGS, deps());
    expect(before.failed).toBeGreaterThan(0);
    expect(memory.mutations()).toHaveLength(0);

    await runSupplierDemo([...ARGS, "--apply"], deps());
    lines = [];
    const after = await runSupplierDemoVerify(ARGS, deps());
    expect(after.failed).toBe(0);
    expect(lines.every((line) => !/synthetic-pass|example\.test/.test(line))).toBe(true);
  });
});

function pinnedAccounts() {
  const users = memory.rows("user");
  users.splice(0, users.length, ...DEMO_ACCOUNTS.map((a, i) => ({ id: "usr_" + i, email: a.email, role: a.role, passwordHash: "synthetic-hash-" + i })),
    ...[11, 12].map(i => ({ id: "usr_" + i, email: "extra" + i + "@example.test", role: Role.GUEST, passwordHash: "synthetic-hash-" + i })));
  memory.rows("supplier")[0].userId = users.find(u => u.role === Role.SUPPLIER)!.id;
  return [...ARGS, "--expected-account-count", "13", "--expected-account-fingerprint", accountBaselineFingerprint(users as any)];
}
describe("explicit account preservation pin", () => {
  it("refuses additional accounts by default and malformed or incomplete pins", async () => {
    const args = pinnedAccounts();
    await expect(runSupplierDemo(ARGS, deps())).rejects.toMatchObject({ reason: "account-count-mismatch" });
    for (const suffix of [["--expected-account-count", "13"], ["--expected-account-fingerprint", "a".repeat(64)],
      ["--expected-account-count", "13.0", "--expected-account-fingerprint", "a".repeat(64)],
      ["--expected-account-count", "13", "--expected-account-fingerprint", "bad"]]) {
      expect(() => parseSupplierDemoArgs([...ARGS, ...suffix])).toThrow();
    }
    expect(parseSupplierDemoArgs(args).accountBaseline?.count).toBe(13);
    expect(memory.mutations()).toHaveLength(0);
  });
  it("accepts the exact baseline read-only and applies idempotently without touching accounts", async () => {
    const args = pinnedAccounts(), before = structuredClone(memory.rows("user"));
    await runSupplierDemo(args, deps()); expect(memory.mutations()).toHaveLength(0);
    expect((await runSupplierDemo([...args, "--apply"], deps())).created).toEqual({ quote: true, note: true });
    expect((await runSupplierDemo([...args, "--apply"], deps())).created).toEqual({ quote: false, note: false });
    expect(await runSupplierDemoVerify(args, deps())).toEqual({ passed: 6, failed: 0 });
    expect(memory.rows("user")).toEqual(before);
    expect(memory.mutations().filter(c => c.model === "user")).toHaveLength(0);
  });
  it("refuses count, fingerprint, original role/password changes and privileged extras", async () => {
    for (const change of ["count", "fingerprint", "role", "password", "extra"]) {
      seedDemo(); const args = pinnedAccounts();
      if (change === "count") args[args.indexOf("13")] = "14";
      if (change === "fingerprint") args[args.length - 1] = "0".repeat(64);
      if (change === "role") memory.rows("user")[0].role = Role.GUEST;
      if (change === "password") memory.rows("user")[0].passwordHash += "changed";
      if (change === "extra") { memory.rows("user")[12].role = Role.SUPER_ADMIN; args[args.length - 1] = accountBaselineFingerprint(memory.rows("user") as any); }
      await expect(runSupplierDemo([...args, "--apply"], deps())).rejects.toMatchObject({ reason: "account-count-mismatch" });
      expect(memory.mutations()).toHaveLength(0);
    }
  });
  it("rechecks identity/password baseline inside the write transaction", async () => {
    const args = pinnedAccounts();
    memory.beforeNext("$raw", "$queryRaw", () => { memory.rows("user")[12].passwordHash += "changed"; });
    await expect(runSupplierDemo([...args, "--apply"], deps())).rejects.toMatchObject({ reason: "account-count-mismatch" });
    expect(supplierQuotes()).toHaveLength(0); expect(memory.mutations()).toHaveLength(0);
  });
});
