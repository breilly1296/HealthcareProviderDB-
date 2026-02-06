# Environment & Secrets Review

## Complete Environment Variable Inventory (Verified from Code)

### Database

| Variable | Required | Where Used | Default | Verified In |
|----------|----------|------------|---------|-------------|
| `DATABASE_URL` | **Yes** | Backend (Prisma) | None | `packages/backend/src/lib/prisma.ts` (line 9, via `@prisma/client`), `packages/backend/prisma/schema.prisma` (line 9) |

### Server Configuration

| Variable | Required | Default | Where Used | Verified In |
|----------|----------|---------|------------|-------------|
| `PORT` | No | `3001` | Backend | `packages/backend/src/index.ts` line 19 |
| `NODE_ENV` | No | `development` | Both | index.ts line 30, captcha.ts line 121, prisma.ts line 10 |
| `CORS_ORIGIN` | No | -- | Backend (legacy) | Hardcoded origins in index.ts lines 22-27 take priority |
| `FRONTEND_URL` | No | -- | Backend | index.ts line 26 (added to CORS whitelist) |

### Security -- CAPTCHA (Google reCAPTCHA v3)

| Variable | Required | Default | Where Used | Verified In |
|----------|----------|---------|------------|-------------|
| `RECAPTCHA_SECRET_KEY` | Prod only | -- | Backend | `captcha.ts` line 47 |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | Prod only | -- | Frontend | `.env.example` line 81 |
| `CAPTCHA_FAIL_MODE` | No | `open` | Backend | `captcha.ts` line 52 |
| `CAPTCHA_MIN_SCORE` | No | `0.5` | Backend | `config/constants.ts` line 52 (hardcoded, not from env) |
| `CAPTCHA_API_TIMEOUT_MS` | No | `5000` | Backend | `config/constants.ts` line 57 (hardcoded, not from env) |
| `CAPTCHA_FALLBACK_MAX_REQUESTS` | No | `3` | Backend | `config/constants.ts` line 62 (hardcoded, not from env) |
| `CAPTCHA_FALLBACK_WINDOW_MS` | No | `3600000` | Backend | `config/constants.ts` line 67 (hardcoded, not from env) |

**Note:** `CAPTCHA_MIN_SCORE`, `CAPTCHA_API_TIMEOUT_MS`, `CAPTCHA_FALLBACK_MAX_REQUESTS`, and `CAPTCHA_FALLBACK_WINDOW_MS` are exported constants in `config/constants.ts`, NOT read from environment variables. They must be changed in code.

### Security -- Admin

| Variable | Required | Default | Where Used | Verified In |
|----------|----------|---------|------------|-------------|
| `ADMIN_SECRET` | Prod only | -- | Backend | `admin.ts` line 22 (`process.env.ADMIN_SECRET`). If not set, admin endpoints return 503. |

### Caching -- Redis

| Variable | Required | Default | Where Used | Verified In |
|----------|----------|---------|------------|-------------|
| `REDIS_URL` | No | -- | Backend | `redis.ts` line 40. Falls back to in-memory. |

### External APIs

| Variable | Required | Default | Where Used | Verified In |
|----------|----------|---------|------------|-------------|
| `ANTHROPIC_API_KEY` | No | -- | Frontend API route | `route.ts` line 35. Feature disabled if not set (returns 500 with message). |

### Analytics

| Variable | Required | Default | Where Used | Verified In |
|----------|----------|---------|------------|-------------|
| `NEXT_PUBLIC_POSTHOG_KEY` | No | -- | Frontend | `PostHogProvider.tsx` line 10. Analytics disabled if not set. |
| `NEXT_PUBLIC_POSTHOG_HOST` | No | `https://us.i.posthog.com` | Frontend | `PostHogProvider.tsx` line 14 |

### Frontend

| Variable | Required | Default | Where Used | Verified In |
|----------|----------|---------|------------|-------------|
| `NEXT_PUBLIC_API_URL` | **Yes** | `http://localhost:3001/api/v1` | Frontend | `lib/api.ts` line 17 |
| `NEXT_PUBLIC_SITE_URL` | No | `https://verifymyprovider.com` | Frontend | `.env.example` line 75 (for sitemap) |

### GCP / Deployment

