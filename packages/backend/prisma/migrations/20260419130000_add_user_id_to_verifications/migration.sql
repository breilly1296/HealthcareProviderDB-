-- Add user_id to verification_logs for authenticated-submitter tracking +
-- Sybil dedup (IM-44 / Sybil M1). Nullable so anonymous submissions still work.
ALTER TABLE "verification_logs" ADD COLUMN "user_id" VARCHAR(100);

CREATE INDEX "idx_vl_user_id" ON "verification_logs"("user_id");

-- Composite index backs the 30-day-window userId Sybil check (mirrors the
-- existing idx_vl_sybil_ip and idx_vl_sybil_email composites).
CREATE INDEX "idx_vl_sybil_user" ON "verification_logs"(
  "provider_npi", "plan_id", "user_id", "created_at"
);

-- Add user_id to vote_logs and create a per-user unique so a logged-in
-- attacker rotating IPs still only gets one vote per verification.
-- Postgres treats NULLs as distinct in UNIQUE constraints by default, so
-- multiple anonymous votes (user_id = NULL) on the same verification
-- still coexist — per-IP uniqueness remains the dedup for those.
ALTER TABLE "vote_logs" ADD COLUMN "user_id" VARCHAR(100);

CREATE UNIQUE INDEX "vote_logs_verification_id_user_id_key"
  ON "vote_logs"("verification_id", "user_id");

CREATE INDEX "idx_vote_logs_user_id" ON "vote_logs"("user_id");
