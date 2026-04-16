# Environment & Secrets Review — 2026-04-16

## Scope

Inventory every environment variable referenced in backend, frontend, scripts,
and CI/CD; check `.env.example` completeness, confirm production storage,
assess rotation story, and flag any hardcoded secret or missing guardrail.

## Complete Inventory

### Required — Must be set in production

| Variable | Where Used | File:Line | Production Source |
|----------|------------|-----------|-------------------|
| `DATABASE_URL` | Prisma client, scripts | `packages/backend/src/lib/prisma.ts:9` | Secret Manager `DATABASE_URL:latest` (deploy.yml:151) |
| `JWT_SECRET` | Token signing | `packages/backend/src/services/authService.ts` | Secret Manager `JWT_SECRET:latest` (deploy.yml:154) |
| `RESEND_API_KEY` | Magic-link emails | `packages/backend/src/services/authService.ts:20` | Secret Manager `RESEND_API_KEY:latest` (deploy.yml:155) |
| `CSRF_SECRET` | CSRF double-submit cookies | `packages/backend/src/middleware/csrf.ts` | Secret Manager `CSRF_SECRET:latest` (deploy.yml:157) |
| `INSURANCE_ENCRYPTION_KEY` | AES encryption of card PII | `packages/backend/src/lib/encryption.ts` | Secret Manager `INSURANCE_ENCRYPTION_KEY:latest` (deploy.yml:156) |
| `NEXT_PUBLIC_API_URL` | Frontend API base | `packages/frontend/src/lib/api.ts` | deploy.yml:216 build-arg |

### Required in Production — graceful degradation otherwise

| Variable | Effect When Missing | File:Line | Production Source |
|----------|--------------------|-----------|-------------------|
| `ADMIN_SECRET` | 503 on all /admin routes (admin.ts:27-39) | `packages/backend/src/routes/admin.ts:25` | Secret Manager `ADMIN_SECRET:latest` (deploy.yml:152) |
| `RECAPTCHA_SECRET_KEY` | Warning + skip (captcha.ts:126-132) | `packages/backend/src/middleware/captcha.ts:47` | Secret Manager `RECAPTCHA_SECRET_KEY:latest` (deploy.yml:153) |
| `ANTHROPIC_API_KEY` | 500 with friendly msg (route.ts:316-323) | `packages/frontend/src/app/api/insurance-card/extract/route.ts:35` | Secret Manager `ANTHROPIC_API_KEY:latest` (deploy.yml:239) |
| `FRONTEND_URL` | CORS allowlist only uses hardcoded origins (index.ts:25-35) | `packages/backend/src/index.ts:29` | deploy.yml:149 `secrets.FRONTEND_URL` |

### Optional — Sensible defaults

| Variable | Default | File:Line |
|----------|---------|-----------|
| `PORT` | 3001 (Cloud Run overrides to 8080) | `packages/backend/src/index.ts:22` |
| `NODE_ENV` | `development` | Used everywhere |
| `CORS_ORIGIN` | Unused at runtime, legacy | index.ts (not actually read; ALLOWED_ORIGINS hardcoded) |
| `LOG_LEVEL` | `info` | `packages/backend/src/utils/logger.ts:12` |
| `REDIS_URL` | unset -> in-memory fallback | `packages/backend/src/lib/redis.ts:40` |
| `CAPTCHA_FAIL_MODE` | `open` | `packages/backend/src/middleware/captcha.ts:52` |
| `CAPTCHA_MIN_SCORE` | 0.5 (constant) | `packages/backend/src/config/constants.ts:52` |
| `CAPTCHA_API_TIMEOUT_MS` | 5000 (constant) | `packages/backend/src/config/constants.ts:57` |
| `CAPTCHA_FALLBACK_MAX_REQUESTS` | 3 (constant) | `packages/backend/src/config/constants.ts:62` |
| `CAPTCHA_FALLBACK_WINDOW_MS` | 3600000 (constant) | `packages/backend/src/config/constants.ts:67` |
| `MAGIC_LINK_BASE_URL` | `https://verifymyprovider.com` | authService.ts |
| `NEXT_PUBLIC_POSTHOG_KEY` | unset -> analytics no-op | `packages/frontend/src/components/PostHogProvider.tsx:10` |
| `NEXT_PUBLIC_POSTHOG_HOST` | `https://us.i.posthog.com` | PostHogProvider.tsx:14 |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | unset -> client CAPTCHA disabled | `packages/frontend/src/components/ReCaptchaProvider.tsx` (referenced) |
| `NEXT_PUBLIC_SITE_URL` | `https://verifymyprovider.com` | Frontend sitemap |
| `NPI_DATA_URL` | unused at runtime | Documentation only |
| `INSURANCE_ENCRYPTION_KEY_PREVIOUS` | unset -> single-key mode | `packages/backend/src/routes/admin.ts:583` (key rotation workflow) |

### CI/CD-only (GitHub Actions secrets)

| Variable | File:Line |
|----------|-----------|
| `GCP_PROJECT_ID` | `.github/workflows/deploy.yml:73,88,110,199,213` |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | deploy.yml:67 |
| `GCP_SERVICE_ACCOUNT` | deploy.yml:68 |
| `FRONTEND_URL` | deploy.yml:149 |
| `NEXT_PUBLIC_POSTHOG_KEY` | deploy.yml:217 |

## Secret Storage Map

### Local development — `.env` (gitignored)

Required locally: `DATABASE_URL`, `PORT`, `NODE_ENV`, `NEXT_PUBLIC_API_URL`.
All paid/third-party APIs (Anthropic, Resend, reCAPTCHA, PostHog) degrade
gracefully, so dev does not need them.

