-- OPS-COLLAB-001 additive schema. PREPARED, NOT APPLIED.
--
-- Task delegation/transfer (Task.responsibleUserId/delegateUserId and the
-- append-only TaskHandover history) and built-in messaging (Conversation,
-- ConversationParticipant, ConversationMessage). Purely additive: no DROP,
-- no data rewrite. Existing tasks keep NULL responsibility until someone
-- delegates or transfers them. Safe to re-run.
--
-- Apply after a concrete approval, over a DIRECT connection, BEFORE releasing
-- the application code that queries these objects:
--   psql "$DIRECT_DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/ops-collab-001-additive.sql

BEGIN;

SET LOCAL search_path TO midyaf;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $$
DECLARE
  missing text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'midyaf') THEN
    RAISE EXCEPTION 'OPS-COLLAB-001 preflight: schema midyaf does not exist';
  END IF;

  SELECT string_agg(t, ', ') INTO missing
  FROM unnest(ARRAY['Task', 'User']) AS t
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'midyaf' AND table_name = t
  );
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'OPS-COLLAB-001 preflight: missing tables: %', missing;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'midyaf' AND table_name = 'Task'
      AND column_name IN ('responsibleUserId', 'delegateUserId')
      AND (data_type <> 'text' OR is_nullable <> 'YES')
  ) THEN
    RAISE EXCEPTION 'OPS-COLLAB-001 preflight: Task responsibility columns exist with another shape';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'midyaf' AND t.typname = 'TaskHandoverKind'
  ) AND (
    SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder)
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'midyaf' AND t.typname = 'TaskHandoverKind'
  ) <> ARRAY['DELEGATE', 'TRANSFER', 'RETURN']::name[] THEN
    RAISE EXCEPTION 'OPS-COLLAB-001 preflight: TaskHandoverKind exists with other values';
  END IF;
END
$$;

-- Task responsibility -------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'midyaf' AND t.typname = 'TaskHandoverKind'
  ) THEN
    CREATE TYPE "TaskHandoverKind" AS ENUM ('DELEGATE', 'TRANSFER', 'RETURN');
  END IF;
END
$$;

ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "responsibleUserId" TEXT;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "delegateUserId" TEXT;

CREATE INDEX IF NOT EXISTS "Task_responsibleUserId_idx" ON "Task"("responsibleUserId");
CREATE INDEX IF NOT EXISTS "Task_delegateUserId_idx" ON "Task"("delegateUserId");

CREATE TABLE IF NOT EXISTS "TaskHandover" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "kind" "TaskHandoverKind" NOT NULL,
  "fromUserId" TEXT,
  "toUserId" TEXT,
  "actorUserId" TEXT NOT NULL,
  "reason" VARCHAR(500),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TaskHandover_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TaskHandover_taskId_createdAt_idx"
  ON "TaskHandover"("taskId", "createdAt");
CREATE INDEX IF NOT EXISTS "TaskHandover_toUserId_createdAt_idx"
  ON "TaskHandover"("toUserId", "createdAt");

-- Messaging -----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "Conversation" (
  "id" TEXT NOT NULL,
  "subject" VARCHAR(150) NOT NULL,
  "createdById" TEXT NOT NULL,
  "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ConversationParticipant" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "lastReadAt" TIMESTAMP(3),
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConversationParticipant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ConversationMessage" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "senderId" TEXT NOT NULL,
  "body" VARCHAR(5000) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConversationMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Conversation_lastMessageAt_idx"
  ON "Conversation"("lastMessageAt");
CREATE INDEX IF NOT EXISTS "ConversationParticipant_userId_idx"
  ON "ConversationParticipant"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "ConversationParticipant_conversationId_userId_key"
  ON "ConversationParticipant"("conversationId", "userId");
CREATE INDEX IF NOT EXISTS "ConversationMessage_conversationId_createdAt_idx"
  ON "ConversationMessage"("conversationId", "createdAt");

-- Foreign keys (named exactly as Prisma names them) -------------------------

DO $$
DECLARE
  fk record;
BEGIN
  FOR fk IN
    SELECT * FROM (VALUES
      ('Task', 'Task_responsibleUserId_fkey', 'responsibleUserId', 'User', 'SET NULL'),
      ('Task', 'Task_delegateUserId_fkey', 'delegateUserId', 'User', 'SET NULL'),
      ('TaskHandover', 'TaskHandover_taskId_fkey', 'taskId', 'Task', 'CASCADE'),
      ('TaskHandover', 'TaskHandover_fromUserId_fkey', 'fromUserId', 'User', 'SET NULL'),
      ('TaskHandover', 'TaskHandover_toUserId_fkey', 'toUserId', 'User', 'SET NULL'),
      ('TaskHandover', 'TaskHandover_actorUserId_fkey', 'actorUserId', 'User', 'CASCADE'),
      ('Conversation', 'Conversation_createdById_fkey', 'createdById', 'User', 'CASCADE'),
      ('ConversationParticipant', 'ConversationParticipant_conversationId_fkey', 'conversationId', 'Conversation', 'CASCADE'),
      ('ConversationParticipant', 'ConversationParticipant_userId_fkey', 'userId', 'User', 'CASCADE'),
      ('ConversationMessage', 'ConversationMessage_conversationId_fkey', 'conversationId', 'Conversation', 'CASCADE'),
      ('ConversationMessage', 'ConversationMessage_senderId_fkey', 'senderId', 'User', 'CASCADE')
    ) AS v(tbl, name, col, ref, on_delete)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = 'midyaf' AND c.conname = fk.name
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I("id") ON DELETE %s ON UPDATE CASCADE',
        fk.tbl, fk.name, fk.col, fk.ref, fk.on_delete
      );
    END IF;
  END LOOP;
END
$$;

-- Post-check ----------------------------------------------------------------

DO $$
BEGIN
  IF (
    SELECT count(*) FROM information_schema.tables
    WHERE table_schema = 'midyaf' AND table_name IN (
      'TaskHandover', 'Conversation', 'ConversationParticipant', 'ConversationMessage'
    )
  ) <> 4 THEN
    RAISE EXCEPTION 'OPS-COLLAB-001 post-check: tables incomplete';
  END IF;

  IF (
    SELECT count(*) FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE n.nspname = 'midyaf' AND c.contype = 'f' AND c.conname IN (
      'Task_responsibleUserId_fkey', 'Task_delegateUserId_fkey',
      'TaskHandover_taskId_fkey', 'TaskHandover_fromUserId_fkey',
      'TaskHandover_toUserId_fkey', 'TaskHandover_actorUserId_fkey',
      'Conversation_createdById_fkey',
      'ConversationParticipant_conversationId_fkey', 'ConversationParticipant_userId_fkey',
      'ConversationMessage_conversationId_fkey', 'ConversationMessage_senderId_fkey'
    )
  ) <> 11 THEN
    RAISE EXCEPTION 'OPS-COLLAB-001 post-check: foreign keys incomplete';
  END IF;
END
$$;

COMMIT;
