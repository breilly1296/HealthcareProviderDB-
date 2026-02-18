-- AlterTable
ALTER TABLE "practice_locations" ADD COLUMN     "data_source" VARCHAR(30) DEFAULT 'nppes',
ADD COLUMN     "enriched_at" TIMESTAMPTZ(6),
ADD COLUMN     "enrichment_source" VARCHAR(100);

-- AlterTable
ALTER TABLE "providers" ADD COLUMN     "data_source" VARCHAR(30) DEFAULT 'nppes';

-- Backfill practice_locations that have enrichment data
UPDATE practice_locations SET data_source = 'enrichment', enriched_at = NOW()
WHERE latitude IS NOT NULL OR address_hash IS NOT NULL;