### Production — GCP Secret Manager (mounted via deploy.yml)

Backend (from `deploy.yml:150-157`):
- `DATABASE_URL`
- `ADMIN_SECRET`
- `RECAPTCHA_SECRET_KEY`
- `JWT_SECRET`
- `RESEND_API_KEY`
- `INSURANCE_ENCRYPTION_KEY`
- `CSRF_SECRET`

Frontend (from `deploy.yml:238-239`):
- `ANTHROPIC_API_KEY`

### Cloud Run env-vars (non-secret)

Backend (deploy.yml:147-149): `NODE_ENV=production`, `FRONTEND_URL`
Frontend (deploy.yml:236-237): `NODE_ENV=production`

### Build-args (baked into Next.js bundle)

Frontend (deploy.yml:215-217): `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_POSTHOG_KEY`

## `.env.example` Audit

File: `.env.example` (102 lines).

Covered: `DATABASE_URL`, `PORT`, `NODE_ENV`, `CORS_ORIGIN`, `FRONTEND_URL`,
`REDIS_URL`, `ADMIN_SECRET`, `RECAPTCHA_SECRET_KEY`, `CAPTCHA_FAIL_MODE`,
`ANTHROPIC_API_KEY`, `NPI_DATA_URL`, `NEXT_PUBLIC_POSTHOG_KEY`,
`NEXT_PUBLIC_POSTHOG_HOST`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SITE_URL`,
`NEXT_PUBLIC_RECAPTCHA_SITE_KEY`, `JWT_SECRET`, `RESEND_API_KEY`,
`MAGIC_LINK_BASE_URL`, `LOG_LEVEL`.

Missing from `.env.example`:
- `INSURANCE_ENCRYPTION_KEY` (required — card PII AES key)
- `INSURANCE_ENCRYPTION_KEY_PREVIOUS` (key-rotation workflow)
- `CSRF_SECRET` (required — throws if missing)
- `CAPTCHA_MIN_SCORE`, `CAPTCHA_API_TIMEOUT_MS`, `CAPTCHA_FALLBACK_MAX_REQUESTS`, `CAPTCHA_FALLBACK_WINDOW_MS` (all overridable; only `CAPTCHA_FAIL_MODE` is documented)

## Findings (Ranked)

1. **CRITICAL** — `.env.example` does not mention `INSURANCE_ENCRYPTION_KEY` or `CSRF_SECRET`. Both throw on missing in production code paths. Any new dev spinning up a card-capture-enabled environment will hit a cryptic error.
2. **HIGH** — `docker-compose.yml` hardcodes `JWT_SECRET: local-dev-jwt-secret-change-me` (docker-compose.yml:33). Acceptable for local, but this value is in git — confirm no environment uses docker-compose for staging.
3. **HIGH** — `CORS_ORIGIN` variable is in `.env.example` but **not read anywhere in backend source** (index.ts hardcodes `ALLOWED_ORIGINS` at :25-35). Either remove from `.env.example` or wire it up.
4. **MEDIUM** — `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` is documented in env docs but missing from `deploy.yml` build-args. Production frontend currently has no way to load the reCAPTCHA site key, so `verifyCaptcha` on the backend can't be exercised end-to-end.
5. **MEDIUM** — No automated secret-scanning step in CI (`.github/workflows/` has codeql.yml + security-scan.yml but no gitleaks/trufflehog equivalent visible in the audit scope).
6. **MEDIUM** — No rotation runbook for any secret except `INSURANCE_ENCRYPTION_KEY` (which has a documented flow in admin.ts:549-553).
7. **LOW** — `NPI_DATA_URL` remains in `.env.example` but has no runtime reader. Recommend removing or wiring to a constants file.
8. **LOW** — `ADMIN_SECRET` comparison uses `timingSafeEqual` (admin.ts:51) — well done. Keep this pattern for future secrets.
9. **LOW** — All secrets marked `*:latest` in deploy.yml (e.g. `DATABASE_URL:latest`). Version pinning would make rollback/rotation auditable.

## Checklist

### Secret Security
- [x] No secrets hardcoded in TS source
- [x] `.env` in `.gitignore`
- [x] `.env.example` provided
- [x] Timing-safe admin-secret compare (admin.ts:49-51)
- [x] Card PII AES-encrypted at rest
- [x] Workload Identity Federation (no long-lived GCP keys) — deploy.yml:64-68
- [ ] `INSURANCE_ENCRYPTION_KEY`, `CSRF_SECRET` documented in `.env.example`
- [ ] Automated secret scanning in CI
- [ ] Rotation runbooks for JWT/Resend/reCAPTCHA/Anthropic

### Environment Configuration
- [x] Sensible defaults for optional vars
- [x] Graceful degradation: CAPTCHA/PostHog/Anthropic/Redis/Resend
- [x] Production-specific values wired in deploy.yml
- [ ] Unused `CORS_ORIGIN` / `NPI_DATA_URL` cleanup

### CI/CD
- [x] Workload Identity Federation
- [x] Secrets injected via Secret Manager at Cloud Run deploy time
- [x] Build-args for public NEXT_PUBLIC_* vars
- [x] Prisma `db push` via Cloud SQL Auth Proxy (deploy.yml:98-129)
- [ ] Pin specific Secret Manager versions (not `:latest`)

## Questions

1. Should `.env.example` be regenerated from a schema file (e.g., zod env validator) so it can't drift from code?
2. Is the `docker-compose.yml` `JWT_SECRET` ever used for a non-local environment?
3. Why is `CORS_ORIGIN` documented but not read? Remove or wire up?
4. Plan for automated secret rotation with Secret Manager versioning?
5. Should GitHub Actions add gitleaks or similar secret-scanning in addition to CodeQL?
