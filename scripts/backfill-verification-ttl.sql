-- ============================================================================
-- Backfill TTL (expires_at) for Verification Tables
-- ============================================================================
-- Based on research showing 12% annual provider turnover, verifications
-- expire after 6 months from their last verification/creation date.
--
-- Usage:
--   psql $DATABASE_URL -f scripts/backfill-verification-ttl.sql
--
-- Or run via pg client:
--   npx tsx -e "require('dotenv/config'); const {Pool} = require('pg'); ..."
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. Backfill provider_plan_acceptance.expires_at
-- ============================================================================
-- Set expires_at = last_verified + 6 months
-- For records without last_verified, use created_at + 6 months

SELECT 'Backfilling provider_plan_acceptance.expires_at...' AS status;

-- Count records to update
SELECT
    COUNT(*) AS total_records,
    COUNT(last_verified) AS with_last_verified,
    COUNT(*) - COUNT(last_verified) AS without_last_verified,
    COUNT(expires_at) AS already_has_expires_at
FROM provider_plan_acceptance;

-- Update records that have last_verified
UPDATE provider_plan_acceptance
SET expires_at = last_verified + INTERVAL '6 months'
WHERE last_verified IS NOT NULL
  AND expires_at IS NULL;

-- Update records without last_verified (use created_at)
UPDATE provider_plan_acceptance
SET expires_at = created_at + INTERVAL '6 months'
WHERE last_verified IS NULL
  AND expires_at IS NULL;

SELECT 'provider_plan_acceptance backfill complete' AS status;

-- Verify
SELECT
    COUNT(*) AS total_records,
    COUNT(expires_at) AS with_expires_at,
    MIN(expires_at) AS earliest_expiry,
    MAX(expires_at) AS latest_expiry
FROM provider_plan_acceptance;

-- ============================================================================
-- 2. Backfill verification_logs.expires_at
-- ============================================================================
-- Set expires_at = created_at + 6 months

SELECT 'Backfilling verification_logs.expires_at...' AS status;

-- Count records to update
SELECT
    COUNT(*) AS total_records,
    COUNT(expires_at) AS already_has_expires_at
FROM verification_logs;

-- Update all records
UPDATE verification_logs
SET expires_at = created_at + INTERVAL '6 months'
WHERE expires_at IS NULL;

SELECT 'verification_logs backfill complete' AS status;

-- Verify
SELECT
    COUNT(*) AS total_records,
    COUNT(expires_at) AS with_expires_at,
    MIN(expires_at) AS earliest_expiry,
    MAX(expires_at) AS latest_expiry
FROM verification_logs;

-- ============================================================================
-- 3. Summary Statistics
-- ============================================================================

SELECT 'BACKFILL SUMMARY' AS section;

SELECT
    'provider_plan_acceptance' AS table_name,
    COUNT(*) AS total_records,
    COUNT(expires_at) AS records_with_ttl,
    COUNT(*) FILTER (WHERE expires_at < NOW()) AS already_expired,
    COUNT(*) FILTER (WHERE expires_at >= NOW() AND expires_at < NOW() + INTERVAL '1 month') AS expiring_within_1_month,
    COUNT(*) FILTER (WHERE expires_at >= NOW() + INTERVAL '1 month' AND expires_at < NOW() + INTERVAL '3 months') AS expiring_1_to_3_months,
    COUNT(*) FILTER (WHERE expires_at >= NOW() + INTERVAL '3 months') AS expiring_after_3_months
FROM provider_plan_acceptance

UNION ALL

SELECT
    'verification_logs' AS table_name,
    COUNT(*) AS total_records,
    COUNT(expires_at) AS records_with_ttl,
    COUNT(*) FILTER (WHERE expires_at < NOW()) AS already_expired,
    COUNT(*) FILTER (WHERE expires_at >= NOW() AND expires_at < NOW() + INTERVAL '1 month') AS expiring_within_1_month,
    COUNT(*) FILTER (WHERE expires_at >= NOW() + INTERVAL '1 month' AND expires_at < NOW() + INTERVAL '3 months') AS expiring_1_to_3_months,
    COUNT(*) FILTER (WHERE expires_at >= NOW() + INTERVAL '3 months') AS expiring_after_3_months
FROM verification_logs;

COMMIT;

SELECT 'TTL backfill completed successfully!' AS result;
