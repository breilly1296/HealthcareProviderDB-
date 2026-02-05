-- ============================================================
-- Migration: Add crowdsource verification tables
-- Database: verifymyprovider (Google Cloud SQL PostgreSQL)
-- Date: 2026-02-05
--
-- Adds 5 tables + 3 enum types to restore the
-- crowdsource verification pipeline:
--
--   Tables:
--     1. insurance_plans        - Insurance plan reference data
--     2. provider_plan_acceptance - Provider <-> plan junction
--     3. verification_logs      - Crowdsource verification audit trail
--     4. vote_logs              - Vote deduplication (one per IP)
--     5. sync_logs              - Data import tracking
--
--   Enums:
--     - AcceptanceStatus        (ACCEPTED, NOT_ACCEPTED, PENDING, UNKNOWN)
--     - VerificationSource      (CMS_DATA, CARRIER_DATA, ... AUTOMATED)
--     - VerificationType        (PLAN_ACCEPTANCE, PROVIDER_INFO, ...)
--
--   Foreign keys reference: providers(npi)
--
-- Column naming matches Prisma's @map() conventions:
--   - Fields with @map("snake_case") → snake_case in DB
--   - Fields without @map → camelCase in DB (quoted)
-- ============================================================

BEGIN;

-- ============================================================
-- 1. ENUM TYPES
-- ============================================================

