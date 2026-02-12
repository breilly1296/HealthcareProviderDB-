---
tags:
  - security
  - secrets
  - critical
type: prompt
priority: 1
updated: 2026-02-05
---

# Environment & Secrets Review

## Files to Review
- `.env.example` (root level reference)
- `packages/backend/src/index.ts` (CORS origins, PORT, NODE_ENV)
- `packages/backend/src/config/constants.ts` (default values for CAPTCHA settings)
- `packages/backend/src/middleware/captcha.ts` (RECAPTCHA_SECRET_KEY, CAPTCHA_FAIL_MODE)
- `packages/backend/src/services/authService.ts` (JWT_SECRET, RESEND_API_KEY, MAGIC_LINK_BASE_URL)
- `packages/backend/src/routes/admin.ts` (ADMIN_SECRET)
- `packages/backend/src/lib/redis.ts` (REDIS_URL)
- `packages/backend/src/lib/prisma.ts` (DATABASE_URL)
- `packages/frontend/src/components/PostHogProvider.tsx` (NEXT_PUBLIC_POSTHOG_KEY/HOST)
- `packages/frontend/src/app/api/insurance-card/extract/route.ts` (ANTHROPIC_API_KEY)
- `.github/workflows/deploy.yml` (secret injection in CI/CD)
- `docker-compose.yml` (local/production Docker env)

## Complete Environment Variable Inventory

### Database
| Variable | Required | Where Used | Description |
|----------|----------|------------|-------------|
| `DATABASE_URL` | **Yes** | Backend (Prisma) | PostgreSQL connection string. In production: Cloud Run Secret Manager `DATABASE_URL:latest`. Locally: `.env` file. |

### Server Configuration
| Variable | Required | Default | Where Used | Description |
|----------|----------|---------|------------|-------------|
| `PORT` | No | `3001` | Backend | Server listen port. Cloud Run overrides to `8080`. |
| `NODE_ENV` | No | `development` | Both | Environment mode. `development`, `test`, or `production`. Controls CAPTCHA skip, log format, CORS. |
| `CORS_ORIGIN` | No | — | Backend | Additional CORS origin (legacy). Hardcoded origins in `index.ts` take priority. |
| `FRONTEND_URL` | No | — | Backend (deploy) | Cloud Run frontend URL, added to CORS whitelist dynamically. Set via deploy.yml env_vars. |

### Security — CAPTCHA (Google reCAPTCHA v3)
| Variable | Required | Default | Where Used | Description |
|----------|----------|---------|------------|-------------|
| `RECAPTCHA_SECRET_KEY` | Prod only | — | Backend `captcha.ts` | Server-side secret for reCAPTCHA v3 validation. If missing, CAPTCHA skipped with warning. |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | Prod only | — | Frontend | Client-side reCAPTCHA site key (public, safe to expose). |
| `CAPTCHA_FAIL_MODE` | No | `open` | Backend `captcha.ts` | `open` = allow requests if Google API fails (with fallback rate limiting). `closed` = block all requests if API fails. |
| `CAPTCHA_MIN_SCORE` | No | `0.5` | Backend `constants.ts` | Minimum reCAPTCHA score (0.0-1.0) to pass. Below = likely bot. |
| `CAPTCHA_API_TIMEOUT_MS` | No | `5000` | Backend `constants.ts` | Timeout for Google reCAPTCHA API calls. |
| `CAPTCHA_FALLBACK_MAX_REQUESTS` | No | `3` | Backend `constants.ts` | Max requests/hour per IP when CAPTCHA API is unavailable (fail-open mode). |
| `CAPTCHA_FALLBACK_WINDOW_MS` | No | `3600000` | Backend `constants.ts` | Time window for fallback rate limiting (1 hour). |

### Security — Admin
| Variable | Required | Default | Where Used | Description |
|----------|----------|---------|------------|-------------|
| `ADMIN_SECRET` | Prod only | — | Backend `admin.ts` | Secret for `X-Admin-Secret` header on admin endpoints. If not set, admin endpoints return 503. |

### Caching — Redis
| Variable | Required | Default | Where Used | Description |
|----------|----------|---------|------------|-------------|
| `REDIS_URL` | No | — | Backend `redis.ts` | Redis connection URL. If not set, falls back to in-memory rate limiting and caching. Example: `redis://localhost:6379` or `redis://10.0.0.1:6379`. |

### Authentication — Magic Link
| Variable | Required | Default | Where Used | Description |
|----------|----------|---------|------------|-------------|
| `JWT_SECRET` | **Yes** (auth) | — | Backend `authService.ts` | Secret for signing JWT access & refresh tokens. Generate with: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`. In production: Cloud Run Secret Manager `JWT_SECRET:latest`. |
| `RESEND_API_KEY` | **Yes** (auth) | — | Backend `authService.ts` | Resend API key for sending magic link emails. Get one at resend.com/api-keys. In production: Cloud Run Secret Manager `RESEND_API_KEY:latest`. |
| `MAGIC_LINK_BASE_URL` | No | `https://verifymyprovider.com` | Backend `authService.ts` | Base URL for magic link verification URLs. In dev: `http://localhost:3001`. In prod: `https://verifymyprovider.com` (behind load balancer). Set via `env_vars` in deploy.yml. |