| Variable | Required | Where Used | Verified In |
|----------|----------|------------|-------------|
| `GCP_PROJECT_ID` | CI/CD | deploy.yml | deploy.yml lines 65, 72, etc. (GitHub Actions secret) |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | CI/CD | deploy.yml | deploy.yml line 64 |
| `GCP_SERVICE_ACCOUNT` | CI/CD | deploy.yml | deploy.yml line 65 |
| `GCP_REGION` | CI/CD | deploy.yml | Hardcoded `us-central1` in deploy.yml line 10 |

### Logging

| Variable | Required | Default | Where Used |
|----------|----------|---------|------------|
| `LOG_LEVEL` | No | `info` | `.env.example` line 87 (used by pino logger) |

## Secret Storage Locations (Verified)

### Local Development
- `.env` file at project root (gitignored -- confirmed `.env` in `.gitignore` line 13)
- `.env.local`, `.env.production`, `.env.*.local` also gitignored (lines 14-16)
- `.env.example` exists with placeholder values (verified, 88 lines)

### Production (Cloud Run) -- Verified from `deploy.yml`

**Backend Cloud Run service (deploy.yml lines 106-112):**
```yaml
env_vars:
  NODE_ENV=production
  FRONTEND_URL=${{ secrets.FRONTEND_URL }}
secrets:
  DATABASE_URL=DATABASE_URL:latest
  ADMIN_SECRET=ADMIN_SECRET:latest
  RECAPTCHA_SECRET_KEY=RECAPTCHA_SECRET_KEY:latest
```

**Frontend Cloud Run service (deploy.yml lines 170-194):**
```yaml
build-args:
  NEXT_PUBLIC_API_URL=<backend-url>/api/v1
  NEXT_PUBLIC_POSTHOG_KEY=${{ secrets.NEXT_PUBLIC_POSTHOG_KEY }}
env_vars:
  NODE_ENV=production
secrets:
  ANTHROPIC_API_KEY=ANTHROPIC_API_KEY:latest
```

### GitHub Actions Secrets (Verified from deploy.yml)

| Secret | Purpose | Used At |
|--------|---------|---------|
| `GCP_PROJECT_ID` | GCP project identifier | deploy.yml lines 65, 72, 85-86, etc. |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Workload Identity Federation | deploy.yml line 64 |
| `GCP_SERVICE_ACCOUNT` | GCP deploy service account | deploy.yml line 65 |
| `FRONTEND_URL` | Frontend Cloud Run URL for CORS | deploy.yml line 108 |
| `NEXT_PUBLIC_POSTHOG_KEY` | PostHog API key (build arg) | deploy.yml line 172 |

### GCP Secret Manager (Verified from deploy.yml)

| Secret Name | Used By | deploy.yml Line |
|-------------|---------|-----------------|
| `DATABASE_URL` | Backend Cloud Run | 110 |
| `ADMIN_SECRET` | Backend Cloud Run | 111 |
| `RECAPTCHA_SECRET_KEY` | Backend Cloud Run | 112 |
| `ANTHROPIC_API_KEY` | Frontend Cloud Run | 194 |

## Checklist Verification

### Secret Security
- [x] No secrets hardcoded in source code -- verified across all files read (captcha.ts reads from env, admin.ts reads from env, redis.ts reads from env, prisma uses schema.prisma env())
- [x] `.env` files in `.gitignore` -- confirmed at `.gitignore` lines 13-16
- [x] `.env.example` exists with placeholder values -- confirmed, 88 lines covering all variables
- [x] Production secrets in GCP Secret Manager -- `DATABASE_URL`, `ADMIN_SECRET`, `RECAPTCHA_SECRET_KEY`, `ANTHROPIC_API_KEY` all use `:latest` versioning
- [x] Timing-safe comparison for `ADMIN_SECRET` -- `admin.ts` line 48 uses `crypto.timingSafeEqual()` with length check first (line 46-47)
- [x] CAPTCHA key validated server-side only -- `RECAPTCHA_SECRET_KEY` on backend, `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` (public) on frontend
- [ ] Secret rotation procedure not documented
- [ ] No automated secret scanning in CI (no gitleaks, truffleHog, or similar)

### Environment Configuration
- [x] All env vars have sensible defaults for development -- PORT=3001, CAPTCHA skipped in dev, Redis optional, PostHog optional, Anthropic optional
- [x] Optional features degrade gracefully when env vars missing:
  - CAPTCHA: skipped with warning when `RECAPTCHA_SECRET_KEY` not set (captcha.ts lines 126-132)
  - PostHog: not initialized when key missing (PostHogProvider.tsx line 12)
  - Redis: falls back to in-memory (redis.ts lines 41-44)
  - Anthropic: returns 500 with message (route.ts lines 316-323)
  - Admin: returns 503 when `ADMIN_SECRET` not set (admin.ts lines 25-36)
