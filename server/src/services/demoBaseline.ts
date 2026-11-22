import type { Prisma } from "@prisma/client";
import { HttpError } from "../utils/http.js";

/**
 * SIX-TASKS #6 deterministic investor-demo reset.
 *
 * "Capture" copies every application table of the current schema into a
 * sibling schema `<schema>_demo_baseline` (CREATE TABLE AS). "Reset" restores
 * that exact state in ONE transaction: it truncates the application tables and
 * re-inserts the baseline rows parent-first (foreign-key order read from the
 * catalog). Anything the presenter created or changed after the capture (new
 * events, edited/approved plans, approved quotes, opened vaults, signed
 * contracts, registrations, messages) is therefore undone, and accounts and
 * passwords are back to their captured values.
 *
 * Only reachable through /api/demo with DEMO_MODE_ENABLED=true and a Super
 * Admin origin: enabling demo mode declares the database disposable demo data.
 */

type Db = Pick<Prisma.TransactionClient, "$queryRawUnsafe" | "$executeRawUnsafe">;

const EXCLUDED_TABLES = new Set(["_prisma_migrations"]);
const META_TABLE = "__demo_baseline_meta";
const LOCK_KEY = "midyaf-demo-baseline";

export const DEMO_TRANSACTION = { maxWait: 10_000, timeout: 120_000 } as const;

export function quoteIdent(name: string) {
  return `"${name.replace(/"/g, '""')}"`;
}

export function baselineSchemaFor(schema: string) {
  return `${schema}_demo_baseline`;
}

async function currentSchema(db: Db): Promise<string> {
  const rows = await db.$queryRawUnsafe<Array<{ schema: string }>>("SELECT current_schema() AS schema");
  const schema = rows[0]?.schema;
  if (!schema) throw new HttpError(500, "Unable to resolve the database schema");
  return schema;
}

async function lock(db: Db) {
  await db.$queryRawUnsafe("SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext($1))) AS l", LOCK_KEY);
}

async function listTables(db: Db, schema: string): Promise<string[]> {
  const rows = await db.$queryRawUnsafe<Array<{ name: string }>>(
    `SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = $1 AND c.relkind IN ('r', 'p') ORDER BY c.relname`,
    schema
  );
  return rows.map((row) => row.name).filter((name) => !EXCLUDED_TABLES.has(name) && name !== META_TABLE);
}

async function foreignKeyEdges(db: Db, schema: string): Promise<Array<{ child: string; parent: string }>> {
  return db.$queryRawUnsafe<Array<{ child: string; parent: string }>>(
    `SELECT DISTINCT cl.relname AS child, pl.relname AS parent
     FROM pg_constraint co
     JOIN pg_class cl ON cl.oid = co.conrelid
     JOIN pg_class pl ON pl.oid = co.confrelid
     JOIN pg_namespace n ON n.oid = cl.relnamespace
     JOIN pg_namespace pn ON pn.oid = pl.relnamespace
     WHERE co.contype = 'f' AND n.nspname = $1 AND pn.nspname = $1`,
    schema
  );
}

/** Insertable (non-generated) columns of a table. */
async function insertableColumns(db: Db, schema: string, table: string): Promise<string[]> {
  const rows = await db.$queryRawUnsafe<Array<{ name: string }>>(
    `SELECT a.attname AS name FROM pg_attribute a
     JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = $1 AND c.relname = $2 AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = ''
     ORDER BY a.attnum`,
    schema,
    table
  );
  return rows.map((row) => row.name);
}

/**
 * Parent-first order. A table that references itself, or a cycle between
 * tables, cannot be restored row-blind: refuse instead of half-restoring.
 */
export function parentFirstOrder(tables: string[], edges: Array<{ child: string; parent: string }>): string[] {
  const known = new Set(tables);
  const parents = new Map<string, Set<string>>(tables.map((table) => [table, new Set<string>()]));
  for (const { child, parent } of edges) {
    if (!known.has(child) || !known.has(parent)) continue;
    if (child === parent) throw new HttpError(409, `Demo reset cannot restore the self-referencing table ${child}`);
    parents.get(child)!.add(parent);
  }
  const order: string[] = [];
  const done = new Set<string>();
  const visiting = new Set<string>();
  const visit = (table: string) => {
    if (done.has(table)) return;
    if (visiting.has(table)) throw new HttpError(409, "Demo reset found a foreign-key cycle; refusing to restore");
    visiting.add(table);
    for (const parent of [...parents.get(table)!].sort()) visit(parent);
    visiting.delete(table);
    done.add(table);
    order.push(table);
  };
  for (const table of [...tables].sort()) visit(table);
  return order;
}

