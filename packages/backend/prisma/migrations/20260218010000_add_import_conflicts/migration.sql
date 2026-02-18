-- CreateTable
CREATE TABLE IF NOT EXISTS "import_conflicts" (
    "id" SERIAL NOT NULL,
    "npi" VARCHAR(10) NOT NULL,
    "table_name" VARCHAR(50) NOT NULL,
    "field_name" VARCHAR(50) NOT NULL,
    "current_value" TEXT,
    "incoming_value" TEXT,
    "current_source" VARCHAR(30),
    "incoming_source" VARCHAR(30),
    "resolution" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "resolved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),

    CONSTRAINT "import_conflicts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_conflicts_npi" ON "import_conflicts"("npi");

-- CreateIndex
CREATE INDEX "idx_conflicts_resolution" ON "import_conflicts"("resolution");
