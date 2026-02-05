# Environment & Secrets Review -- Analysis

**Generated:** 2026-02-05
**Source Prompt:** prompts/11-environment-secrets.md
**Status:** Mostly Accurate -- prompt is comprehensive but contains inaccuracies around CAPTCHA env var configurability and missing variables

---

## Findings

### Complete Environment Variable Inventory Verification

Each variable listed in the prompt was cross-referenced against actual `process.env` usage in source code.

#### Database

| Variable | Prompt Says | Code Reality | Status |
|----------|-------------|--------------|--------|
| `DATABASE_URL` | Required, Backend (Prisma) | Used implicitly by Prisma Client in `lib/prisma.ts`. Not directly referenced via `process.env.DATABASE_URL` in code -- Prisma reads it automatically. Also set in `docker-compose.yml` and `deploy.yml` (Secret Manager). | Verified |

#### Server Configuration

| Variable | Prompt Says | Code Reality | Status |
|----------|-------------|--------------|--------|
| `PORT` | No, default `3001` | `process.env.PORT \|\| 3001` in `index.ts` line 19. Also set in `docker-compose.yml` as `8080`. | Verified |
| `NODE_ENV` | No, default `development` | Used extensively: `index.ts` (CORS dev mode), `captcha.ts` (skip in dev/test), `prisma.ts` (log levels, dev singleton), `logger.ts` (pretty printing), `errorHandler.ts` (production error messages), `error.tsx` (dev details), `api.ts` (dev logging), `errorUtils.ts` (dev logging). | Verified |
| `CORS_ORIGIN` | No, legacy | NOT found in backend source code via `process.env.CORS_ORIGIN`. It exists in `.env.example` and `docker-compose.yml` but is never read by the application. The backend uses hardcoded origins + `FRONTEND_URL`. | Issue |
| `FRONTEND_URL` | No, Cloud Run | `process.env.FRONTEND_URL` in `index.ts` line 26, added to CORS whitelist. Set in `deploy.yml` via `secrets.FRONTEND_URL`. | Verified |

#### Security -- CAPTCHA (Google reCAPTCHA v3)

| Variable | Prompt Says | Code Reality | Status |
|----------|-------------|--------------|--------|
| `RECAPTCHA_SECRET_KEY` | Prod only | `process.env.RECAPTCHA_SECRET_KEY` in `captcha.ts` line 47. Skipped with warning if missing. | Verified |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | Prod only, Frontend | NOT found anywhere in frontend source code. Zero references to `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` in `packages/frontend/src/`. Only referenced in docs and other prompt files. reCAPTCHA is NOT yet integrated into the frontend. | Issue |
| `CAPTCHA_FAIL_MODE` | No, default `open` | `process.env.CAPTCHA_FAIL_MODE` in `captcha.ts` line 52. Correctly defaults to `'open'`. | Verified |
| `CAPTCHA_MIN_SCORE` | No, default `0.5` | Prompt describes this as an environment variable. In reality, it is a **hardcoded constant** (`export const CAPTCHA_MIN_SCORE = 0.5;`) in `config/constants.ts` line 52. It is NOT read from `process.env`. | Issue |
| `CAPTCHA_API_TIMEOUT_MS` | No, default `5000` | Prompt describes this as an environment variable. In reality, it is a **hardcoded constant** (`export const CAPTCHA_API_TIMEOUT_MS = 5 * MS_PER_SECOND;`) in `config/constants.ts` line 57. NOT read from `process.env`. | Issue |
| `CAPTCHA_FALLBACK_MAX_REQUESTS` | No, default `3` | Prompt describes this as an environment variable. In reality, it is a **hardcoded constant** (`export const CAPTCHA_FALLBACK_MAX_REQUESTS = 3;`) in `config/constants.ts` line 62. NOT read from `process.env`. | Issue |
| `CAPTCHA_FALLBACK_WINDOW_MS` | No, default `3600000` | Prompt describes this as an environment variable. In reality, it is a **hardcoded constant** (`export const CAPTCHA_FALLBACK_WINDOW_MS = MS_PER_HOUR;`) in `config/constants.ts` line 67. NOT read from `process.env`. | Issue |