export type BaselineInfo = { capturedAt: string; tables: number; rows: number };

export async function readBaselineInfo(db: Db): Promise<BaselineInfo | null> {
  const schema = await currentSchema(db);
  const base = baselineSchemaFor(schema);
  const exists = await db.$queryRawUnsafe<Array<{ ok: boolean }>>(
    `SELECT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = $1 AND c.relname = $2) AS ok`,
    base,
    META_TABLE
  );
  if (!exists[0]?.ok) return null;
  const rows = await db.$queryRawUnsafe<Array<{ captured_at: Date; tables: number; rows: bigint | number }>>(
    `SELECT captured_at, tables, rows FROM ${quoteIdent(base)}.${quoteIdent(META_TABLE)} ORDER BY captured_at DESC LIMIT 1`
  );
  const row = rows[0];
  return row ? { capturedAt: new Date(row.captured_at).toISOString(), tables: Number(row.tables), rows: Number(row.rows) } : null;
}

async function countRows(db: Db, schema: string, table: string) {
  const rows = await db.$queryRawUnsafe<Array<{ n: bigint | number }>>(
    `SELECT count(*) AS n FROM ${quoteIdent(schema)}.${quoteIdent(table)}`
  );
  return Number(rows[0]?.n ?? 0);
}

/** Replaces the stored baseline with the current state of every application table. */
export async function captureBaseline(db: Db): Promise<BaselineInfo> {
  await lock(db);
  const schema = await currentSchema(db);
  const base = baselineSchemaFor(schema);
  const tables = await listTables(db, schema);
  if (tables.length === 0) throw new HttpError(409, "No application tables found");
  await db.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS ${quoteIdent(base)}`);
  // Drop the previous baseline tables (including tables that no longer exist).
  for (const old of await listTables(db, base)) {
    await db.$executeRawUnsafe(`DROP TABLE IF EXISTS ${quoteIdent(base)}.${quoteIdent(old)}`);
  }
  let rows = 0;
  for (const table of tables) {
    await db.$executeRawUnsafe(
      `CREATE TABLE ${quoteIdent(base)}.${quoteIdent(table)} AS TABLE ${quoteIdent(schema)}.${quoteIdent(table)}`
    );
    rows += await countRows(db, base, table);
  }
  await db.$executeRawUnsafe(`DROP TABLE IF EXISTS ${quoteIdent(base)}.${quoteIdent(META_TABLE)}`);
  await db.$executeRawUnsafe(
    `CREATE TABLE ${quoteIdent(base)}.${quoteIdent(META_TABLE)} (captured_at timestamptz NOT NULL, tables integer NOT NULL, rows bigint NOT NULL)`
  );
  const capturedAt = new Date();
  await db.$executeRawUnsafe(
    `INSERT INTO ${quoteIdent(base)}.${quoteIdent(META_TABLE)} (captured_at, tables, rows) VALUES ($1, $2, $3)`,
    capturedAt,
    tables.length,
    rows
  );
  return { capturedAt: capturedAt.toISOString(), tables: tables.length, rows };
}

/**
 * Restores the captured baseline. Returns how many rows were removed (the
 * whole current state) and restored (the baseline). Fails closed, inside the
 * caller's transaction, when no baseline exists or the schema has changed in
 * a way the baseline cannot fill (e.g. a new required column).
 */
export async function restoreBaseline(db: Db): Promise<{ removed: number; restored: number; baseline: BaselineInfo }> {
  await lock(db);
  const baseline = await readBaselineInfo(db);
  if (!baseline) throw new HttpError(409, "No demo baseline has been captured yet");
  const schema = await currentSchema(db);
  const base = baselineSchemaFor(schema);
  const tables = await listTables(db, schema);
  const baseTables = new Set(await listTables(db, base));
  const order = parentFirstOrder(tables, await foreignKeyEdges(db, schema));

  let removed = 0;
  for (const table of tables) removed += await countRows(db, schema, table);
  await db.$executeRawUnsafe(
    `TRUNCATE ${tables.map((table) => `${quoteIdent(schema)}.${quoteIdent(table)}`).join(", ")}`
  );

  let restored = 0;
  for (const table of order) {
    if (!baseTables.has(table)) continue;
    const target = await insertableColumns(db, schema, table);
    const available = new Set(await insertableColumns(db, base, table));
    const columns = target.filter((column) => available.has(column)).map(quoteIdent).join(", ");
    if (!columns) continue;
    restored += await db.$executeRawUnsafe(
      `INSERT INTO ${quoteIdent(schema)}.${quoteIdent(table)} (${columns}) SELECT ${columns} FROM ${quoteIdent(base)}.${quoteIdent(table)}`
    );
  }
  return { removed, restored, baseline };
}
