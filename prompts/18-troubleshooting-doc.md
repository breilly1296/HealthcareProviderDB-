---
tags:
  - documentation
  - operations
type: prompt
priority: 2
updated: 2026-02-05
---

# Troubleshooting Guide

## Purpose
Generate a troubleshooting guide for common issues encountered during development, deployment, and production operation of VerifyMyProvider.

## Known Issues to Document

### Development Environment
1. **Next.js SWC on Windows ARM64 + Node 24**
   - Error: "not a valid Win32 application" for SWC binaries
   - Fix: Postinstall script patches `next/dist/build/swc/index.js` to enable WASM fallback
   - File: `packages/frontend/scripts/patch-next-swc.js`

2. **OneDrive + node_modules corruption**
   - OneDrive file sync can corrupt native `.node` binaries
   - WASM fallbacks more reliable than native binaries on synced projects

3. **npm Workspaces hoisting conflicts**
   - NEVER put `next` in root `package.json` — overrides frontend workspace version
   - Only shared deps at root (prisma, csv-parse, pg)

### Database
4. **Prisma schema conventions**
   - `prisma db pull` generates lowercase model names — must rename to PascalCase with `@@map()`
   - Fields need `@map("snake_case")` for camelCase TypeScript access

5. **Cloud SQL connection**
   - Local: Direct connection via `DATABASE_URL` in `.env`
   - Cloud Run: Automatic via Cloud SQL proxy (unix socket)

### Deployment
6. **Locations route disabled**
   - `routes/locations.ts` commented out in `routes/index.ts`
   - Depends on old `Location` model — needs rewrite for `practice_locations`

7. **ADMIN_SECRET not configured**
   - Admin endpoints return 503 if `ADMIN_SECRET` env var not set
   - Intentional for environments where admin access not needed

## Questions to Ask
1. What are the most common issues developers encounter?
2. Are there any recurring production incidents?
3. What monitoring/alerting is in place for detecting issues?
4. Are there any database migration gotchas?
5. What is the process for investigating a reported data quality issue?

## Checklist
- [x] SWC ARM64 workaround documented (in MEMORY.md and patch script)
- [x] OneDrive workaround documented
- [x] npm workspace hoisting issue documented
- [ ] Production incident runbook
- [ ] Database migration troubleshooting
- [ ] Cloud Run scaling issues
- [ ] Rate limiting false positives
