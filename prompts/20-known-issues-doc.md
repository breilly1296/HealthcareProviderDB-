---
tags:
  - documentation
  - issues
type: prompt
priority: 2
updated: 2026-02-05
---

# Known Issues Document

## Purpose
Document known issues, limitations, and workarounds in VerifyMyProvider.

## Files to Review
- `packages/backend/src/routes/index.ts` (disabled routes)
- `packages/backend/src/routes/admin.ts` (disabled location enrichment)
- `packages/frontend/scripts/patch-next-swc.js` (SWC workaround)
- `packages/backend/prisma/schema.prisma` (schema limitations)
- `packages/frontend/src/app/location/` (non-functional page)

## Known Issues

### Architecture
1. ~~**Locations route disabled**~~ **RESOLVED** — `routes/locations.ts` is registered and active in `routes/index.ts`. Frontend `/location/[locationId]` page connects to working API endpoints.

2. **Location enrichment disabled** — Admin endpoints for location enrichment commented out in `admin.ts`. Depends on old Location model.

3. ~~**No staging environment**~~ **RESOLVED** — Staging pipeline exists (`.github/workflows/deploy-staging.yml`), triggers on `staging` branch, deploys to `-staging` Cloud Run services with max 2 instances.

### Development
4. **Next.js SWC on Windows ARM64** — Native SWC binaries incompatible with Node.js v24+ on Windows ARM64. Workaround: postinstall script patches SWC to use WASM fallback.

5. **OneDrive + node_modules** — OneDrive file sync corrupts native `.node` binaries. Workaround: WASM fallbacks.

6. **npm workspace hoisting** — `next` must NOT be in root `package.json` (causes version conflicts).

### Data
7. **NPI data partially imported** — Only 6 states imported (FL, AL, AK, AR, AZ, CA, ~2.1M providers). 44 states + territories remaining.

8. **City name quality** — Typos, trailing state codes, and trailing punctuation in city names from NPI data. Cleanup script exists but not yet run across all data.

9. **Provider addresses stale** — NPI data is self-reported and rarely updated. Some providers show outdated addresses.

### Security
10. **No automated secret scanning** — No gitleaks or truffleHog in CI pipeline.

11. **No Cloud Armor / DDoS protection** — Cloud Run services are publicly accessible without WAF.

12. **`.env.example` incomplete** — Missing CAPTCHA settings, ADMIN_SECRET, REDIS_URL, ANTHROPIC_API_KEY, PostHog variables.

### Frontend
13. **No offline support** — No service worker or PWA manifest.

14. **No full accessibility audit** — Focus trap exists for modals but full keyboard navigation and screen reader testing not done.

## Questions to Ask
1. Which issues should be prioritized for the next sprint?
2. Are any of these issues blocking user-facing features?
3. Should we add a public-facing status page?
4. Are there any issues discovered in production that aren't listed here?
5. Should we track these in GitHub Issues instead?

## Checklist
- [x] Architecture issues documented
- [x] Development environment issues documented
- [x] Data quality issues documented
- [x] Security gaps documented
- [x] Frontend limitations documented
- [ ] Severity/priority assigned to each issue
- [ ] GitHub Issues created for tracking
- [ ] Workarounds documented for all issues