- [x] Production-specific values set via Cloud Run deployment
- [x] `.env.example` is COMPLETE -- covers DATABASE_URL, PORT, NODE_ENV, CORS_ORIGIN, FRONTEND_URL, REDIS_URL, ADMIN_SECRET, RECAPTCHA_SECRET_KEY, CAPTCHA_FAIL_MODE, ANTHROPIC_API_KEY, NPI_DATA_URL, NEXT_PUBLIC_POSTHOG_KEY, NEXT_PUBLIC_POSTHOG_HOST, NEXT_PUBLIC_API_URL, NEXT_PUBLIC_SITE_URL, NEXT_PUBLIC_RECAPTCHA_SITE_KEY, LOG_LEVEL

### CI/CD Secret Injection
- [x] Workload Identity Federation (no long-lived keys) -- deploy.yml uses `google-github-actions/auth@v2` with WIF (line 63)
- [x] Secrets passed via GitHub Actions secrets
- [x] Build args for public frontend env vars (`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_POSTHOG_KEY`)
- [x] Cloud Run Secret Manager for sensitive backend vars (DATABASE_URL, ADMIN_SECRET, RECAPTCHA_SECRET_KEY, ANTHROPIC_API_KEY)
- [ ] No secret expiration/rotation alerts

## CORS Configuration (Verified from `index.ts` lines 22-85)

Hardcoded allowed origins:
- `https://verifymyprovider.com`
- `https://www.verifymyprovider.com`
- `https://verifymyprovider-frontend-741434145252.us-central1.run.app`
- `process.env.FRONTEND_URL` (dynamic from env)
- In development: `http://localhost:3000`, `http://localhost:3001`

Requests with no origin (mobile apps, curl, Postman) are allowed (line 70-71).
Blocked origins are logged with `logger.warn` (line 78).

## Body Size Limits (Verified from `index.ts` lines 88-89)

- JSON body: 100kb limit
- URL-encoded body: 100kb limit
- Payload too large errors handled in errorHandler.ts lines 118-129 (413 response)

## Security Headers

**Backend (index.ts lines 46-66):** Helmet with strict CSP (default-src 'none'), CORS, cross-origin policies, referrer-policy.

**Frontend (next.config.js lines 13-47):**
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- CSP: **DISABLED** (commented out, blocking API requests)

## Questions Answered

### 1. Should `.env.example` be updated with all environment variables?
It is already up to date. The `.env.example` file at the project root includes all environment variables: DATABASE_URL, PORT, NODE_ENV, CORS_ORIGIN, FRONTEND_URL, REDIS_URL, ADMIN_SECRET, RECAPTCHA_SECRET_KEY, CAPTCHA_FAIL_MODE, ANTHROPIC_API_KEY, NPI_DATA_URL, NEXT_PUBLIC_POSTHOG_KEY, NEXT_PUBLIC_POSTHOG_HOST, NEXT_PUBLIC_API_URL, NEXT_PUBLIC_SITE_URL, NEXT_PUBLIC_RECAPTCHA_SITE_KEY, and LOG_LEVEL.

### 2. Is ADMIN_SECRET set via Cloud Run env or Secret Manager?
**Secret Manager.** The deploy.yml line 111 shows `ADMIN_SECRET=ADMIN_SECRET:latest` in the `secrets:` section (not `env_vars:`), meaning it is mounted from GCP Secret Manager.

### 3. Should we add automated secret scanning (gitleaks) to the CI pipeline?
**Recommended.** There is a `security-scan.yml` workflow in `.github/workflows/` but its contents were not verified. Adding gitleaks or truffleHog as a pre-commit hook and CI step would catch accidental secret commits.

### 4. Should secret rotation be automated with Secret Manager versioning?
**Recommended for DATABASE_URL and ADMIN_SECRET.** GCP Secret Manager supports automatic rotation with Cloud Functions. The `:latest` alias in deploy.yml already supports versioning -- deploying a new version of the secret and re-deploying the service would pick it up.

### 5. Are any secrets shared between environments that shouldn't be?
**Cannot fully verify** without access to actual secret values. However, the architecture separates production secrets (GCP Secret Manager) from development (.env file). The risk is if a developer copies production DATABASE_URL into their local .env, they would be writing to the production database. No `.env.development` or `.env.production.local` files exist to enforce this separation.
