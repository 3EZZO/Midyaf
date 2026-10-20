-- FULL-OVERHAUL-M2 additive schema (full-overhaul-002). PREPARED, NOT APPLIED.
--
-- Organizations and memberships, event workspace fields (operational status,
-- planning mode, scope counts/dates, plan approval, contract lock), event
-- memberships with subteams/permissions/receiver controls, versioned event
-- plans, scope-change log, onboarding (applications, transitions, private
-- bounded documents), the standardized guest roster with privacy grants,
-- classified messaging/task metadata, dispatch records, vehicles, trips with
-- passengers, flights, captain shifts and aggregate density samples.
--
-- Targets the CURRENT deployed schema (29 tables in midyaf). Purely additive:
-- no DROP, no TRUNCATE, no account changes, no type changes of existing
-- columns, no table rebuilds. New columns on existing tables are nullable or
-- carry a constant default (metadata-only in PostgreSQL 11+). The only data
-- written is the one-time backfill of the new Event."operationalStatus" from
-- the legacy status, in the same statement block that adds the column.
-- Safe to re-run: every object is created only when missing and every
-- pre-existing object is shape-checked first.
--
-- Codex applies it to an isolated Neon branch first, over a DIRECT
-- connection, BEFORE any application code that queries these objects:
--   psql "$DIRECT_DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/full-overhaul-002-additive.sql
--
-- Rollback is application-only (redeploy the prior release); the additive
-- objects stay and are ignored by the older code. See the M2 change report.

BEGIN;

SET LOCAL search_path = midyaf, public;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- Preflight -----------------------------------------------------------------

DO $$
DECLARE
  missing text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'midyaf') THEN
    RAISE EXCEPTION 'FULL-OVERHAUL-002 preflight: schema midyaf does not exist';
  END IF;

  -- The 29 tables of the current deployed schema must all be present.
  SELECT string_agg(t, ', ') INTO missing
  FROM unnest(ARRAY[
    'User', 'CityConfig', 'Event', 'Guest', 'HospitalityRider', 'Driver', 'Task',
    'TaskHandover', 'Supplier', 'Service', 'Booking', 'CommissionConfig',
    'Notification', 'AuditLog', 'Message', 'ActivityIntake', 'AiLogisticsPlan',
    'VendorQuote', 'SupplierRequestNote', 'VaultSession', 'VendorContract',
    'GuestJourneyRecord', 'CoordinatorRequest', 'CompanyReport', 'CaptainFeedback',
    'FileAsset', 'Conversation', 'ConversationParticipant', 'ConversationMessage'
  ]) AS t
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'midyaf' AND table_name = t AND table_type = 'BASE TABLE'
  );
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'FULL-OVERHAUL-002 preflight: missing baseline tables: %', missing;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'midyaf' AND t.typname = 'SupplierCategory'
  ) THEN
    RAISE EXCEPTION 'FULL-OVERHAUL-002 preflight: enum SupplierCategory is missing';
  END IF;

  -- Columns this script adds to existing tables must be absent or already in
  -- the expected shape (a previous run of this script).
  IF EXISTS (
    SELECT 1 FROM information_schema.columns c
    JOIN (VALUES
      ('Event', 'organizationId', 'text'),
      ('Event', 'operationalStatus', 'USER-DEFINED'),
      ('Event', 'planningMode', 'USER-DEFINED'),
      ('Event', 'locationLabel', 'character varying'),
      ('Event', 'hotelZone', 'character varying'),
      ('Event', 'vipGuestCount', 'integer'),
      ('Event', 'regularGuestCount', 'integer'),
      ('Event', 'carCount', 'integer'),
      ('Event', 'startAt', 'timestamp without time zone'),
      ('Event', 'endAt', 'timestamp without time zone'),
      ('Event', 'arrivalStartAt', 'timestamp without time zone'),
      ('Event', 'departureEndAt', 'timestamp without time zone'),
      ('Event', 'approvedPlanId', 'text'),
      ('Event', 'planApprovedAt', 'timestamp without time zone'),
      ('Event', 'contractSignedAt', 'timestamp without time zone'),
      ('Event', 'contractSignedById', 'text'),
      ('Task', 'source', 'USER-DEFINED'),
      ('Task', 'createdById', 'text'),
      ('Task', 'conversationId', 'text'),
      ('Conversation', 'eventId', 'text'),
      ('Conversation', 'messageClass', 'USER-DEFINED'),
      ('Conversation', 'dispatchFlow', 'USER-DEFINED')
    ) AS v(tbl, col, expected) ON c.table_name = v.tbl AND c.column_name = v.col
    WHERE c.table_schema = 'midyaf' AND c.data_type <> v.expected
  ) THEN
    RAISE EXCEPTION 'FULL-OVERHAUL-002 preflight: a new column already exists with another type';
  END IF;
END
$$;

-- Account baseline captured before any change and compared at the end.
CREATE TEMP TABLE full_overhaul_002_baseline ON COMMIT DROP AS
SELECT
  (SELECT count(*) FROM "User") AS users,
  (SELECT md5(coalesce(string_agg("id" || '|' || "email" || '|' || "role"::text || '|' || "passwordHash", E'\n' ORDER BY "id"), ''))
     FROM "User") AS user_digest,
  (SELECT count(*) FROM "Event") AS events;

