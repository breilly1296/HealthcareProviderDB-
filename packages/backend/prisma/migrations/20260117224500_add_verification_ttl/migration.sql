-- Add TTL (Time To Live) fields to verification tables
-- Based on research showing 12% annual provider turnover, verifications expire after 6 months

-- Add expires_at column to provider_plan_acceptance
ALTER TABLE "provider_plan_acceptance" ADD COLUMN IF NOT EXISTS "expires_at" TIMESTAMP(3);

-- Add expires_at column to verification_logs
ALTER TABLE "verification_logs" ADD COLUMN IF NOT EXISTS "expires_at" TIMESTAMP(3);

-- Create index on expires_at for provider_plan_acceptance (for efficient TTL queries)
CREATE INDEX IF NOT EXISTS "provider_plan_acceptance_expires_at_idx" ON "provider_plan_acceptance"("expires_at");

-- Create index on expires_at for verification_logs (for efficient TTL queries)
CREATE INDEX IF NOT EXISTS "verification_logs_expires_at_idx" ON "verification_logs"("expires_at");

-- Create compound index on verification_logs for provider lookup with time ordering
CREATE INDEX IF NOT EXISTS "verification_logs_provider_npi_created_at_idx" ON "verification_logs"("provider_npi", "created_at");
