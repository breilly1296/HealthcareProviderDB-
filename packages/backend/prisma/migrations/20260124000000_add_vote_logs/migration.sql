-- CreateTable
CREATE TABLE "vote_logs" (
    "id" TEXT NOT NULL,
    "verification_id" TEXT NOT NULL,
    "source_ip" VARCHAR(50) NOT NULL,
    "vote" VARCHAR(10) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vote_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vote_logs_verification_id_idx" ON "vote_logs"("verification_id");

-- CreateIndex
CREATE INDEX "vote_logs_source_ip_idx" ON "vote_logs"("source_ip");

-- CreateIndex
CREATE UNIQUE INDEX "vote_logs_verification_id_source_ip_key" ON "vote_logs"("verification_id", "source_ip");

-- AddForeignKey
ALTER TABLE "vote_logs" ADD CONSTRAINT "vote_logs_verification_id_fkey" FOREIGN KEY ("verification_id") REFERENCES "verification_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
