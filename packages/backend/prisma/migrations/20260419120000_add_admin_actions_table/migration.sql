-- CreateTable
CREATE TABLE IF NOT EXISTS "admin_actions" (
    "id" TEXT NOT NULL,
    "endpoint" VARCHAR(200) NOT NULL,
    "method" VARCHAR(10) NOT NULL,
    "params" JSONB,
    "source_ip" VARCHAR(50),
    "request_id" VARCHAR(100),
    "dry_run" BOOLEAN NOT NULL DEFAULT false,
    "result_count" INTEGER,
    "duration_ms" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),

    CONSTRAINT "admin_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_admin_actions_endpoint" ON "admin_actions"("endpoint");

-- CreateIndex
CREATE INDEX "idx_admin_actions_created_at" ON "admin_actions"("created_at");

-- CreateIndex
CREATE INDEX "idx_admin_actions_source_ip" ON "admin_actions"("source_ip");
