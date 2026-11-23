-- PLAN_READY_1 Sprint 3: Native Web Push (VAPID) additive schema. PREPARED, NOT APPLIED.
--
-- Adds the `PushSubscription` table for Android Chrome & iOS 16.4+ Home Screen
-- PWA lock-screen alerts. Purely additive: no DROP, no data rewrite. Safe to re-run.
--
-- Apply after concrete approval, over a DIRECT connection, BEFORE releasing
-- application code that reads/writes `PushSubscription` when VAPID keys are set:
--   psql "$DIRECT_DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/plan-ready-1-push-additive.sql

BEGIN;

SET LOCAL search_path TO midyaf;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'midyaf') THEN
    RAISE EXCEPTION 'PLAN_READY_1 webpush preflight: schema midyaf does not exist';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'midyaf' AND table_name = 'User'
  ) THEN
    RAISE EXCEPTION 'PLAN_READY_1 webpush preflight: table User does not exist';
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "PushSubscription" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "endpoint" VARCHAR(1024) NOT NULL,
  "p256dh" VARCHAR(256) NOT NULL,
  "auth" VARCHAR(128) NOT NULL,
  "userAgent" VARCHAR(255),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PushSubscription_endpoint_key"
  ON "PushSubscription"("endpoint");

CREATE INDEX IF NOT EXISTS "PushSubscription_userId_idx"
  ON "PushSubscription"("userId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'PushSubscription_userId_fkey'
      AND connamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'midyaf')
  ) THEN
    ALTER TABLE "PushSubscription"
      ADD CONSTRAINT "PushSubscription_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

COMMIT;
