# VerifyMyProvider Known Issues

**Last Updated:** 2026-02-06

---

## Issue Summary

| # | Category | Severity | Status | Issue |
|---|----------|----------|--------|-------|
| 1 | Architecture | Low | RESOLVED | Locations route disabled |
| 2 | Architecture | Low | Open | Location enrichment admin endpoints disabled |
| 3 | Architecture | Medium | RESOLVED | No staging environment |
| 4 | Development | Medium | Mitigated | Next.js SWC on Windows ARM64 |
| 5 | Development | Low | Mitigated | OneDrive + node_modules corruption |
| 6 | Development | Medium | Documented | npm workspace hoisting conflicts |
| 7 | Data | High | Open | NPI data partially imported (6/50 states) |
| 8 | Data | Medium | Open | City name quality issues |
| 9 | Data | Medium | Open | Provider addresses stale |
| 10 | Security | Medium | Open | No automated secret scanning |
| 11 | Security | Medium | Open | No Cloud Armor / DDoS protection |
| 12 | Security | Low | Open | `.env.example` incomplete |
| 13 | Frontend | Low | Open | No offline support |
| 14 | Frontend | Medium | Open | No full accessibility audit |
| 15 | Operations | Medium | Open | No automated confidence score recalculation |
| 16 | Operations | Low | Open | No uptime monitoring or alerting |
| 17 | API | Low | Open | Rate limiter response format inconsistency |

---

## Architecture Issues

### 1. ~~Locations Route Disabled~~ -- RESOLVED

**Status:** RESOLVED

**Evidence:** The `routes/index.ts` file at `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\routes\index.ts` confirms all routes are registered and active:

```typescript
router.use('/providers', providersRouter);
router.use('/plans', plansRouter);
router.use('/verify', verifyRouter);
router.use('/locations', locationsRouter);  // ACTIVE
router.use('/admin', adminRouter);
```

The locations router (`routes/locations.ts`) defines 5 working endpoints using the `practice_locations` table (not the old Location model). The frontend location page exists at `packages/frontend/src/app/location/[locationId]/page.tsx` and connects to these API endpoints.

---

### 2. Location Enrichment Admin Endpoints Disabled

**Status:** Open
**Severity:** Low
**Category:** Architecture

**Description:** Admin endpoints for location enrichment are not fully implemented in `admin.ts`. The `getEnrichmentStats` endpoint exists and works (line 245-256 of admin.ts), but there are no admin endpoints for triggering location enrichment operations (e.g., geocoding, facility matching).

**Impact:** Location data relies entirely on what is imported from NPI CSV files. No automated enrichment of location data with additional sources.

**Workaround:** None needed for MVP. Location data from NPI imports provides addresses and basic provider counts.

**Source File:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\routes\admin.ts`

---

### 3. ~~No Staging Environment~~ -- RESOLVED

**Status:** RESOLVED

**Evidence:** Staging pipeline exists at `.github/workflows/deploy-staging.yml`. Triggers on pushes to the `staging` branch. Deploys to Cloud Run services with `-staging` suffix and max 2 instances (vs 10 in production). Uses the same Cloud SQL instance (shared database).

**Source File:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\.github\workflows\deploy-staging.yml`

---

## Development Issues

### 4. Next.js SWC on Windows ARM64

**Status:** Mitigated (automated workaround in place)
**Severity:** Medium
**Category:** Development

**Description:** Native SWC binaries for Next.js 14.x are incompatible with Node.js v24+ on Windows ARM64. The error "not a valid Win32 application" occurs because Next.js 14.x only auto-enables WASM fallback for a hardcoded list of platforms, and `win32-arm64` is not included.

**Workaround:** Postinstall script at `packages/frontend/scripts/patch-next-swc.js` automatically patches `next/dist/build/swc/index.js` to:
1. Add `"aarch64-pc-windows-msvc"` to `knownDefaultWasmFallbackTriples`
2. Remove the `useWasmBinary` gate so unsupported platforms auto-fallback to WASM

The script checks both the local workspace `node_modules` and the hoisted root `node_modules` location.