-- Enums -----------------------------------------------------------------------

DO $$
DECLARE
  spec record;
  existing text[];
BEGIN
  FOR spec IN
    SELECT * FROM (VALUES
      ('OrganizationKind', ARRAY['ORGANIZER_COMPANY', 'VENDOR', 'CLIENT']),
      ('OrganizationRole', ARRAY['OWNER', 'ADMIN', 'MEMBER']),
      ('MembershipStatus', ARRAY['ACTIVE', 'REVOKED']),
      ('EventMemberRole', ARRAY['COORDINATOR', 'PROJECT_MANAGER', 'LOGISTICS_MANAGER', 'OPERATIONS_MANAGER', 'PRODUCTION_MANAGER', 'FLEET_SUPERVISOR', 'CAPTAIN', 'CLIENT_VIEWER', 'VENDOR']),
      ('EventSubteam', ARRAY['HOTELS', 'AIRPORT', 'VENUE', 'TRANSPORT']),
      ('EventPermission', ARRAY['VIEW', 'EDIT', 'INVITE', 'SCOPE']),
      ('OperationalStatus', ARRAY['PLANNING', 'ACTIVE', 'COMPLETED']),
      ('PlanningMode', ARRAY['MANUAL', 'AI']),
      ('EventPlanStatus', ARRAY['DRAFT', 'APPROVED', 'SUPERSEDED']),
      ('EventPlanSource', ARRAY['DETERMINISTIC_ADVISORY', 'AI_PROVIDER', 'MANUAL']),
      ('OnboardingKind', ARRAY['VENDOR', 'CLIENT']),
      ('OnboardingStatus', ARRAY['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'CONTRACT_SIGNED', 'ACTIVE']),
      ('OnboardingDocumentKind', ARRAY['COMMERCIAL_REGISTRATION', 'TAX_CERTIFICATE', 'IDENTITY', 'SIGNED_CONTRACT', 'OTHER']),
      ('MessageClass', ARRAY['INDIVIDUAL', 'GROUP', 'ALERT', 'INQUIRY', 'TASK']),
      ('TaskSource', ARRAY['CLIENT_TASK', 'LOGISTICS_TEAM_TASK']),
      ('DispatchFlow', ARRAY['GUEST_TO_LM', 'GUEST_TO_SUPERVISOR', 'GUEST_TO_CAPTAIN', 'ORGANIZER_TO_LM', 'LM_TO_SUPERVISOR', 'LM_TO_CAPTAIN_EMERGENCY']),
      ('VehicleStatus', ARRAY['AVAILABLE', 'ASSIGNED_TO_TASK', 'WAITING', 'OUT_OF_ZONE']),
      ('TripStatus', ARRAY['SCHEDULED', 'EN_ROUTE_TO_PICKUP', 'ON_BOARD', 'COMPLETED', 'CANCELLED']),
      ('EtaSource', ARRAY['PROVIDER', 'APPROXIMATE', 'UNAVAILABLE']),
      ('FlightScope', ARRAY['EVENT', 'GENERAL']),
      ('FlightStatus', ARRAY['SCHEDULED', 'DELAYED', 'LANDED', 'DEPARTED', 'CANCELLED']),
      ('ShiftStatus', ARRAY['SCHEDULED', 'ON_SHIFT', 'OFF_SHIFT'])
    ) AS v(name, labels)
  LOOP
    SELECT array_agg(e.enumlabel::text ORDER BY e.enumsortorder) INTO existing
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'midyaf' AND t.typname = spec.name;

    IF existing IS NULL THEN
      IF EXISTS (
        SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'midyaf' AND t.typname = spec.name
      ) THEN
        RAISE EXCEPTION 'FULL-OVERHAUL-002: type % exists but is not an enum', spec.name;
      END IF;
      EXECUTE format(
        'CREATE TYPE %I AS ENUM (%s)',
        spec.name,
        (SELECT string_agg(quote_literal(label), ', ') FROM unnest(spec.labels) AS label)
      );
    ELSIF existing <> spec.labels THEN
      RAISE EXCEPTION 'FULL-OVERHAUL-002: enum % exists with other values', spec.name;
    END IF;
  END LOOP;
END
$$;

-- Existing tables: new nullable/defaulted columns ----------------------------

DO $$
BEGIN
  -- Backfill operationalStatus from the legacy status only when the column
  -- is created by this run; a re-run never rewrites later values.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'midyaf' AND table_name = 'Event' AND column_name = 'operationalStatus'
  ) THEN
    ALTER TABLE "Event" ADD COLUMN "operationalStatus" "OperationalStatus" NOT NULL DEFAULT 'PLANNING';
    UPDATE "Event"
       SET "operationalStatus" = CASE "status"::text
         WHEN 'LIVE' THEN 'ACTIVE'::"OperationalStatus"
         WHEN 'COMPLETED' THEN 'COMPLETED'::"OperationalStatus"
         WHEN 'CANCELLED' THEN 'COMPLETED'::"OperationalStatus"
         ELSE 'PLANNING'::"OperationalStatus"
       END
     WHERE "status"::text IN ('LIVE', 'COMPLETED', 'CANCELLED');
  END IF;
END
$$;

ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "planningMode" "PlanningMode" NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "locationLabel" VARCHAR(200);
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "hotelZone" VARCHAR(120);
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "vipGuestCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "regularGuestCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "carCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "startAt" TIMESTAMP(3);
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "endAt" TIMESTAMP(3);
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "arrivalStartAt" TIMESTAMP(3);
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "departureEndAt" TIMESTAMP(3);
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "approvedPlanId" TEXT;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "planApprovedAt" TIMESTAMP(3);
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "contractSignedAt" TIMESTAMP(3);
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "contractSignedById" TEXT;

ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "source" "TaskSource";
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "createdById" TEXT;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "conversationId" TEXT;

ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "eventId" TEXT;
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "messageClass" "MessageClass" NOT NULL DEFAULT 'INDIVIDUAL';
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "dispatchFlow" "DispatchFlow";

-- New tables -----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "Organization" (
  "id" TEXT NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "slug" VARCHAR(80) NOT NULL,
  "kind" "OrganizationKind" NOT NULL,
  "vendorCategory" "SupplierCategory",
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "OrganizationMembership" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "OrganizationRole" NOT NULL DEFAULT 'MEMBER',
  "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
  "grantedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrganizationMembership_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EventMembership" (
  "workScope" VARCHAR(2000),
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "EventMemberRole" NOT NULL,
  "subteam" "EventSubteam",
  "permissions" "EventPermission"[] DEFAULT ARRAY['VIEW']::"EventPermission"[],
  "clientVisible" BOOLEAN NOT NULL DEFAULT false,
  "canReceive" BOOLEAN NOT NULL DEFAULT true,
  "available" BOOLEAN NOT NULL DEFAULT true,
  "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
  "grantedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EventMembership_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EventPlan" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "status" "EventPlanStatus" NOT NULL DEFAULT 'DRAFT',
  "source" "EventPlanSource" NOT NULL,
  "advisory" BOOLEAN NOT NULL DEFAULT true,
  "summary" VARCHAR(2000) NOT NULL,
  "content" JSONB NOT NULL,
  "generatedById" TEXT NOT NULL,
  "approvedById" TEXT,
  "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EventPlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EventScopeChange" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "changedFields" TEXT[],
  "beforeData" JSONB NOT NULL,
  "afterData" JSONB NOT NULL,
  "notifiedVendorCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventScopeChange_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "OnboardingApplication" (
  "id" TEXT NOT NULL,
  "kind" "OnboardingKind" NOT NULL,
  "status" "OnboardingStatus" NOT NULL DEFAULT 'SUBMITTED',
  "applicantUserId" TEXT NOT NULL,
  "organizationId" TEXT,
  "companyName" VARCHAR(160) NOT NULL,
  "registrationNumber" VARCHAR(60),
  "vendorCategory" "SupplierCategory",
  "contactName" VARCHAR(120) NOT NULL,
  "contactEmail" VARCHAR(254) NOT NULL,
  "contactPhone" VARCHAR(32) NOT NULL,
  "city" VARCHAR(80),
  "notes" VARCHAR(2000),
  "reviewerUserId" TEXT,
  "decisionNote" VARCHAR(1000),
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewStartedAt" TIMESTAMP(3),
  "decidedAt" TIMESTAMP(3),
  "contractSignedAt" TIMESTAMP(3),
  "contractSignedById" TEXT,
  "activatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OnboardingApplication_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "OnboardingTransition" (
  "id" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "fromStatus" "OnboardingStatus",
  "toStatus" "OnboardingStatus" NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "note" VARCHAR(1000),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OnboardingTransition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "OnboardingDocument" (
  "id" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "kind" "OnboardingDocumentKind" NOT NULL,
  "fileName" VARCHAR(160) NOT NULL,
  "mimeType" VARCHAR(100) NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "sha256" VARCHAR(64) NOT NULL,
  "content" BYTEA NOT NULL,
  "uploadedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OnboardingDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EventGuest" (
  "locationConsent" BOOLEAN NOT NULL DEFAULT false,
  "lastLat" DOUBLE PRECISION,
  "lastLng" DOUBLE PRECISION,
  "lastSeenAt" TIMESTAMP(3),
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "guestCode" VARCHAR(16) NOT NULL,
  "isVip" BOOLEAN NOT NULL DEFAULT false,
  "fullName" VARCHAR(160) NOT NULL,
  "contactPhone" VARCHAR(32),
  "contactEmail" VARCHAR(254),
  "roomType" VARCHAR(60),
  "hotelName" VARCHAR(160),
  "arrivalAt" TIMESTAMP(3),
  "departureAt" TIMESTAMP(3),
  "ticketNumber" VARCHAR(40),
  "originCity" VARCHAR(80),
  "arrivalCity" VARCHAR(80),
  "departureCity" VARCHAR(80),
  "privacyMasked" BOOLEAN NOT NULL DEFAULT false,
  "privacyGroup" VARCHAR(40),
  "guestId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EventGuest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "GuestPrivacyGrant" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "eventGuestId" TEXT,
  "groupKey" VARCHAR(40),
  "viewerUserId" TEXT NOT NULL,
  "grantedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GuestPrivacyGrant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DispatchRecord" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "flow" "DispatchFlow" NOT NULL,
  "senderUserId" TEXT NOT NULL,
  "senderEventRole" VARCHAR(40) NOT NULL,
  "recipientUserId" TEXT NOT NULL,
  "recipientCount" INTEGER NOT NULL DEFAULT 1,
  "supervisorUserId" TEXT,
  "conversationId" TEXT NOT NULL,
  "alertConversationId" TEXT,
  "taskId" TEXT,
  "emergency" BOOLEAN NOT NULL DEFAULT false,
  "clientRequestId" VARCHAR(64),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DispatchRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Vehicle" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "plateNumber" VARCHAR(20) NOT NULL,
  "label" VARCHAR(80) NOT NULL,
  "capacity" INTEGER NOT NULL DEFAULT 4,
  "status" "VehicleStatus" NOT NULL DEFAULT 'AVAILABLE',
  "driverId" TEXT,
  "lastLat" DOUBLE PRECISION,
  "lastLng" DOUBLE PRECISION,
  "lastSeenAt" TIMESTAMP(3),
  "inZone" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Trip" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "vehicleId" TEXT,
  "driverId" TEXT,
  "taskId" TEXT,
  "status" "TripStatus" NOT NULL DEFAULT 'SCHEDULED',
  "originLabel" VARCHAR(160) NOT NULL,
  "originLat" DOUBLE PRECISION,
  "originLng" DOUBLE PRECISION,
  "destinationLabel" VARCHAR(160) NOT NULL,
  "destinationLat" DOUBLE PRECISION,
  "destinationLng" DOUBLE PRECISION,
  "routePolyline" VARCHAR(20000),
  "inZone" BOOLEAN,
  "captainEtaMinutes" INTEGER,
  "destinationEtaMinutes" INTEGER,
  "etaSource" "EtaSource" NOT NULL DEFAULT 'UNAVAILABLE',
  "etaUpdatedAt" TIMESTAMP(3),
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TripPassenger" (
  "id" TEXT NOT NULL,
  "tripId" TEXT NOT NULL,
  "eventGuestId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TripPassenger_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Flight" (
  "id" TEXT NOT NULL,
  "scope" "FlightScope" NOT NULL,
  "eventId" TEXT,
  "flightNumber" VARCHAR(12) NOT NULL,
  "airline" VARCHAR(80),
  "originCode" VARCHAR(8) NOT NULL,
  "destinationCode" VARCHAR(8) NOT NULL,
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "estimatedAt" TIMESTAMP(3),
  "status" "FlightStatus" NOT NULL DEFAULT 'SCHEDULED',
  "dataSource" VARCHAR(20) NOT NULL DEFAULT 'MANUAL',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Flight_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CaptainShift" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "driverId" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "status" "ShiftStatus" NOT NULL DEFAULT 'SCHEDULED',
  "available" BOOLEAN NOT NULL DEFAULT true,
  "zoneLabel" VARCHAR(80),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CaptainShift_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DensitySample" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "zoneKey" VARCHAR(40) NOT NULL,
  "capturedAt" TIMESTAMP(3) NOT NULL,
  "headcount" INTEGER NOT NULL,
  "capacity" INTEGER,
  "source" VARCHAR(20) NOT NULL DEFAULT 'MANUAL',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DensitySample_pkey" PRIMARY KEY ("id")
);

-- Indexes (named exactly as Prisma names them) -------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS "Event_approvedPlanId_key" ON "Event"("approvedPlanId");
CREATE INDEX IF NOT EXISTS "Event_organizationId_operationalStatus_idx" ON "Event"("organizationId", "operationalStatus");
CREATE INDEX IF NOT EXISTS "Task_eventId_source_idx" ON "Task"("eventId", "source");
CREATE INDEX IF NOT EXISTS "Task_conversationId_idx" ON "Task"("conversationId");
CREATE INDEX IF NOT EXISTS "Conversation_eventId_messageClass_idx" ON "Conversation"("eventId", "messageClass");

CREATE UNIQUE INDEX IF NOT EXISTS "Organization_slug_key" ON "Organization"("slug");
CREATE INDEX IF NOT EXISTS "Organization_kind_idx" ON "Organization"("kind");
CREATE UNIQUE INDEX IF NOT EXISTS "OrganizationMembership_organizationId_userId_key" ON "OrganizationMembership"("organizationId", "userId");
CREATE INDEX IF NOT EXISTS "OrganizationMembership_userId_status_idx" ON "OrganizationMembership"("userId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "EventMembership_eventId_userId_key" ON "EventMembership"("eventId", "userId");
CREATE INDEX IF NOT EXISTS "EventMembership_userId_status_idx" ON "EventMembership"("userId", "status");
CREATE INDEX IF NOT EXISTS "EventMembership_eventId_role_status_idx" ON "EventMembership"("eventId", "role", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "EventPlan_eventId_version_key" ON "EventPlan"("eventId", "version");
CREATE INDEX IF NOT EXISTS "EventPlan_eventId_status_idx" ON "EventPlan"("eventId", "status");
CREATE INDEX IF NOT EXISTS "EventScopeChange_eventId_createdAt_idx" ON "EventScopeChange"("eventId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "OnboardingApplication_organizationId_key" ON "OnboardingApplication"("organizationId");
CREATE INDEX IF NOT EXISTS "OnboardingApplication_applicantUserId_kind_idx" ON "OnboardingApplication"("applicantUserId", "kind");
CREATE INDEX IF NOT EXISTS "OnboardingApplication_status_submittedAt_idx" ON "OnboardingApplication"("status", "submittedAt");
CREATE INDEX IF NOT EXISTS "OnboardingTransition_applicationId_createdAt_idx" ON "OnboardingTransition"("applicationId", "createdAt");
CREATE INDEX IF NOT EXISTS "OnboardingDocument_applicationId_createdAt_idx" ON "OnboardingDocument"("applicationId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "EventGuest_guestId_key" ON "EventGuest"("guestId");
CREATE UNIQUE INDEX IF NOT EXISTS "EventGuest_eventId_guestCode_key" ON "EventGuest"("eventId", "guestCode");
CREATE INDEX IF NOT EXISTS "EventGuest_eventId_privacyGroup_idx" ON "EventGuest"("eventId", "privacyGroup");
CREATE UNIQUE INDEX IF NOT EXISTS "GuestPrivacyGrant_eventGuestId_viewerUserId_key" ON "GuestPrivacyGrant"("eventGuestId", "viewerUserId");
CREATE UNIQUE INDEX IF NOT EXISTS "GuestPrivacyGrant_eventId_groupKey_viewerUserId_key" ON "GuestPrivacyGrant"("eventId", "groupKey", "viewerUserId");
CREATE INDEX IF NOT EXISTS "GuestPrivacyGrant_viewerUserId_idx" ON "GuestPrivacyGrant"("viewerUserId");
CREATE UNIQUE INDEX IF NOT EXISTS "DispatchRecord_taskId_key" ON "DispatchRecord"("taskId");
CREATE UNIQUE INDEX IF NOT EXISTS "DispatchRecord_senderUserId_clientRequestId_key" ON "DispatchRecord"("senderUserId", "clientRequestId");
CREATE INDEX IF NOT EXISTS "DispatchRecord_eventId_createdAt_idx" ON "DispatchRecord"("eventId", "createdAt");
CREATE INDEX IF NOT EXISTS "DispatchRecord_flow_idx" ON "DispatchRecord"("flow");
CREATE UNIQUE INDEX IF NOT EXISTS "Vehicle_eventId_plateNumber_key" ON "Vehicle"("eventId", "plateNumber");
CREATE INDEX IF NOT EXISTS "Vehicle_eventId_status_idx" ON "Vehicle"("eventId", "status");
CREATE INDEX IF NOT EXISTS "Vehicle_driverId_idx" ON "Vehicle"("driverId");
CREATE UNIQUE INDEX IF NOT EXISTS "Trip_taskId_key" ON "Trip"("taskId");
CREATE INDEX IF NOT EXISTS "Trip_eventId_status_idx" ON "Trip"("eventId", "status");
CREATE INDEX IF NOT EXISTS "Trip_driverId_status_idx" ON "Trip"("driverId", "status");
CREATE INDEX IF NOT EXISTS "Trip_vehicleId_idx" ON "Trip"("vehicleId");
CREATE UNIQUE INDEX IF NOT EXISTS "TripPassenger_tripId_eventGuestId_key" ON "TripPassenger"("tripId", "eventGuestId");
CREATE INDEX IF NOT EXISTS "TripPassenger_eventGuestId_idx" ON "TripPassenger"("eventGuestId");
CREATE INDEX IF NOT EXISTS "Flight_eventId_scheduledAt_idx" ON "Flight"("eventId", "scheduledAt");
CREATE INDEX IF NOT EXISTS "Flight_scope_scheduledAt_idx" ON "Flight"("scope", "scheduledAt");
CREATE INDEX IF NOT EXISTS "CaptainShift_eventId_startsAt_idx" ON "CaptainShift"("eventId", "startsAt");
CREATE INDEX IF NOT EXISTS "CaptainShift_driverId_startsAt_idx" ON "CaptainShift"("driverId", "startsAt");
CREATE INDEX IF NOT EXISTS "DensitySample_eventId_zoneKey_capturedAt_idx" ON "DensitySample"("eventId", "zoneKey", "capturedAt");

-- Foreign keys (named exactly as Prisma names them) --------------------------

DO $$
DECLARE
  fk record;
BEGIN
  FOR fk IN
    SELECT * FROM (VALUES
      ('Event', 'Event_organizationId_fkey', 'organizationId', 'Organization', 'RESTRICT'),
      ('Event', 'Event_approvedPlanId_fkey', 'approvedPlanId', 'EventPlan', 'SET NULL'),
      ('Event', 'Event_contractSignedById_fkey', 'contractSignedById', 'User', 'SET NULL'),
      ('Task', 'Task_createdById_fkey', 'createdById', 'User', 'SET NULL'),
      ('Task', 'Task_conversationId_fkey', 'conversationId', 'Conversation', 'SET NULL'),
      ('Conversation', 'Conversation_eventId_fkey', 'eventId', 'Event', 'SET NULL'),
      ('Organization', 'Organization_createdById_fkey', 'createdById', 'User', 'SET NULL'),
      ('OrganizationMembership', 'OrganizationMembership_organizationId_fkey', 'organizationId', 'Organization', 'CASCADE'),
      ('OrganizationMembership', 'OrganizationMembership_userId_fkey', 'userId', 'User', 'CASCADE'),
      ('OrganizationMembership', 'OrganizationMembership_grantedById_fkey', 'grantedById', 'User', 'SET NULL'),
      ('EventMembership', 'EventMembership_eventId_fkey', 'eventId', 'Event', 'CASCADE'),
      ('EventMembership', 'EventMembership_userId_fkey', 'userId', 'User', 'CASCADE'),
      ('EventMembership', 'EventMembership_grantedById_fkey', 'grantedById', 'User', 'SET NULL'),
      ('EventPlan', 'EventPlan_eventId_fkey', 'eventId', 'Event', 'CASCADE'),
      ('EventPlan', 'EventPlan_generatedById_fkey', 'generatedById', 'User', 'RESTRICT'),
      ('EventPlan', 'EventPlan_approvedById_fkey', 'approvedById', 'User', 'SET NULL'),
      ('EventScopeChange', 'EventScopeChange_eventId_fkey', 'eventId', 'Event', 'CASCADE'),
      ('EventScopeChange', 'EventScopeChange_actorUserId_fkey', 'actorUserId', 'User', 'RESTRICT'),
      ('OnboardingApplication', 'OnboardingApplication_applicantUserId_fkey', 'applicantUserId', 'User', 'RESTRICT'),
      ('OnboardingApplication', 'OnboardingApplication_reviewerUserId_fkey', 'reviewerUserId', 'User', 'SET NULL'),
      ('OnboardingApplication', 'OnboardingApplication_contractSignedById_fkey', 'contractSignedById', 'User', 'SET NULL'),
      ('OnboardingApplication', 'OnboardingApplication_organizationId_fkey', 'organizationId', 'Organization', 'SET NULL'),
      ('OnboardingTransition', 'OnboardingTransition_applicationId_fkey', 'applicationId', 'OnboardingApplication', 'CASCADE'),
      ('OnboardingTransition', 'OnboardingTransition_actorUserId_fkey', 'actorUserId', 'User', 'RESTRICT'),
      ('OnboardingDocument', 'OnboardingDocument_applicationId_fkey', 'applicationId', 'OnboardingApplication', 'CASCADE'),
      ('OnboardingDocument', 'OnboardingDocument_uploadedById_fkey', 'uploadedById', 'User', 'RESTRICT'),
      ('EventGuest', 'EventGuest_eventId_fkey', 'eventId', 'Event', 'CASCADE'),
      ('EventGuest', 'EventGuest_guestId_fkey', 'guestId', 'Guest', 'SET NULL'),
      ('GuestPrivacyGrant', 'GuestPrivacyGrant_eventId_fkey', 'eventId', 'Event', 'CASCADE'),
      ('GuestPrivacyGrant', 'GuestPrivacyGrant_eventGuestId_fkey', 'eventGuestId', 'EventGuest', 'CASCADE'),
      ('GuestPrivacyGrant', 'GuestPrivacyGrant_viewerUserId_fkey', 'viewerUserId', 'User', 'CASCADE'),
      ('GuestPrivacyGrant', 'GuestPrivacyGrant_grantedById_fkey', 'grantedById', 'User', 'RESTRICT'),
      ('DispatchRecord', 'DispatchRecord_eventId_fkey', 'eventId', 'Event', 'CASCADE'),
      ('DispatchRecord', 'DispatchRecord_senderUserId_fkey', 'senderUserId', 'User', 'RESTRICT'),
      ('DispatchRecord', 'DispatchRecord_recipientUserId_fkey', 'recipientUserId', 'User', 'RESTRICT'),
      ('DispatchRecord', 'DispatchRecord_supervisorUserId_fkey', 'supervisorUserId', 'User', 'SET NULL'),
      ('DispatchRecord', 'DispatchRecord_conversationId_fkey', 'conversationId', 'Conversation', 'CASCADE'),
      ('DispatchRecord', 'DispatchRecord_alertConversationId_fkey', 'alertConversationId', 'Conversation', 'SET NULL'),
      ('DispatchRecord', 'DispatchRecord_taskId_fkey', 'taskId', 'Task', 'SET NULL'),
      ('Vehicle', 'Vehicle_eventId_fkey', 'eventId', 'Event', 'CASCADE'),
      ('Vehicle', 'Vehicle_driverId_fkey', 'driverId', 'Driver', 'SET NULL'),
      ('Trip', 'Trip_eventId_fkey', 'eventId', 'Event', 'CASCADE'),
      ('Trip', 'Trip_vehicleId_fkey', 'vehicleId', 'Vehicle', 'SET NULL'),
      ('Trip', 'Trip_driverId_fkey', 'driverId', 'Driver', 'SET NULL'),
      ('Trip', 'Trip_taskId_fkey', 'taskId', 'Task', 'SET NULL'),
      ('TripPassenger', 'TripPassenger_tripId_fkey', 'tripId', 'Trip', 'CASCADE'),
      ('TripPassenger', 'TripPassenger_eventGuestId_fkey', 'eventGuestId', 'EventGuest', 'CASCADE'),
      ('Flight', 'Flight_eventId_fkey', 'eventId', 'Event', 'CASCADE'),
      ('CaptainShift', 'CaptainShift_eventId_fkey', 'eventId', 'Event', 'CASCADE'),
      ('CaptainShift', 'CaptainShift_driverId_fkey', 'driverId', 'Driver', 'CASCADE'),
      ('DensitySample', 'DensitySample_eventId_fkey', 'eventId', 'Event', 'CASCADE')
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

-- Embedded checks (not represented in Prisma; enforced by the database) ------

DO $$
DECLARE
  ck record;
BEGIN
  FOR ck IN
    SELECT * FROM (VALUES
      ('Event', 'Event_m2_counts_check',
        '"vipGuestCount" >= 0 AND "regularGuestCount" >= 0 AND "carCount" >= 0'),
      ('Event', 'Event_m2_dates_check',
        '("startAt" IS NULL OR "endAt" IS NULL OR "endAt" >= "startAt")'),
      ('EventMembership', 'EventMembership_permissions_check',
        '"permissions" IS NOT NULL AND cardinality("permissions") BETWEEN 1 AND 4 AND ''VIEW'' = ANY("permissions")'),
      ('EventPlan', 'EventPlan_version_check', '"version" >= 1'),
      ('EventPlan', 'EventPlan_approval_check',
        '("status" <> ''APPROVED'' OR "approvedAt" IS NOT NULL)'),
      ('OnboardingApplication', 'OnboardingApplication_vendor_category_check',
        '("kind" <> ''VENDOR'' OR "vendorCategory" IS NOT NULL)'),
      ('OnboardingDocument', 'OnboardingDocument_bounds_check',
        '"sizeBytes" BETWEEN 1 AND 1048576 AND octet_length("content") = "sizeBytes"'),
      ('OnboardingDocument', 'OnboardingDocument_type_check',
        '"mimeType" IN (''application/pdf'', ''image/png'', ''image/jpeg'') AND "sha256" ~ ''^[a-f0-9]{64}$'''),
      ('EventGuest', 'EventGuest_code_check',
        '"guestCode" ~ ''^GV?[0-9]{2,4}$'' AND "isVip" = ("guestCode" LIKE ''GV%'')'),
      ('GuestPrivacyGrant', 'GuestPrivacyGrant_target_check',
        'num_nonnulls("eventGuestId", "groupKey") = 1'),
      ('DispatchRecord', 'DispatchRecord_recipients_check',
        '"recipientCount" BETWEEN 1 AND 10'),
      ('DispatchRecord', 'DispatchRecord_emergency_check',
        '"emergency" = ("flow" = ''LM_TO_CAPTAIN_EMERGENCY'')'),
      ('Vehicle', 'Vehicle_bounds_check',
        '"capacity" BETWEEN 1 AND 100 AND ("lastLat" IS NULL OR "lastLat" BETWEEN -90 AND 90) AND ("lastLng" IS NULL OR "lastLng" BETWEEN -180 AND 180)'),
      ('Trip', 'Trip_eta_check',
        '("captainEtaMinutes" IS NULL OR "captainEtaMinutes" BETWEEN 0 AND 1440) AND ("destinationEtaMinutes" IS NULL OR "destinationEtaMinutes" BETWEEN 0 AND 1440) AND ("etaSource" <> ''UNAVAILABLE'' OR ("captainEtaMinutes" IS NULL AND "destinationEtaMinutes" IS NULL))'),
      ('Flight', 'Flight_scope_check',
        '("scope" = ''EVENT'') = ("eventId" IS NOT NULL)'),
      ('CaptainShift', 'CaptainShift_window_check', '"endsAt" > "startsAt"'),
      ('DensitySample', 'DensitySample_bounds_check',
        '"headcount" >= 0 AND ("capacity" IS NULL OR "capacity" > 0)')
    ) AS v(tbl, name, expr)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = 'midyaf' AND c.conname = ck.name
    ) THEN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK (%s)', ck.tbl, ck.name, ck.expr);
    END IF;
  END LOOP;
END
$$;

-- Post-check -------------------------------------------------------------------

DO $$
DECLARE
  baseline record;
  digest text;
BEGIN
  IF (
    SELECT count(*) FROM information_schema.tables
    WHERE table_schema = 'midyaf' AND table_type = 'BASE TABLE' AND table_name IN (
      'Organization', 'OrganizationMembership', 'EventMembership', 'EventPlan',
      'EventScopeChange', 'OnboardingApplication', 'OnboardingTransition',
      'OnboardingDocument', 'EventGuest', 'GuestPrivacyGrant', 'DispatchRecord',
      'Vehicle', 'Trip', 'TripPassenger', 'Flight', 'CaptainShift', 'DensitySample'
    )
  ) <> 17 THEN
    RAISE EXCEPTION 'FULL-OVERHAUL-002 post-check: new tables incomplete';
  END IF;

  IF (
    SELECT count(*) FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE n.nspname = 'midyaf' AND c.contype = 'f' AND c.conname IN (
      'Event_organizationId_fkey', 'Event_approvedPlanId_fkey', 'Event_contractSignedById_fkey',
      'Task_createdById_fkey', 'Task_conversationId_fkey', 'Conversation_eventId_fkey',
      'Organization_createdById_fkey', 'OrganizationMembership_organizationId_fkey',
      'OrganizationMembership_userId_fkey', 'OrganizationMembership_grantedById_fkey',
      'EventMembership_eventId_fkey', 'EventMembership_userId_fkey', 'EventMembership_grantedById_fkey',
      'EventPlan_eventId_fkey', 'EventPlan_generatedById_fkey', 'EventPlan_approvedById_fkey',
      'EventScopeChange_eventId_fkey', 'EventScopeChange_actorUserId_fkey',
      'OnboardingApplication_applicantUserId_fkey', 'OnboardingApplication_reviewerUserId_fkey',
      'OnboardingApplication_contractSignedById_fkey', 'OnboardingApplication_organizationId_fkey',
      'OnboardingTransition_applicationId_fkey', 'OnboardingTransition_actorUserId_fkey',
      'OnboardingDocument_applicationId_fkey', 'OnboardingDocument_uploadedById_fkey',
      'EventGuest_eventId_fkey', 'EventGuest_guestId_fkey',
      'GuestPrivacyGrant_eventId_fkey', 'GuestPrivacyGrant_eventGuestId_fkey',
      'GuestPrivacyGrant_viewerUserId_fkey', 'GuestPrivacyGrant_grantedById_fkey',
      'DispatchRecord_eventId_fkey', 'DispatchRecord_senderUserId_fkey', 'DispatchRecord_recipientUserId_fkey',
      'DispatchRecord_supervisorUserId_fkey', 'DispatchRecord_conversationId_fkey',
      'DispatchRecord_alertConversationId_fkey', 'DispatchRecord_taskId_fkey',
      'Vehicle_eventId_fkey', 'Vehicle_driverId_fkey',
      'Trip_eventId_fkey', 'Trip_vehicleId_fkey', 'Trip_driverId_fkey', 'Trip_taskId_fkey',
      'TripPassenger_tripId_fkey', 'TripPassenger_eventGuestId_fkey',
      'Flight_eventId_fkey', 'CaptainShift_eventId_fkey', 'CaptainShift_driverId_fkey',
      'DensitySample_eventId_fkey'
    )
  ) <> 51 THEN
    RAISE EXCEPTION 'FULL-OVERHAUL-002 post-check: foreign keys incomplete';
  END IF;

  IF (
    SELECT count(*) FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE n.nspname = 'midyaf' AND c.contype = 'c' AND c.conname IN (
      'Event_m2_counts_check', 'Event_m2_dates_check', 'EventMembership_permissions_check',
      'EventPlan_version_check', 'EventPlan_approval_check',
      'OnboardingApplication_vendor_category_check', 'OnboardingDocument_bounds_check',
      'OnboardingDocument_type_check', 'EventGuest_code_check', 'GuestPrivacyGrant_target_check',
      'DispatchRecord_recipients_check', 'DispatchRecord_emergency_check', 'Vehicle_bounds_check',
      'Trip_eta_check', 'Flight_scope_check', 'CaptainShift_window_check', 'DensitySample_bounds_check'
    )
  ) <> 17 THEN
    RAISE EXCEPTION 'FULL-OVERHAUL-002 post-check: check constraints incomplete';
  END IF;

  -- Accounts and events are untouched; legacy events stay organization-less.
  SELECT * INTO baseline FROM full_overhaul_002_baseline;
  SELECT md5(coalesce(string_agg("id" || '|' || "email" || '|' || "role"::text || '|' || "passwordHash", E'\n' ORDER BY "id"), ''))
    INTO digest FROM "User";
  IF (SELECT count(*) FROM "User") <> baseline.users OR digest <> baseline.user_digest THEN
    RAISE EXCEPTION 'FULL-OVERHAUL-002 post-check: account rows changed';
  END IF;
  IF (SELECT count(*) FROM "Event") <> baseline.events THEN
    RAISE EXCEPTION 'FULL-OVERHAUL-002 post-check: event row count changed';
  END IF;
END
$$;

COMMIT;
