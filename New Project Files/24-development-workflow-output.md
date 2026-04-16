# Development Workflow — [Pending regeneration]

**Generated:** 2026-04-16
**Source prompt:** `prompts/24-development-workflow.md`
**Status:** ⚠️ Not regenerated this run — hit usage limit before agent could complete. Re-run prompt 24 after 8pm ET reset.

Canonical source remains `prompts/24-development-workflow.md` (accurate per Feb 2026 audit). Short form:
- Monorepo: npm workspaces — `packages/{backend,frontend,shared}`.
- Local dev: `docker-compose -f docker-compose.dev.yml up -d` for Postgres, then `npm run dev` in each package.
- Branching: feature branches → PR to `main` → Cloud Run auto-deploy on merge.
- Tests: Jest for unit, Playwright for E2E (see `30-testing-strategy-output.md` and `49-testing-strategy-deep-dive-output.md`).
- Prisma: schema at `packages/backend/prisma/schema.prisma`; `npx prisma db push` in deploy pipeline (see `48-database-migrations-output.md`, pending).