#### Security -- Admin

| Variable | Prompt Says | Code Reality | Status |
|----------|-------------|--------------|--------|
| `ADMIN_SECRET` | Prod only | `process.env.ADMIN_SECRET` in `admin.ts` line 22. Returns 503 if not set. Uses `timingSafeEqual` for comparison (line 48). | Verified |

#### Caching -- Redis

| Variable | Prompt Says | Code Reality | Status |
|----------|-------------|--------------|--------|
| `REDIS_URL` | No | `process.env.REDIS_URL` in `redis.ts` lines 40 and 124. Returns null if not set, falling back to in-memory. | Verified |

#### External APIs

| Variable | Prompt Says | Code Reality | Status |
|----------|-------------|--------------|--------|
| `ANTHROPIC_API_KEY` | No | `process.env.ANTHROPIC_API_KEY` in `app/api/insurance-card/extract/route.ts` lines 35 and 316. Feature disabled if not set. | Verified |

#### Analytics

| Variable | Prompt Says | Code Reality | Status |
|----------|-------------|--------------|--------|
| `NEXT_PUBLIC_POSTHOG_KEY` | No | `process.env.NEXT_PUBLIC_POSTHOG_KEY` in `PostHogProvider.tsx` line 10. Analytics disabled if not set. | Verified |
| `NEXT_PUBLIC_POSTHOG_HOST` | No, default `https://app.posthog.com` | NOT found in source code. PostHog host is **hardcoded** as `'https://us.i.posthog.com'` in `PostHogProvider.tsx` line 14. The prompt says default is `https://app.posthog.com` but the actual hardcoded value is `https://us.i.posthog.com`. Neither value matches, and it is not configurable via env var. | Issue |

#### Frontend

| Variable | Prompt Says | Code Reality | Status |
|----------|-------------|--------------|--------|
| `NEXT_PUBLIC_API_URL` | Required | `process.env.NEXT_PUBLIC_API_URL \|\| 'http://localhost:3001/api/v1'` in `lib/api.ts` line 17. Set as build arg in `deploy.yml` and `docker-compose.yml`. | Verified |

#### GCP / Deployment

| Variable | Prompt Says | Code Reality | Status |
|----------|-------------|--------------|--------|
| `GCP_PROJECT_ID` | CI/CD only | Used in `deploy.yml` as `${{ secrets.GCP_PROJECT_ID }}`. | Verified |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | CI/CD only | Used in `deploy.yml` line 35. | Verified |
| `GCP_SERVICE_ACCOUNT` | CI/CD only | Used in `deploy.yml` line 36. | Verified |
| `GCP_REGION` | CI/CD only | Hardcoded as `us-central1` in `deploy.yml` line 10 (not a secret). | Verified |
| `NPI_DATA_URL` | No, reference only | Present in `.env.example` line 20. Not used in code. | Verified |

#### Variables Found in Code but NOT in Prompt

| Variable | Where Used | Description |
|----------|------------|-------------|
| `LOG_LEVEL` | `packages/backend/src/utils/logger.ts` line 12 | Controls pino log level. Defaults to `'info'`. NOT listed in the prompt's environment variable inventory. |
| `npm_package_version` | `packages/backend/src/index.ts` line 98 | Used in health check response. Auto-set by npm. Not a user-configurable env var. |

### Secret Storage Locations

#### Local Development
- [x] `.env` file at project root (gitignored) -- Verified. `.gitignore` contains `.env`, `.env.local`, `.env.*.local`.
- [x] `.env.example` exists with placeholder values -- Verified. Contains DATABASE_URL, PORT, NODE_ENV, CORS_ORIGIN, NEXT_PUBLIC_API_URL, NPI_DATA_URL, commented RECAPTCHA_SECRET_KEY, GCP settings.

#### Production (Cloud Run)

