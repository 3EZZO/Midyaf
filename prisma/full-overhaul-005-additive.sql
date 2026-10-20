-- M5: additive enrollment, app invitations, messaging policy and replay metadata.
-- Enum extensions commit separately so PostgreSQL can use the new values safely.
-- Application-only rollback retains these objects; existing accounts/columns are unchanged.
BEGIN;
SET LOCAL search_path=midyaf,public;
SET LOCAL lock_timeout='5s';
ALTER TYPE "EventMemberRole" ADD VALUE IF NOT EXISTS 'EXECUTIVE_VIEWER';
ALTER TYPE "OnboardingDocumentKind" ADD VALUE IF NOT EXISTS 'LICENSE';
ALTER TYPE "OnboardingDocumentKind" ADD VALUE IF NOT EXISTS 'ACTIVITY_DOCUMENT';
COMMIT;
BEGIN;
SET LOCAL search_path=midyaf,public;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
CREATE TEMP TABLE overhaul_005_accounts ON COMMIT DROP AS
 SELECT count(*) AS n,md5(string_agg("id"||'|'||"email"||'|'||"role"::text||'|'||"passwordHash",E'\n' ORDER BY "id")) AS digest FROM "User";
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "onboardingPending" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "onboardingKind" "OnboardingKind";
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "messagingPolicy" JSONB;
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "dedupeKey" VARCHAR(191);
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "requestHash" VARCHAR(64);
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "clientVisible" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "executiveVisible" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ConversationMessage" ADD COLUMN IF NOT EXISTS "clientRequestId" VARCHAR(64);
CREATE UNIQUE INDEX IF NOT EXISTS "ConversationMessage_senderId_clientRequestId_key" ON "ConversationMessage"("senderId","clientRequestId");
CREATE UNIQUE INDEX IF NOT EXISTS "Conversation_dedupeKey_key" ON "Conversation"("dedupeKey");
CREATE TABLE IF NOT EXISTS "EventInvite" (
 "id" TEXT PRIMARY KEY,"eventId" TEXT NOT NULL,"email" VARCHAR(254) NOT NULL,"tokenHash" VARCHAR(64) NOT NULL,
 "role" "EventMemberRole" NOT NULL,"subteam" "EventSubteam","permissions" "EventPermission"[],"workScope" VARCHAR(2000),
 "clientVisible" BOOLEAN NOT NULL DEFAULT false,"canReceive" BOOLEAN NOT NULL DEFAULT true,"createdById" TEXT NOT NULL,
 "expiresAt" TIMESTAMP(3) NOT NULL,"acceptedAt" TIMESTAMP(3),"revokedAt" TIMESTAMP(3),"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "EventInvite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "EventInvite_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "EventInvite_bounds_check" CHECK ("tokenHash" ~ '^[a-f0-9]{64}$' AND "expiresAt">"createdAt" AND cardinality("permissions") BETWEEN 1 AND 4 AND 'VIEW'=ANY("permissions"))
);
CREATE UNIQUE INDEX IF NOT EXISTS "EventInvite_tokenHash_key" ON "EventInvite"("tokenHash");
CREATE INDEX IF NOT EXISTS "EventInvite_eventId_expiresAt_idx" ON "EventInvite"("eventId","expiresAt");
DO $$ BEGIN
 IF (SELECT count(*) FROM "User")<>(SELECT n FROM overhaul_005_accounts) OR
 (SELECT md5(string_agg("id"||'|'||"email"||'|'||"role"::text||'|'||"passwordHash",E'\n' ORDER BY "id")) FROM "User")<>(SELECT digest FROM overhaul_005_accounts)
 THEN RAISE EXCEPTION 'M5 original account preservation failed'; END IF;
END $$;
COMMIT;
