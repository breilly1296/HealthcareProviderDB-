# Known Issues — [Pending regeneration]

**Generated:** 2026-04-16
**Source prompt:** `prompts/20-known-issues-doc.md`
**Status:** ⚠️ Not regenerated this run — hit usage limit before agent could complete. Re-run prompt 20 after 8pm ET reset.

Until regenerated, the canonical source is `prompts/20-known-issues-doc.md` itself (populated per the Feb 2026 audit). Key known issues noted in memory + audit:
- Next.js SWC on Windows ARM64 + Node 24 — patched via postinstall
- OneDrive corruption of native .node binaries — mitigated with WASM fallback
- Locations API route disabled/reactivated pattern — currently active
- MSK WebFetch rate limit (~100 req) — affects NPI URL validation
- Prisma `db push` vs versioned migrations gap — see `48-database-migrations-output.md` (also pending)