**Backend Cloud Run service (from deploy.yml):**
- [x] `NODE_ENV=production` as env_var -- Verified at line 77
- [x] `FRONTEND_URL=${{ secrets.FRONTEND_URL }}` as env_var -- Verified at line 78
- [x] `DATABASE_URL=DATABASE_URL:latest` as secret -- Verified at line 80
- [x] `--remove-secrets=ADMIN_SECRET` flag -- Verified at line 75

**Frontend Cloud Run service (from deploy.yml):**
- [x] `NODE_ENV=production` as env_var -- Verified at line 145
- [x] `NEXT_PUBLIC_API_URL` as build-arg -- Verified at line 118
- [x] `NEXT_PUBLIC_POSTHOG_KEY` as build-arg -- Verified at line 119
- [x] `ANTHROPIC_API_KEY=ANTHROPIC_API_KEY:latest` as secret -- Verified at line 147

Warning: The prompt says `RECAPTCHA_SECRET_KEY` should be a production secret for the backend, but it is NOT configured in `deploy.yml`. The backend CAPTCHA middleware will log a warning and skip verification in production unless this is set separately.

#### GitHub Actions Secrets
- [x] `GCP_PROJECT_ID` -- Verified in deploy.yml
- [x] `GCP_WORKLOAD_IDENTITY_PROVIDER` -- Verified in deploy.yml
- [x] `GCP_SERVICE_ACCOUNT` -- Verified in deploy.yml
- [x] `FRONTEND_URL` -- Verified in deploy.yml
- [x] `NEXT_PUBLIC_POSTHOG_KEY` -- Verified in deploy.yml

#### GCP Secret Manager
- [x] `DATABASE_URL` used by Backend Cloud Run -- Verified
- [x] `ANTHROPIC_API_KEY` used by Frontend Cloud Run -- Verified

### Docker Compose Verification

The `docker-compose.yml` sets:
- `DATABASE_URL=postgresql://postgres:postgres@db:5432/healthcare_providers` -- local DB connection
- `PORT=8080` for both backend and frontend containers
- `NODE_ENV=production`
- `CORS_ORIGIN=http://localhost:3000` -- set but never read by code (see issue above)
- `NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1` as build arg

### Checklist Verification

#### Secret Security
- [x] No secrets hardcoded in source code -- Verified. All secrets come from env vars or Secret Manager.
- [x] `.env` files in `.gitignore` -- Verified. `.env`, `.env.local`, `.env.*.local` all gitignored.
- [x] `.env.example` exists with placeholder values -- Verified.
- [x] Production secrets in GCP Secret Manager -- Verified for DATABASE_URL and ANTHROPIC_API_KEY.
- [x] Timing-safe comparison for ADMIN_SECRET -- Verified. `admin.ts` uses `timingSafeEqual` from `crypto` module with buffer length check.
- [x] CAPTCHA key validated server-side only -- Verified. `RECAPTCHA_SECRET_KEY` only used in backend `captcha.ts`.
- [ ] Secret rotation procedure not documented -- Prompt correctly marks this as missing. (Note: a `docs/SECRET-ROTATION.md` file exists in the project, but the prompt was likely written before it.)
- [ ] No automated secret scanning in CI -- Correctly marked as missing. No gitleaks/truffleHog in deploy.yml.

#### Environment Configuration
- [x] All env vars have sensible defaults for development -- Verified. PORT defaults to 3001, NODE_ENV to development, API_URL to localhost.
- [x] Optional features degrade gracefully when env vars missing -- Verified for CAPTCHA (skips with warning), PostHog (disabled), Redis (falls back to in-memory), Anthropic (feature disabled), ADMIN_SECRET (returns 503).
- [x] Production-specific values set via Cloud Run deployment -- Verified.
- [x] `.env.example` is incomplete -- Prompt correctly identifies this. Missing: `ADMIN_SECRET`, `REDIS_URL`, `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`, `CAPTCHA_FAIL_MODE`, `FRONTEND_URL`, `LOG_LEVEL`.

