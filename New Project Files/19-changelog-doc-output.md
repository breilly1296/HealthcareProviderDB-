# VerifyMyProvider Changelog

**Format:** Inspired by [Keep a Changelog](https://keepachangelog.com). Dates in ISO 8601. We do not yet ship semver tags; this log is organized by release/milestone month.
**Note on sources:** early dates consolidate internal MEMORY.md notes and commit history. Git history was not available at generation time, so month-level granularity is used.

---

## [Unreleased]

### Planned
- OpenAPI / Swagger auto-generation.
- Cloud Armor / WAF in front of Cloud Run.
- Automated secret scanning (gitleaks) in PR gate.
- Multi-region Cloud Run deployment.
- Public status page.

---

## 2026-04 — Architecture Documentation Sprint

### Added
- Comprehensive documentation outputs under `New Project Files/` (this changelog, architecture doc, API reference, troubleshooting, known issues, deployment guide, dev workflow, data-quality tracker).
- `prompts/` directory now fully backs generated docs via Claude prompt library.

### Changed
- `prompts/16-architecture-doc.md` updated to `output_format: document` with explicit template.

---

## 2026-02 → 2026-04 — NPI Practice Re-Verification (Phase 5B) & Enrichment Protection (Phase 6)

### Added
- `data_source` column on `providers` and `practice_locations` (default `'nppes'`).
- `enriched_at`, `enrichment_source` columns on `practice_locations`.
- `import_conflicts` table: review queue with resolution workflow (`pending` / `keep_current` / `accept_incoming` / `manual`).
- `scripts/pre-import-check.ts` — pre-flight counts enriched rows, pending conflicts, and prompts before imports.
- `createPool()` helper exported from `pre-import-check.ts` centralizing pg Pool creation with Cloud SQL SSL fix.

### Changed
- `scripts/import-npi.ts`: Prisma upsert update uses explicit 24-field NPI allowlist (removed `...data` spread).
- `scripts/import-npi-direct.ts`: ON CONFLICT SET reduced to 11 NPPES-sourced columns.
- `scripts/enrich-providers-nppes.ts`: phone/fax only filled when NULL; conflicts logged to `import_conflicts`; new locations tagged `data_source='nppes'`.
- Prisma migration history baselined (4 legacy migrations marked applied in `_prisma_migrations`).

### Fixed
- 348,190 `practice_locations` rows backfilled to `data_source='enrichment'`.
- 2,552 practices re-verified across 15 specialties in 3 rounds; ~104 MEDIUM→HIGH upgrades.
- Identified 5 DNS-dead sites, 1 wrong website corrected, 4 closure/acquisition flags.
- pg v8 SSL incompatibility with Cloud SQL (`sslmode=require` → `verify-full` bug) worked around via programmatic SSL config.

### Data
- Verified hospital systems: Mount Sinai, NYU Langone, NYP, MSK, Montefiore, Northwell, NYC H+H, Maimonides, HSS, SUNY Downstate, One Brooklyn Health, Brooklyn Hospital Center, BronxCare.

---

## 2026-02 — NPI Provider URL Validation (Phase 5A)

### Added
- URL validation workflow across 15 specialty CSVs in `G:\My Drive\Projects\NPI\05-Enrichment\`.
- Search result artifacts (`C:\Users\breil\*-search-*.csv`).
- Tracking columns `provider_profile_url`, `profile_url_verified`, `profile_url_verified_at`.

### Findings
- MSK rate-limits `WebFetch` after ~100 requests — bulk validation unreliable.
- NYU Langone URLs need middle initials in slug (e.g. `ahmed-aslam` → `ahmed-f-aslam`).
- NYP URL failures were wrong practice-location slugs (0% pass), not wrong provider names.

### Pending
- Mount Sinai (3,042) and NYP (3,919) replacement searches.

---

## 2026-01 — Sybil Hardening & Operational Polish

### Added
- Tier 1 IP-based rate limiting with dual-mode Redis/in-memory implementation (`middleware/rateLimiter.ts`).
- Five pre-configured limiters: default 200/h, search 100/h, verify 10/h, vote 10/h, magic-link 5/15m.
- Google reCAPTCHA v3 on `/verify` submission and vote endpoints (server-side verification in `middleware/captcha.ts`).
- Honeypot field middleware (`middleware/honeypot.ts`) layered under reCAPTCHA.
- Admin endpoint expansion to 11 routes: cleanup (verifications, sessions, sync-logs), cache (clear, stats), expiration/retention/enrichment stats, confidence recalculation, encryption key rotation.
- Structured logging via `requestLogger.ts` and `httpLogger.ts` (pino, PII-free).
- Request ID correlation via `middleware/requestId.ts`.

### Changed
- Confidence scoring finalized as 4-factor: source 25 / recency 30 / agreement 25 / volume 20.
- `/api/v1/verify` now invalidates search cache on submission (async, non-blocking).

### Security
- CSRF protection (`csrf-csrf` double-submit) enabled on `/saved-providers` and `/me/insurance-card`.
- Strict Helmet CSP for JSON API (`default-src 'none'`).
- CORS allowlist enforced (prod, www, Cloud Run URL, FRONTEND_URL env).
- Timing-safe comparison for `X-Admin-Secret`.

---

## 2025-Q4 — Product Feature Additions

### Added
- Insurance plan import pipeline (`scripts/importInsurancePlans.ts`; carrier + plan extraction).
- Insurance card upload feature (`/me/insurance-card/*`): Claude OCR extraction, AES-256-GCM server-side encryption, key rotation.
- Provider comparison feature (max 4 side-by-side).
- Dark/light theme toggle on frontend.
- Practice `map` view with bounding-box query.
- Saved providers (per-user, requires auth).
- Magic-link authentication (Resend email + JWT cookies; no passwords).

### Changed
- Old `Location` model fully replaced by `practice_locations`; legacy enrichment admin routes retired.

---

## 2025-Q4 — Infrastructure

### Added
- Docker containerization (backend + frontend Dockerfiles; Node 20 alpine; non-root users; HEALTHCHECK; Next.js standalone output).
- `docker-compose.yml` (full stack) and `docker-compose.dev.yml` (DB only).
- GitHub Actions CI/CD → Cloud Run (`.github/workflows/deploy.yml`).
- Workload Identity Federation (keyless GCP auth from GH Actions).
- Staging pipeline (`.github/workflows/deploy-staging.yml`; staging branch; max 2 instances).
- Rollback workflow (`.github/workflows/rollback.yml`; manual dispatch, traffic-shift, re-smoke).
- PR test gate (`.github/workflows/test.yml`: audit, secret scan, jest).
- Playwright E2E (`.github/workflows/playwright.yml`).
- CodeQL and security scan workflows.
- GCP Secret Manager integration for 8 secrets (`DATABASE_URL`, `ADMIN_SECRET`, `RECAPTCHA_SECRET_KEY`, `JWT_SECRET`, `RESEND_API_KEY`, `INSURANCE_ENCRYPTION_KEY`, `CSRF_SECRET`, `ANTHROPIC_API_KEY`).

### Changed
- PostHog analytics integration — privacy-preserving config (`person_profiles: 'identified_only'`, no PII event props).

---

## 2025-Q3 — NPI Data Pipeline & Core Search

### Added
- NPI bulk import scripts (`scripts/import-npi.ts`, `import-npi-direct.ts`, `import-filtered-csv.ts`).
- `scripts/normalize-city-names.ts` — typo / trailing-state / trailing-punctuation fixes.
- `scripts/cleanup-deactivated-providers.ts` — mark + filter policy.
- `scripts/verify-data-quality.ts` / `check-import-status.ts` / `generate-dq-report.ts`.
- `scripts/backfill-specialty-fast.cjs` — taxonomy → specialty category backfill.
- Taxonomy reference table (`TaxonomyReference`).
- NPI imports for 6 pipeline-test states: FL, AL, AK, AR, AZ, CA (~2.1M providers).
- NY state NPI import, filtered to NYC 5-borough ZIP codes (~50–75k providers) — **launch dataset** for Q2 2026.

### Changed
- Schema enrichment: `ProviderCmsDetails`, `ProviderHospital`, `ProviderInsurance`, `ProviderMedicare`, `ProviderTaxonomy` added around the core `Provider`.

---

## 2025-Q2 — Initial Platform

### Added
- Initial Prisma schema (Provider, InsurancePlan, VerificationLog).
- Express backend bootstrap (`packages/backend/src/index.ts`), Prisma client setup.
- Provider search and provider detail endpoints (`/api/v1/providers/search`, `/:npi`).
- Plan search endpoints (`/api/v1/plans/...`).
- Verification submission + vote + stats endpoints (`/api/v1/verify/...`).
- Locations routes (`/api/v1/locations/...`) backed by `practice_locations` (not the old `Location` model).
- Next.js 14 App Router frontend scaffolding (`packages/frontend`).
- TanStack Query, Tailwind, `react-hot-toast`, Lucide icons.
- Shared TypeScript types package (`packages/shared`).
- Confidence score enrichment helper (`services/confidenceService.ts`).
- Central error handler and AppError class (`middleware/errorHandler.ts`).
- Request timeout middleware (general 30 s, search 15 s, admin 5 min).

---

## Format Notes

Future releases should add a dated section at the top following:
```
## YYYY-MM-DD — optional label

### Added / Changed / Deprecated / Removed / Fixed / Security
- Bullet with PR/commit reference when applicable.
```

Breaking changes should be called out with **BREAKING** inline. We don't version tag today, but once we do, `### Added` entries under `[Unreleased]` should roll into a version header on release.
