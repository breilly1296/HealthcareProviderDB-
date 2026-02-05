-- Migration: Replace PPA unique constraint with partial indexes for office-level tracking
--
-- This allows both NPI-level (legacy) and location-specific plan acceptance records.
--
-- Run AFTER `prisma db push` to apply the schema changes.
-- Usage: psql $DATABASE_URL -f scripts/migrate-ppa-unique-constraints.sql

-- Step 1: Drop old 2-column unique constraint
ALTER TABLE provider_plan_acceptance
  DROP CONSTRAINT IF EXISTS provider_plan_acceptance_npi_plan_id_key;

-- Step 2: Location-specific records: unique on (npi, plan_id, location_id)
CREATE UNIQUE INDEX IF NOT EXISTS idx_ppa_npi_plan_location
  ON provider_plan_acceptance (npi, plan_id, location_id)
  WHERE location_id IS NOT NULL;

-- Step 3: Legacy NPI-level records: unique on (npi, plan_id) where no location
CREATE UNIQUE INDEX IF NOT EXISTS idx_ppa_npi_plan_legacy
  ON provider_plan_acceptance (npi, plan_id)
  WHERE location_id IS NULL;

-- Verify
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'provider_plan_acceptance'
  AND indexname LIKE 'idx_ppa%'
ORDER BY indexname;
