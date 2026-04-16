---
tags:
  - database
  - prisma
  - migrations
type: prompt
priority: 2
updated: 2026-04-16
role: architect
output_format: analysis
---

# Database Migration Strategy

## Task

Review how schema changes are managed, applied, and rolled back in VerifyMyProvider. Identify risks in the current migration workflow and concrete improvements. This is **not** a schema review (see [[01-database-schema]]) — it's about the migration process itself.

## Files to Review

- `packages/backend/prisma/schema.prisma` — current schema
- `packages/backend/prisma/migrations/` — migration history
- `packages/backend/prisma/migrations/migration_lock.toml` — provider + lock state
- `.github/workflows/deploy.yml` — how migrations run during deploy (search for `prisma migrate` / `prisma db push`)
- `packages/backend/package.json` — migration-related scripts
- `scripts/pre-import-check.ts` — Cloud SQL SSL connection pattern (see root `CLAUDE.md` / memory notes)
- Any `README.md` or `CONTRIBUTING.md` that documents migration workflow

## Context

The project uses Prisma with PostgreSQL on Google Cloud SQL. Based on memory notes:
- Prisma migration history was **baselined** (4 old migrations marked as applied in `_prisma_migrations`)
- Deploy workflow uses `prisma db push` via Cloud SQL Auth Proxy (not `prisma migrate deploy`)
- 348K+ rows of production data exist; destructive changes are high-risk
- Tables touched by enrichment pipelines (`practice_locations`, `providers`, `import_conflicts`) have backfilled `data_source` columns

## Questions Claude should investigate

1. **`db push` vs `migrate deploy`:** Are schema changes applied via `prisma db push` (declarative, no migration history) or `prisma migrate deploy` (versioned)? What are the trade-offs given the baselined history?
2. **Migration review:** Is there a process for reviewing generated SQL before it runs in prod? Who approves?
3. **Destructive changes:** How is a column drop / rename / type-change handled? Is there a staging checkpoint?
4. **Long-running migrations:** How would a migration on a 348K-row table (e.g. adding a NOT NULL column with backfill) be handled without downtime?
5. **Rollback:** If a migration fails mid-deploy, what's the rollback path? Does Cloud Run's blue/green deploy help? Does it matter if old code can't read new schema?
6. **Local vs prod parity:** How do devs test migrations before they hit prod? Is there a staging DB?
7. **Data migrations:** For backfills (e.g. the `data_source = 'enrichment'` backfill mentioned in memory), are they in SQL migration files, standalone scripts, or ad-hoc?
8. **Seed data:** Is `prisma db seed` used? What's seeded (taxonomy_reference, insurance_plans)?
9. **Enrichment protection:** The `import_conflicts` table and `enriched_at` columns added in Phase 6 — are they durable against a future `db push` resetting them?
10. **Shadow DB:** Does Prisma's shadow database work against Cloud SQL? Or is it disabled?

## Response format

```markdown
# Migration Strategy Review — [date]

## Current Workflow
- Tool: [prisma migrate | prisma db push | other]
- Application: [CI/CD step, manual, etc.]
- Review process: [how changes are gated]
- Local testing: [how devs test]

## Risks (ranked)
1. **[CRITICAL]** [risk] — [impact] — [mitigation]
2. **[HIGH]** [risk] — [impact] — [mitigation]
...

## Patterns Observed
- [good patterns: e.g. baselined history, Cloud SQL Auth Proxy]
- [concerning patterns: e.g. `db push` without diff review]

## Recommendations
### Immediate
- [ ] [action] — [why]

### Next Sprint
- [ ] [action] — [why]

### Longer Term
- [ ] [e.g. migrate from `db push` to `migrate deploy` with a shadow DB]
```

## Checklist — known state

- [x] Prisma 5.x with PostgreSQL
- [x] Migration history baselined
- [x] Cloud SQL Auth Proxy used in CI/CD
- [x] Enrichment columns (`data_source`, `enriched_at`) added and backfilled
- [ ] Versioned migrations (`migrate deploy`) vs `db push` — verify current workflow
- [ ] Staging DB for pre-prod migration testing — verify
- [ ] Documented rollback procedure — verify
- [ ] Zero-downtime migration pattern documented
- [ ] Data-migration scripts tracked in version control alongside schema changes
