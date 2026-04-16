# Database Migration Strategy — [Pending regeneration]

**Generated:** 2026-04-16
**Source prompt:** `prompts/48-database-migrations.md`
**Status:** ⚠️ Not regenerated this run — hit usage limit before agent could complete. Re-run prompt 48 after 8pm ET reset.

Canonical source remains `prompts/48-database-migrations.md`. Known-state notes (from memory, not full audit):
- Prisma 5.x + PostgreSQL on Cloud SQL.
- Migration history **baselined** — 4 legacy migrations marked applied in `_prisma_migrations`.
- Deploy uses `prisma db push` (declarative) via Cloud SQL Auth Proxy in `.github/workflows/deploy.yml` — NOT `prisma migrate deploy`.
- Trade-off: simpler but no versioned SQL review. Risks on destructive changes to 348K-row `practice_locations` table.
- Enrichment columns (`data_source`, `enriched_at`) backfilled; `import_conflicts` review queue exists.
- No documented rollback procedure for failed migrations.

Re-run prompt 48 for full gap analysis + recommendations.