#### CI/CD Secret Injection
- [x] Workload Identity Federation (no long-lived keys) -- Verified in deploy.yml.
- [x] Secrets passed via GitHub Actions secrets -- Verified.
- [x] Build args for public frontend env vars -- Verified (NEXT_PUBLIC_API_URL, NEXT_PUBLIC_POSTHOG_KEY).
- [x] Cloud Run Secret Manager for sensitive backend vars -- Verified.
- [ ] No secret expiration/rotation alerts -- Correctly marked as missing.

---

## Summary

The prompt provides a thorough and mostly accurate inventory of environment variables and secret management practices. However, there are several notable inaccuracies:

1. **Four CAPTCHA settings described as environment variables are actually hardcoded constants** (`CAPTCHA_MIN_SCORE`, `CAPTCHA_API_TIMEOUT_MS`, `CAPTCHA_FALLBACK_MAX_REQUESTS`, `CAPTCHA_FALLBACK_WINDOW_MS`). The prompt implies these are configurable via env vars with defaults, but they are compile-time constants in `config/constants.ts`.

2. **`NEXT_PUBLIC_RECAPTCHA_SITE_KEY` is not used anywhere in the frontend codebase.** reCAPTCHA client-side integration has not been implemented yet. The prompt lists it as if it exists.

3. **`NEXT_PUBLIC_POSTHOG_HOST` is not used as an env var.** The PostHog host is hardcoded to `https://us.i.posthog.com`, not configurable, and the prompt's stated default (`https://app.posthog.com`) does not match the hardcoded value.

4. **`CORS_ORIGIN` is never read by the application.** It exists in `.env.example` and `docker-compose.yml` but no `process.env.CORS_ORIGIN` reference exists in the backend source. The backend uses hardcoded allowed origins plus `FRONTEND_URL`.

5. **`LOG_LEVEL` is used in code but not documented in the prompt.**

6. **`RECAPTCHA_SECRET_KEY` is not set in deploy.yml** for production, meaning CAPTCHA verification will be skipped in production with only a warning log.

---

## Recommendations

1. **Fix prompt: Remove CAPTCHA settings as env vars.** `CAPTCHA_MIN_SCORE`, `CAPTCHA_API_TIMEOUT_MS`, `CAPTCHA_FALLBACK_MAX_REQUESTS`, and `CAPTCHA_FALLBACK_WINDOW_MS` should either be described as hardcoded constants (current reality) or the code should be updated to read them from `process.env` with fallback defaults (if runtime configurability is desired).

2. **Fix prompt: Remove `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`** until reCAPTCHA is actually integrated into the frontend. Alternatively, flag it as "planned but not implemented."

3. **Fix prompt: Remove or correct `NEXT_PUBLIC_POSTHOG_HOST`.** The PostHog host is hardcoded, not configurable. If configurability is desired, update `PostHogProvider.tsx` to read from `process.env.NEXT_PUBLIC_POSTHOG_HOST`.

4. **Fix prompt: Remove or flag `CORS_ORIGIN` as dead.** It is set in config files but never read by the application. Either remove it from `.env.example` and `docker-compose.yml`, or add `process.env.CORS_ORIGIN` reading to the backend.

5. **Add `LOG_LEVEL` to the prompt inventory.** It is used in `logger.ts` and defaults to `'info'`.

6. **Add `RECAPTCHA_SECRET_KEY` to `deploy.yml` secrets** for production deployment, or document that CAPTCHA is intentionally disabled in production.

7. **Update `.env.example`** to include all environment variables: `ADMIN_SECRET`, `REDIS_URL`, `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_POSTHOG_KEY`, `CAPTCHA_FAIL_MODE`, `FRONTEND_URL`, `LOG_LEVEL`. Remove `CORS_ORIGIN` if it is dead code.

8. **Consider adding automated secret scanning** (gitleaks or truffleHog) to the CI pipeline as a pre-commit hook or GitHub Action step.