-- AcceptanceStatus: Referenced by Prisma schema for type safety
-- (Column uses VARCHAR(20) for flexibility, enum exists for schema consistency)
DO $$ BEGIN
  CREATE TYPE "AcceptanceStatus" AS ENUM (
    'ACCEPTED',
    'NOT_ACCEPTED',
    'PENDING',
    'UNKNOWN'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- VerificationSource: Used as column type in verification_logs
DO $$ BEGIN
  CREATE TYPE "VerificationSource" AS ENUM (
    'CMS_DATA',
    'CARRIER_DATA',
    'PROVIDER_PORTAL',
    'PHONE_CALL',
    'CROWDSOURCE',
    'AUTOMATED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- VerificationType: Used as column type in verification_logs
DO $$ BEGIN
  CREATE TYPE "VerificationType" AS ENUM (
    'PLAN_ACCEPTANCE',
    'PROVIDER_INFO',
    'CONTACT_INFO',
    'STATUS_CHANGE',
    'NEW_PLAN'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================
-- 2. insurance_plans
--    Insurance plan reference data from CMS and user uploads.
--    PK: plan_id (VARCHAR)
--
--    carrier_id and health_system_id columns are retained
--    for future use but have no FK constraints (those tables
--    are not yet in this database).
-- ============================================================

CREATE TABLE IF NOT EXISTS "insurance_plans" (
  "plan_id"              VARCHAR(50)   PRIMARY KEY,
  "plan_name"            VARCHAR(200),
  "issuer_name"          VARCHAR(200),
  "plan_type"            VARCHAR(20),
  "state"                VARCHAR(2),
  "carrier"              VARCHAR(100),
  "plan_variant"         VARCHAR(50),
  "raw_name"             VARCHAR(500),
  "source_health_system" VARCHAR(200),
  "provider_count"       INTEGER       NOT NULL DEFAULT 0,
  "carrier_id"           INTEGER,
  "health_system_id"     INTEGER,
  "created_at"           TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_insurance_plans_carrier"
  ON "insurance_plans" ("carrier");
CREATE INDEX IF NOT EXISTS "idx_insurance_plans_plan_variant"
  ON "insurance_plans" ("plan_variant");
CREATE INDEX IF NOT EXISTS "idx_insurance_plans_carrier_id"
  ON "insurance_plans" ("carrier_id");
CREATE INDEX IF NOT EXISTS "idx_insurance_plans_health_system_id"
  ON "insurance_plans" ("health_system_id");


-- ============================================================
-- 3. provider_plan_acceptance
--    Junction table linking providers to insurance plans.
--    Tracks acceptance status and confidence scoring.
--
--    TTL: expires_at = 6 months from last_verified
--    (Based on 12% annual provider network turnover)
--
--    FK: npi → providers(npi) ON DELETE SET NULL
--    FK: plan_id → insurance_plans(plan_id) ON DELETE SET NULL
-- ============================================================

CREATE TABLE IF NOT EXISTS "provider_plan_acceptance" (
  "id"                   SERIAL        PRIMARY KEY,
  "npi"                  VARCHAR(10)   REFERENCES "providers"("npi") ON DELETE SET NULL,
  "plan_id"              VARCHAR(50)   REFERENCES "insurance_plans"("plan_id") ON DELETE SET NULL,
  "acceptance_status"    VARCHAR(20)   NOT NULL DEFAULT 'UNKNOWN',
  "confidence_score"     INTEGER       NOT NULL DEFAULT 0,
  "last_verified"        TIMESTAMPTZ,
  "verification_count"   INTEGER       NOT NULL DEFAULT 0,
  "created_at"           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  "updated_at"           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  "expires_at"           TIMESTAMPTZ,

  CONSTRAINT "provider_plan_acceptance_npi_plan_id_key"
    UNIQUE ("npi", "plan_id")
);

CREATE INDEX IF NOT EXISTS "idx_ppa_acceptance_status"
  ON "provider_plan_acceptance" ("acceptance_status");
CREATE INDEX IF NOT EXISTS "idx_ppa_confidence_score"
  ON "provider_plan_acceptance" ("confidence_score");
CREATE INDEX IF NOT EXISTS "idx_ppa_last_verified"
  ON "provider_plan_acceptance" ("last_verified");
CREATE INDEX IF NOT EXISTS "idx_ppa_expires_at"
  ON "provider_plan_acceptance" ("expires_at");


-- ============================================================
-- 4. verification_logs
--    Audit trail for crowdsource verifications.
--    PK: id (TEXT, generated by app as CUID)
--
--    TTL: expires_at = 6 months from created_at
--
--    IMPORTANT: Column naming is mixed case!
--    - Columns WITH @map() in Prisma → snake_case
--      (provider_npi, plan_id, created_at, expires_at)
--    - Columns WITHOUT @map() in Prisma → camelCase quoted
--      (acceptanceId, verificationType, sourceIp, etc.)
--
--    FK: provider_npi → providers(npi) ON DELETE SET NULL
--    FK: plan_id → insurance_plans(plan_id) ON DELETE SET NULL
-- ============================================================

CREATE TABLE IF NOT EXISTS "verification_logs" (
  -- PK (CUID generated by application)
  "id"                     TEXT                 PRIMARY KEY,

  -- Foreign keys (snake_case - have @map)
  "provider_npi"           VARCHAR(10)          REFERENCES "providers"("npi") ON DELETE SET NULL,
  "plan_id"                VARCHAR(50)          REFERENCES "insurance_plans"("plan_id") ON DELETE SET NULL,

  -- Verification metadata (camelCase - no @map)
  "acceptanceId"           TEXT,
  "verificationType"       "VerificationType"   NOT NULL,
  "verificationSource"     "VerificationSource" NOT NULL,

  -- Before/after state (camelCase - no @map)
  "previousValue"          JSONB,
  "newValue"               JSONB,

  -- Source tracking (camelCase - no @map)
  "sourceIp"               VARCHAR(50),
  "userAgent"              VARCHAR(500),
  "submittedBy"            VARCHAR(200),

  -- Crowdsource voting (lowercase - naturally lowercase)
  "upvotes"                INTEGER              NOT NULL DEFAULT 0,
  "downvotes"              INTEGER              NOT NULL DEFAULT 0,

  -- Review status (camelCase - no @map)
  "isApproved"             BOOLEAN,
  "reviewedAt"             TIMESTAMPTZ,
  "reviewedBy"             TEXT,

  -- Additional context (lowercase - naturally lowercase)
  "notes"                  TEXT,
  "evidenceUrl"            VARCHAR(500),

  -- Timestamps (snake_case - have @map)
  "created_at"             TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
  "expires_at"             TIMESTAMPTZ
);

-- Standard lookup indexes
CREATE INDEX IF NOT EXISTS "idx_vl_provider_npi"
  ON "verification_logs" ("provider_npi");
CREATE INDEX IF NOT EXISTS "idx_vl_plan_id"
  ON "verification_logs" ("plan_id");
CREATE INDEX IF NOT EXISTS "idx_vl_verification_type"
  ON "verification_logs" ("verificationType");
CREATE INDEX IF NOT EXISTS "idx_vl_created_at"
  ON "verification_logs" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_vl_is_approved"
  ON "verification_logs" ("isApproved");
CREATE INDEX IF NOT EXISTS "idx_vl_expires_at"
  ON "verification_logs" ("expires_at");

-- Compound: provider activity timeline
CREATE INDEX IF NOT EXISTS "idx_vl_provider_created"
  ON "verification_logs" ("provider_npi", "created_at");

-- Sybil attack prevention: detect duplicate verifications from same IP
CREATE INDEX IF NOT EXISTS "idx_vl_sybil_ip"
  ON "verification_logs" ("provider_npi", "plan_id", "sourceIp", "created_at");

-- Sybil attack prevention: detect duplicate verifications from same email
CREATE INDEX IF NOT EXISTS "idx_vl_sybil_email"
  ON "verification_logs" ("provider_npi", "plan_id", "submittedBy", "created_at");


-- ============================================================
-- 5. vote_logs
--    Prevents duplicate voting from same IP address.
--    One vote per IP per verification (enforced by unique constraint).
--
--    FK: verification_id → verification_logs(id) ON DELETE CASCADE
--        (votes are deleted when their verification is deleted)
-- ============================================================

CREATE TABLE IF NOT EXISTS "vote_logs" (
  "id"                TEXT         PRIMARY KEY,
  "verification_id"   TEXT         NOT NULL
                                   REFERENCES "verification_logs"("id") ON DELETE CASCADE,
  "source_ip"         VARCHAR(50)  NOT NULL,
  "vote"              VARCHAR(10)  NOT NULL,
  "created_at"        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT "vote_logs_verification_id_source_ip_key"
    UNIQUE ("verification_id", "source_ip")
);

CREATE INDEX IF NOT EXISTS "idx_vote_logs_verification_id"
  ON "vote_logs" ("verification_id");
CREATE INDEX IF NOT EXISTS "idx_vote_logs_source_ip"
  ON "vote_logs" ("source_ip");


-- ============================================================
-- 6. sync_logs
--    Tracks data import runs with statistics.
--    Used by admin endpoints for monitoring import health.
-- ============================================================

CREATE TABLE IF NOT EXISTS "sync_logs" (
  "id"                  SERIAL       PRIMARY KEY,
  "sync_type"           VARCHAR(50),
  "state"               VARCHAR(2),
  "records_processed"   INTEGER      DEFAULT 0,
  "status"              VARCHAR(20),
  "error_message"       TEXT,
  "started_at"          TIMESTAMPTZ  DEFAULT NOW(),
  "completed_at"        TIMESTAMPTZ
);


COMMIT;

-- ============================================================
-- POST-MIGRATION STEPS:
--
-- 1. Run from packages/backend/:
--      npx prisma db pull
--      npx prisma generate
--
-- 2. The Prisma models will need renaming to match code:
--      insurance_plans         → InsurancePlan
--      provider_plan_acceptance → ProviderPlanAcceptance
--      verification_logs       → VerificationLog
--      vote_logs               → VoteLog
--      sync_logs               → SyncLog
--
-- 3. Re-enable disabled routes in:
--      src/routes/index.ts
--      src/services/index.ts
-- ============================================================
