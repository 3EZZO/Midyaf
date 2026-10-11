-- SUPPLIER-001 additive schema (D-020). PREPARED, NOT APPLIED.
--
-- Adds supplier ownership to VendorQuote and the append-only
-- SupplierRequestNote table. Purely additive: no DROP, no data rewrite, no
-- backfill of legacy quotes by vendorName. Safe to re-run: every object is
-- created only when missing, and the preflight refuses a drifted target.
--
-- Run only after a separate, concrete approval, against an explicitly
-- confirmed target (see docs/ai-output/SUPPLIER-001_RUNBOOK.md), over a
-- DIRECT (non-pooled) connection, for example:
--   psql "$DIRECT_DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/supplier-001-additive.sql
-- The application must not be released with the new queries before this
-- script has been applied: startup never changes the schema.

BEGIN;

SET LOCAL search_path TO midyaf;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Preflight: the target schema and the tables this change builds on exist
-- with the expected key/column types.
DO $$
DECLARE
  missing text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'midyaf') THEN
    RAISE EXCEPTION 'SUPPLIER-001 preflight: schema midyaf does not exist';
  END IF;

  SELECT string_agg(t, ', ') INTO missing
  FROM unnest(ARRAY['VendorQuote', 'Supplier', 'ActivityIntake', 'User']) AS t
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'midyaf' AND table_name = t
  );
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'SUPPLIER-001 preflight: missing tables: %', missing;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'midyaf' AND table_name = 'VendorQuote'
      AND column_name = 'intakeId' AND data_type = 'text' AND is_nullable = 'NO'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'midyaf' AND table_name = 'VendorQuote'
      AND column_name = 'category' AND data_type = 'text' AND is_nullable = 'NO'
  ) THEN
    RAISE EXCEPTION 'SUPPLIER-001 preflight: VendorQuote.intakeId/category drifted';
  END IF;

  -- A rerun is fine; a column of another shape is drift.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'midyaf' AND table_name = 'VendorQuote'
      AND column_name = 'supplierId'
      AND (data_type <> 'text' OR is_nullable <> 'YES')
  ) THEN
    RAISE EXCEPTION 'SUPPLIER-001 preflight: VendorQuote.supplierId exists with another shape';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'midyaf' AND table_name = 'SupplierRequestNote'
  ) AND (
    SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'midyaf' AND table_name = 'SupplierRequestNote'
      AND column_name IN ('id', 'intakeId', 'supplierId', 'authorUserId', 'text', 'createdAt')
  ) <> 6 THEN
    RAISE EXCEPTION 'SUPPLIER-001 preflight: SupplierRequestNote exists with another shape';
  END IF;
END
$$;

-- VendorQuote ownership: nullable, legacy rows stay NULL. NULLs are distinct
-- in a unique index, so legacy quotes are unaffected by the initial-quote key.
ALTER TABLE "VendorQuote" ADD COLUMN IF NOT EXISTS "supplierId" TEXT;

CREATE INDEX IF NOT EXISTS "VendorQuote_supplierId_idx"
  ON "VendorQuote"("supplierId");

CREATE UNIQUE INDEX IF NOT EXISTS "VendorQuote_supplierId_intakeId_category_key"
  ON "VendorQuote"("supplierId", "intakeId", "category");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE n.nspname = 'midyaf' AND c.conname = 'VendorQuote_supplierId_fkey'
  ) THEN
    ALTER TABLE "VendorQuote" ADD CONSTRAINT "VendorQuote_supplierId_fkey"
      FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;

-- Append-only supplier recommendations with real provenance relations.
CREATE TABLE IF NOT EXISTS "SupplierRequestNote" (
  "id" TEXT NOT NULL,
  "intakeId" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "authorUserId" TEXT NOT NULL,
  "text" VARCHAR(2000) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupplierRequestNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SupplierRequestNote_intakeId_createdAt_idx"
  ON "SupplierRequestNote"("intakeId", "createdAt");

CREATE INDEX IF NOT EXISTS "SupplierRequestNote_supplierId_createdAt_idx"
  ON "SupplierRequestNote"("supplierId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE n.nspname = 'midyaf' AND c.conname = 'SupplierRequestNote_intakeId_fkey'
  ) THEN
    ALTER TABLE "SupplierRequestNote" ADD CONSTRAINT "SupplierRequestNote_intakeId_fkey"
      FOREIGN KEY ("intakeId") REFERENCES "ActivityIntake"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE n.nspname = 'midyaf' AND c.conname = 'SupplierRequestNote_supplierId_fkey'
  ) THEN
    ALTER TABLE "SupplierRequestNote" ADD CONSTRAINT "SupplierRequestNote_supplierId_fkey"
      FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE n.nspname = 'midyaf' AND c.conname = 'SupplierRequestNote_authorUserId_fkey'
  ) THEN
    ALTER TABLE "SupplierRequestNote" ADD CONSTRAINT "SupplierRequestNote_authorUserId_fkey"
      FOREIGN KEY ("authorUserId") REFERENCES "User"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;

-- Post-check: every expected object is present before COMMIT.
DO $$
BEGIN
  IF (
    SELECT count(*) FROM pg_indexes
    WHERE schemaname = 'midyaf' AND indexname IN (
      'VendorQuote_supplierId_idx',
      'VendorQuote_supplierId_intakeId_category_key',
      'SupplierRequestNote_pkey',
      'SupplierRequestNote_intakeId_createdAt_idx',
      'SupplierRequestNote_supplierId_createdAt_idx'
    )
  ) <> 5 THEN
    RAISE EXCEPTION 'SUPPLIER-001 post-check: indexes incomplete';
  END IF;

  IF (
    SELECT count(*) FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE n.nspname = 'midyaf' AND c.conname IN (
      'VendorQuote_supplierId_fkey',
      'SupplierRequestNote_intakeId_fkey',
      'SupplierRequestNote_supplierId_fkey',
      'SupplierRequestNote_authorUserId_fkey'
    )
  ) <> 4 THEN
    RAISE EXCEPTION 'SUPPLIER-001 post-check: foreign keys incomplete';
  END IF;
END
$$;

COMMIT;