### External APIs
| Variable | Required | Default | Where Used | Description |
|----------|----------|---------|------------|-------------|
| `ANTHROPIC_API_KEY` | No | — | Frontend API route | Claude API key for insurance card extraction. Feature disabled if not set. In production: Cloud Run Secret Manager `ANTHROPIC_API_KEY:latest`. |

### Analytics
| Variable | Required | Default | Where Used | Description |
|----------|----------|---------|------------|-------------|
| `NEXT_PUBLIC_POSTHOG_KEY` | No | — | Frontend `PostHogProvider.tsx` | PostHog project API key. Analytics disabled if not set. Passed as build-time arg in deploy.yml. |
| `NEXT_PUBLIC_POSTHOG_HOST` | No | `https://app.posthog.com` | Frontend `PostHogProvider.tsx` | PostHog API host (for self-hosted instances). |

### Frontend
| Variable | Required | Default | Where Used | Description |
|----------|----------|---------|------------|-------------|
| `NEXT_PUBLIC_API_URL` | **Yes** | — | Frontend `lib/api.ts` | Backend API base URL. Build-time arg. Example: `http://localhost:3001/api/v1`. In deploy.yml, set dynamically from backend output URL. |

### GCP / Deployment
| Variable | Required | Where Used | Description |
|----------|----------|------------|-------------|
| `GCP_PROJECT_ID` | CI/CD only | `deploy.yml` | GCP project ID (GitHub Actions secret) |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | CI/CD only | `deploy.yml` | Workload Identity Federation provider (GitHub Actions secret) |
| `GCP_SERVICE_ACCOUNT` | CI/CD only | `deploy.yml` | GCP service account for deployment (GitHub Actions secret) |
| `GCP_REGION` | CI/CD only | `deploy.yml` | Deployment region. Hardcoded to `us-central1` in workflow. |
| `NPI_DATA_URL` | No | Reference only | NPI data download URL. Currently unused in code (manual downloads). |

## Secret Storage Locations

### Local Development
- `.env` file at project root (gitignored)
- Copy from `.env.example` and fill in values
- Only `DATABASE_URL`, `PORT`, `NODE_ENV`, `CORS_ORIGIN`, `NEXT_PUBLIC_API_URL` needed locally
- CAPTCHA, PostHog, Anthropic, Redis all optional locally

### Production (Cloud Run)
Secrets injected via `.github/workflows/deploy.yml`:

**Backend Cloud Run service:**
```yaml
env_vars:
  NODE_ENV=production
  FRONTEND_URL=${{ secrets.FRONTEND_URL }}
secrets:
  DATABASE_URL=DATABASE_URL:latest
  JWT_SECRET=JWT_SECRET:latest
  RESEND_API_KEY=RESEND_API_KEY:latest
# ADMIN_SECRET removed from secrets (--remove-secrets flag) — set separately
```

**Frontend Cloud Run service:**
```yaml
env_vars:
  NODE_ENV=production
build-args:
  NEXT_PUBLIC_API_URL=<backend-url>/api/v1
  NEXT_PUBLIC_POSTHOG_KEY=${{ secrets.NEXT_PUBLIC_POSTHOG_KEY }}
secrets:
  ANTHROPIC_API_KEY=ANTHROPIC_API_KEY:latest
```

### GitHub Actions Secrets
| Secret | Purpose |
|--------|---------|
| `GCP_PROJECT_ID` | GCP project identifier |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Workload Identity Federation |
| `GCP_SERVICE_ACCOUNT` | GCP deploy service account |
| `FRONTEND_URL` | Frontend Cloud Run URL for CORS |
| `NEXT_PUBLIC_POSTHOG_KEY` | PostHog API key (passed as build arg) |

### GCP Secret Manager
| Secret Name | Used By |
|-------------|---------|
| `DATABASE_URL` | Backend Cloud Run |
| `JWT_SECRET` | Backend Cloud Run |
| `RESEND_API_KEY` | Backend Cloud Run |
| `ANTHROPIC_API_KEY` | Frontend Cloud Run |

## Checklist

### Secret Security
- [x] No secrets hardcoded in source code
- [x] `.env` files in `.gitignore`
- [x] `.env.example` exists with placeholder values
- [x] Production secrets in GCP Secret Manager
- [x] Timing-safe comparison for ADMIN_SECRET
- [x] CAPTCHA key validated server-side only (public site key + private secret key pattern)
- [ ] Secret rotation procedure not documented
- [ ] No automated secret scanning in CI (e.g., gitleaks, truffleHog)

### Environment Configuration
- [x] All env vars have sensible defaults for development
- [x] Optional features degrade gracefully when env vars missing (CAPTCHA, PostHog, Redis, Anthropic)
- [x] Production-specific values set via Cloud Run deployment
- [ ] `.env.example` is incomplete — missing CAPTCHA settings, ADMIN_SECRET, REDIS_URL, ANTHROPIC_API_KEY, PostHog vars

### CI/CD Secret Injection
- [x] Workload Identity Federation (no long-lived keys)
- [x] Secrets passed via GitHub Actions secrets
- [x] Build args for public frontend env vars
- [x] Cloud Run Secret Manager for sensitive backend vars
- [ ] No secret expiration/rotation alerts

## Questions to Ask
1. Should `.env.example` be updated with all environment variables?
2. Is ADMIN_SECRET set via Cloud Run env or Secret Manager?
3. Should we add automated secret scanning (gitleaks) to the CI pipeline?
4. Should secret rotation be automated with Secret Manager versioning?
5. Are any secrets shared between environments that shouldn't be?
