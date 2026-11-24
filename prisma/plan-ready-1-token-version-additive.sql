-- PLAN_READY_1 token-version additive schema. PREPARED; apply to a Neon BRANCH first,
-- then to the live database BEFORE merging the PR that reads the column.
--
-- Adds User.tokenVersion (INTEGER NOT NULL DEFAULT 0). A password reset bumps it,
-- so every refresh token issued before the reset is rejected by /auth/refresh.
-- Existing users get 0, which matches every refresh token issued before this change
-- (tokens without a version are treated as 0), so nobody is signed out by applying it.
-- Nothing else changes: no other table, column, row or account is touched.
-- Safe to re-run (IF NOT EXISTS). Adding a column with a constant default is a
-- metadata-only change on PostgreSQL 11+ (no table rewrite).
--
--   psql "$DIRECT_DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/plan-ready-1-token-version-additive.sql
--
-- Rollback is application-only: older code never reads the column.

SET lock_timeout = '5s';
ALTER TABLE midyaf."User" ADD COLUMN IF NOT EXISTS "tokenVersion" INTEGER NOT NULL DEFAULT 0;
