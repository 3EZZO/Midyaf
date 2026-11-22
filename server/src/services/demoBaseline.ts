import type { Prisma } from "@prisma/client";
import { HttpError } from "../utils/http.js";
import { databaseSchemaName } from "../utils/supplierPortal.js";

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

/**
 * The application schema, from DATABASE_URL's `schema` parameter like every
 * other raw query in the app. current_schema() is not reliable: Neon does not
 * apply Prisma's search_path, so it reports "public" there (seen on the
 * SIX-TASKS Neon review branch, 2026-11-22).
 */
async function currentSchema(db: Db): Promise<string> {
  const schema = databaseSchemaName();
  const rows = await db.$queryRawUnsafe<Array<{ found: boolean }>>(
    "SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = $1) AS found",
    schema
  );
  if (!rows[0]?.found) throw new HttpError(500, `The database schema ${schema} does not exist`);
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

export type ForeignKeyEdge = { child: string; parent: string; columns: string[]; nullable: boolean };

async function foreignKeyEdges(db: Db, schema: string): Promise<ForeignKeyEdge[]> {
  const rows = await db.$queryRawUnsafe<Array<{ child: string; parent: string; columns: string[]; nullable: boolean }>>(
    `SELECT cl.relname AS child, pl.relname AS parent,
            array_agg(a.attname ORDER BY k.ord) AS columns,
            bool_and(NOT a.attnotnull) AS nullable
     FROM pg_constraint co
     JOIN pg_class cl ON cl.oid = co.conrelid
     JOIN pg_class pl ON pl.oid = co.confrelid
     JOIN pg_namespace n ON n.oid = cl.relnamespace
     JOIN pg_namespace pn ON pn.oid = pl.relnamespace
     CROSS JOIN LATERAL unnest(co.conkey) WITH ORDINALITY AS k(attnum, ord)
     JOIN pg_attribute a ON a.attrelid = co.conrelid AND a.attnum = k.attnum
     WHERE co.contype = 'f' AND n.nspname = $1 AND pn.nspname = $1
     GROUP BY co.oid, cl.relname, pl.relname`,
    schema
  );
  return rows.map((row) => ({ child: row.child, parent: row.parent, columns: [...row.columns], nullable: Boolean(row.nullable) }));
}

async function primaryKeyColumns(db: Db, schema: string, table: string): Promise<string[]> {
  const rows = await db.$queryRawUnsafe<Array<{ name: string }>>(
    `SELECT a.attname AS name FROM pg_index i
     JOIN pg_class c ON c.oid = i.indrelid JOIN pg_namespace n ON n.oid = c.relnamespace
     JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(i.indkey)
     WHERE i.indisprimary AND n.nspname = $1 AND c.relname = $2`,
    schema,
    table
  );
  return rows.map((row) => row.name);
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

/** Strongly connected components (Tarjan), for finding foreign-key cycles. */
function components(tables: string[], edges: ForeignKeyEdge[]): Map<string, number> {
  const next = new Map<string, string[]>(tables.map((table) => [table, []]));
  for (const edge of edges) if (next.has(edge.child) && next.has(edge.parent)) next.get(edge.child)!.push(edge.parent);
  const index = new Map<string, number>(), low = new Map<string, number>(), component = new Map<string, number>();
  const stack: string[] = [], onStack = new Set<string>();
  let counter = 0, id = 0;
  const visit = (table: string) => {
    index.set(table, counter); low.set(table, counter); counter += 1;
    stack.push(table); onStack.add(table);
    for (const parent of next.get(table)!) {
      if (!index.has(parent)) { visit(parent); low.set(table, Math.min(low.get(table)!, low.get(parent)!)); }
      else if (onStack.has(parent)) low.set(table, Math.min(low.get(table)!, index.get(parent)!));
    }
    if (low.get(table) === index.get(table)) {
      let member: string;
      do { member = stack.pop()!; onStack.delete(member); component.set(member, id); } while (member !== table);
      id += 1;
    }
  };
  for (const table of [...tables].sort()) if (!index.has(table)) visit(table);
  return component;
}

export type RestorePlan = { order: string[]; deferred: ForeignKeyEdge[] };

/**
 * Parent-first insert order. Foreign keys inside a cycle (including a table
 * referencing itself) are inserted as NULL and filled in after every row
 * exists; that needs their columns to be nullable. A cycle through a required
 * column cannot be restored row-blind: refuse instead of half-restoring.
 */
export function planRestore(tables: string[], edges: ForeignKeyEdge[]): RestorePlan {
  const known = new Set(tables);
  const relevant = edges.filter((edge) => known.has(edge.child) && known.has(edge.parent));
  const component = components(tables, relevant);
  const deferred: ForeignKeyEdge[] = [];
  const parents = new Map<string, Set<string>>(tables.map((table) => [table, new Set<string>()]));
  for (const edge of relevant) {
    const cyclic = edge.child === edge.parent || component.get(edge.child) === component.get(edge.parent);
    if (cyclic && edge.nullable) { deferred.push(edge); continue; }
    if (edge.child === edge.parent) throw new HttpError(409, `Demo reset cannot restore the required self-reference on ${edge.child}`);
    parents.get(edge.child)!.add(edge.parent);
  }
  const order: string[] = [];
  const done = new Set<string>();
  const visiting = new Set<string>();
  const visit = (table: string) => {
    if (done.has(table)) return;
    if (visiting.has(table)) throw new HttpError(409, "Demo reset found a foreign-key cycle through required columns; refusing to restore");
    visiting.add(table);
    for (const parent of [...parents.get(table)!].sort()) visit(parent);
    visiting.delete(table);
    done.add(table);
    order.push(table);
  };
  for (const table of [...tables].sort()) visit(table);
  return { order, deferred };
}

/** Back-compatible order only (tests and diagnostics). */
export function parentFirstOrder(tables: string[], edges: Array<Pick<ForeignKeyEdge, "child" | "parent"> & Partial<ForeignKeyEdge>>): string[] {
  return planRestore(tables, edges.map((edge) => ({ columns: [], nullable: false, ...edge }))).order;
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
  const plan = planRestore(tables, await foreignKeyEdges(db, schema));

  let removed = 0;
  for (const table of tables) removed += await countRows(db, schema, table);
  await db.$executeRawUnsafe(
    `TRUNCATE ${tables.map((table) => `${quoteIdent(schema)}.${quoteIdent(table)}`).join(", ")}`
  );

  const deferredColumns = new Map<string, Set<string>>();
  for (const edge of plan.deferred) {
    const set = deferredColumns.get(edge.child) ?? new Set<string>();
    for (const column of edge.columns) set.add(column);
    deferredColumns.set(edge.child, set);
  }

  let restored = 0;
  const restoredColumns = new Map<string, string[]>();
  for (const table of plan.order) {
    if (!baseTables.has(table)) continue;
    const target = await insertableColumns(db, schema, table);
    const available = new Set(await insertableColumns(db, base, table));
    const shared = target.filter((column) => available.has(column));
    if (!shared.length) continue;
    restoredColumns.set(table, shared);
    const later = deferredColumns.get(table) ?? new Set<string>();
    const columns = shared.map(quoteIdent).join(", ");
    const values = shared.map((column) => (later.has(column) ? "NULL" : quoteIdent(column))).join(", ");
    restored += await db.$executeRawUnsafe(
      `INSERT INTO ${quoteIdent(schema)}.${quoteIdent(table)} (${columns}) SELECT ${values} FROM ${quoteIdent(base)}.${quoteIdent(table)}`
    );
  }

  // Fill the deferred cyclic references now that every row exists.
  for (const [table, later] of deferredColumns) {
    const shared = restoredColumns.get(table);
    if (!shared) continue;
    const columns = [...later].filter((column) => shared.includes(column));
    if (!columns.length) continue;
    const keys = await primaryKeyColumns(db, schema, table);
    if (!keys.length) throw new HttpError(409, `Demo reset cannot restore ${table}: it has no primary key`);
    const target = `${quoteIdent(schema)}.${quoteIdent(table)}`;
    await db.$executeRawUnsafe(
      `UPDATE ${target} AS t SET ${columns.map((column) => `${quoteIdent(column)} = b.${quoteIdent(column)}`).join(", ")}
       FROM ${quoteIdent(base)}.${quoteIdent(table)} AS b
       WHERE ${keys.map((key) => `t.${quoteIdent(key)} = b.${quoteIdent(key)}`).join(" AND ")}
         AND (${columns.map((column) => `b.${quoteIdent(column)} IS NOT NULL`).join(" OR ")})`
    );
  }
  return { removed, restored, baseline };
}