**Permanent Fix:** Upgrade to Next.js 15+ when ARM64 Windows support is native, or wait for the Next.js team to add `win32-arm64` to the WASM fallback list.

**Source File:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\frontend\scripts\patch-next-swc.js`

---

### 5. OneDrive + node_modules Corruption

**Status:** Mitigated
**Severity:** Low
**Category:** Development

**Description:** OneDrive file sync can corrupt native `.node` binary modules when syncing the `node_modules` directory. This affects any native binary module, not just SWC.

**Workaround:** WASM fallbacks are more reliable than native binaries on OneDrive-synced projects. The SWC WASM patch (issue #4) addresses the most critical case.

**Permanent Fix:** Either exclude `node_modules` from OneDrive sync or move the project directory outside of OneDrive-synced folders.

---

### 6. npm Workspace Hoisting Conflicts

**Status:** Documented (requires developer awareness)
**Severity:** Medium
**Category:** Development

**Description:** `next` must NOT be in the root `package.json`. If placed at root, npm hoists it and overrides the frontend workspace version, causing SWC version mismatches and build failures.

**Rule:** Only shared dependencies belong at root (`@prisma/client`, `csv-parse`, `pg`). Package-specific dependencies (`next`, `react`, `express`, etc.) must stay in their respective `packages/*/package.json` files.

**Detection:** If you see unexpected version numbers for `next` in `node_modules/.package-lock.json` or build errors mentioning SWC version mismatches, check the root `package.json` for accidental `next` dependency.

---

## Data Issues

### 7. NPI Data Partially Imported

**Status:** Open
**Severity:** High (blocks national coverage)
**Category:** Data

**Description:** Only 6 of 50 states have been imported from the NPPES bulk download:

| State | Providers | Status |
|-------|-----------|--------|
| FL | 613,875 | Imported |
| CA | 1,113,464 | Imported |
| AZ | 167,899 | Imported |
| AL | 90,572 | Imported |
| AR | 82,527 | Imported |
| AK | 34,701 | Imported |
| **Total** | **~2,103,038** | |

**Remaining:** 44 states + DC + territories (~7M additional providers estimated). Estimated import time: ~70 hours.

**Impact:** The platform only has provider data for 6 states. Users searching for providers in non-imported states will find no results.

**Next Steps:** Complete remaining state imports using `scripts/import-npi-direct.ts`. Each state requires a state-specific CSV file from the NPPES Data Dissemination.

**Source:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\scripts\import-npi-direct.ts`

---

### 8. City Name Quality

**Status:** Open
**Severity:** Medium
**Category:** Data

**Description:** NPI data contains inconsistent city names including:
- Typos: "Birmingam" vs "Birmingham"
- Trailing state codes: "Birmingham,al"
- Trailing punctuation
- Neighborhood names used as city names: "Brooklyn" instead of "New York"
- Multiple spaces, mixed case

**Impact:** City dropdown filters may show duplicate or incorrect entries. Search results may miss providers due to city name variations.

**Workaround:** A comprehensive normalization script exists at `scripts/normalize-city-names.ts` covering 6 major metros (NYC, LA, Chicago, Houston, Phoenix, Philadelphia) with hundreds of neighborhood-to-city mappings and common typo corrections. Supports dry run mode, state-specific filtering, and transactional application.

**Next Steps:** Run normalization script for already-imported states, then expand coverage as more states are imported.

**Source:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\scripts\normalize-city-names.ts`

---

### 9. Provider Addresses Stale

**Status:** Open (inherent to NPI data)
**Severity:** Medium
**Category:** Data

**Description:** NPI data is self-reported by providers and rarely updated. Providers frequently list outdated practice addresses. Testing confirmed specific cases where a provider showed an old address in the NPI data.

**Impact:** Users may encounter incorrect addresses when looking up providers. Organization linking by address is unreliable (skipped for MVP).

**Mitigation:**
- The platform displays a disclaimer about data accuracy
- "Always call to confirm" messaging is part of the product strategy
- Future: FHIR API enrichment can provide more current address data
- The confidence scoring system accounts for data freshness via the recency factor

---

## Security Issues

### 10. No Automated Secret Scanning

**Status:** Open
**Severity:** Medium
**Category:** Security

**Description:** No gitleaks, truffleHog, or similar secret scanning tool is integrated into the CI pipeline. Secrets could accidentally be committed to the repository.

**Current Protections:**
- `.env` files are in `.gitignore`
- Secrets are stored in Google Secret Manager for production
- ADMIN_SECRET uses timing-safe comparison

**Recommendation:** Add gitleaks to the GitHub Actions CI pipeline. Example:
```yaml
- name: Scan for secrets
  uses: gitleaks/gitleaks-action@v2
```

---

### 11. No Cloud Armor / DDoS Protection

**Status:** Open
**Severity:** Medium
**Category:** Security

**Description:** Cloud Run services are publicly accessible without a Web Application Firewall (WAF). While rate limiting is implemented at the application level, there is no infrastructure-level DDoS protection.

**Current Protections:**
- Application-level rate limiting (IP-based, dual-mode Redis/in-memory)
- reCAPTCHA v3 on write endpoints
- Honeypot bot detection
- 100KB request body size limit
- Helmet security headers

**Recommendation:** Enable Google Cloud Armor in front of Cloud Run services when traffic increases or before public launch. Cloud Armor provides DDoS protection, IP allowlisting/blocklisting, and geographic restrictions.

---

### 12. `.env.example` Incomplete

**Status:** Open
**Severity:** Low
**Category:** Security / Developer Experience

**Description:** The `.env.example` file (if it exists) is missing documentation for several environment variables:
- `RECAPTCHA_SECRET_KEY` -- reCAPTCHA v3 secret
- `CAPTCHA_FAIL_MODE` -- open/closed
- `ADMIN_SECRET` -- Admin endpoint authentication
- `REDIS_URL` -- Distributed rate limiting
- `ANTHROPIC_API_KEY` -- Insurance card OCR (frontend)
- `NEXT_PUBLIC_POSTHOG_KEY` -- PostHog analytics (frontend)
- `FRONTEND_URL` -- CORS configuration

**Impact:** New developers may not configure all required environment variables, leading to degraded functionality without clear error messages.

**Recommendation:** Create or update `.env.example` in `packages/backend/` with all variables documented with comments explaining their purpose and whether they are required or optional.

---

## Frontend Issues

### 13. No Offline Support

**Status:** Open
**Severity:** Low
**Category:** Frontend

**Description:** No service worker or PWA manifest is configured. The application requires an active internet connection for all functionality.

**Impact:** Users cannot access previously viewed provider data when offline. This is a low priority given the application's nature (real-time data lookup).

**Recommendation:** Defer until post-beta. If implemented, cache recently viewed provider detail pages using a service worker with a stale-while-revalidate strategy.

---

### 14. No Full Accessibility Audit

**Status:** Open
**Severity:** Medium
**Category:** Frontend

**Description:** While focus traps exist for modals, a comprehensive accessibility audit has not been performed. Specific gaps may include:
- Keyboard navigation across all interactive elements
- Screen reader compatibility (ARIA labels, roles, live regions)
- Color contrast in both light and dark themes
- Form input labeling and error announcement

**Current Accessibility Features:**
- Focus trap for modals (confirmed in codebase)
- Semantic HTML structure
- TailwindCSS responsive design

**Recommendation:** Run automated accessibility testing (axe-core, Lighthouse) and manual screen reader testing before beta launch. Consider adding Playwright accessibility tests to the CI pipeline.

---

## Operations Issues

### 15. No Automated Confidence Score Recalculation

**Status:** Open
**Severity:** Medium
**Category:** Operations

**Description:** Confidence scores include a time-based recency factor (30 points max) that should decay as verifications age. However, scores are only calculated when a new verification is submitted. There is no automated scheduled recalculation.

**Impact:** Confidence scores become increasingly inaccurate over time. A 6-month-old verification with a high recency score will not automatically decrease.

**Workaround:** Manual recalculation via admin endpoint:
```bash
curl -X POST "https://backend/api/v1/admin/recalculate-confidence" \
  -H "X-Admin-Secret: your-secret"
```

**Recommendation:** Set up a Google Cloud Scheduler job to call the recalculate-confidence endpoint daily. The endpoint supports `dryRun` for testing and `limit` for incremental processing.

**Source:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\services\confidenceDecayService.ts`

---

### 16. No Uptime Monitoring or Alerting

**Status:** Open
**Severity:** Low
**Category:** Operations

**Description:** No external uptime monitoring (Pingdom, UptimeRobot) or alerting (PagerDuty, Opsgenie, Slack notifications) is configured. No error tracking service (Sentry) is integrated.

**Current Monitoring:**
- `/health` endpoint for manual checks and CI smoke tests
- Structured Pino logging (viewable in Cloud Run logs)
- PostHog for frontend analytics

**Recommendation:** Before beta launch:
1. Set up external uptime monitoring for the `/health` endpoint
2. Configure Cloud Run alerting for error rates and latency
3. Consider adding Sentry for error tracking with source maps

---

### 17. Rate Limiter Response Format Inconsistency

**Status:** Open
**Severity:** Low
**Category:** API

**Description:** When a rate limit is exceeded, the response format differs from the standard error format used by the rest of the API.

**Rate limiter response:**
```json
{
  "error": "Too many requests",
  "message": "Too many search requests. Please try again in 1 hour.",
  "retryAfter": 3600
}
```

**Standard API error response:**
```json
{
  "error": {
    "message": "...",
    "code": "...",
    "statusCode": 429,
    "requestId": "uuid"
  }
}
```

**Impact:** API consumers need to handle two different error formats. The rate limiter response lacks `code`, `statusCode`, and `requestId` fields.

**Recommendation:** Update the rate limiter to use the `AppError.tooManyRequests()` factory method or align the response format manually.

**Source:** `C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB\packages\backend\src\middleware\rateLimiter.ts` (lines 165-170 for in-memory, lines 264-269 for Redis)

---

## Checklist Status

- [x] Architecture issues documented (3 issues, 2 resolved)
- [x] Development environment issues documented (3 issues, all mitigated/documented)
- [x] Data quality issues documented (3 issues)
- [x] Security gaps documented (3 issues)
- [x] Frontend limitations documented (2 issues)
- [x] Operations issues documented (3 issues, newly identified)
- [x] Severity assigned to each issue
- [x] Workarounds documented for all issues
- [ ] GitHub Issues created for tracking
- [ ] Priority ordering finalized with product owner

---

## Answers to Prompt Questions

1. **Which issues should be prioritized for the next sprint?**
   - **Highest priority:** Issue #7 (NPI data import completion) -- blocks all non-imported state coverage and is the most impactful for user value.
   - **High priority:** Issue #15 (automated confidence recalculation) -- straightforward Cloud Scheduler setup that prevents data quality degradation.
   - **Medium priority:** Issue #8 (city name normalization) -- run existing script for imported states to improve search quality.
   - **Medium priority:** Issue #10 (secret scanning) -- quick CI pipeline addition for security hygiene.

2. **Are any of these issues blocking user-facing features?**
   - Issue #7 (partial NPI import) directly blocks national provider search coverage.
   - Issue #8 (city names) degrades search quality in imported states.
   - All other issues are either resolved, mitigated, or non-blocking for the initial beta.

3. **Should we add a public-facing status page?**
   - Recommended for beta launch. A simple status page showing service health (backend, database, cache) and data coverage (which states have data) would build user trust. Could be a static page powered by the `/health` endpoint.

4. **Are there any issues discovered in production that aren't listed here?**
   - The project is pre-beta, so no production incidents have occurred yet. The issues above are identified from codebase analysis. Once the beta launches, a production incident log should be maintained.

5. **Should we track these in GitHub Issues instead?**
   - Yes, recommended. Each issue above should be converted to a GitHub Issue with:
     - Labels: `bug`, `enhancement`, `security`, `data-quality`, `devex`
     - Priority labels: `P0-critical`, `P1-high`, `P2-medium`, `P3-low`
     - Milestone: mapped to Q1/Q2/Q3 2026 milestones
   - This document can serve as the source of truth for bulk issue creation.
