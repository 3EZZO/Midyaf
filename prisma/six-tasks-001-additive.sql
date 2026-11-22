-- SIX-TASKS-001 additive schema. PREPARED; apply to a Neon BRANCH first.
--
-- Adds the CLIENT value to the Role enum so an activated client applicant is
-- no longer given the organizing-company role (COMPANY_ORGANIZER). Nothing
-- else changes: no table, column, row or account is touched. Existing users
-- keep their roles. Safe to re-run (IF NOT EXISTS).
--
-- Plan editing (#4), the client approval queue (#1) and the investor demo
-- (#6) need no schema change: edits live in EventPlan.content (JSON), the demo
-- origin travels in the signed session token, and resets are audit-logged.
--
--   psql "$DIRECT_DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/six-tasks-001-additive.sql
--
-- Rollback is application-only: older code never reads the new value.
-- ALTER TYPE ... ADD VALUE cannot run inside a transaction block that later
-- uses the value, so this file has no BEGIN/COMMIT.

SET lock_timeout = '5s';
ALTER TYPE midyaf."Role" ADD VALUE IF NOT EXISTS 'CLIENT';
