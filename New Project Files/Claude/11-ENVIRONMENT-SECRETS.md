# Environment Variables and Secrets

This document provides a complete inventory of every environment variable used in the VerifyMyProvider application, including required/optional status, default values, and storage locations across environments.

---

## Variable Inventory

### Database

| Variable | Required | Default | Used By | Description |
|----------|----------|---------|---------|-------------|
| `DATABASE_URL` | Yes (prod) | None | Backend (Prisma) | PostgreSQL connection string. Format: `postgresql://user:password@host:port/database`. In production, stored in GCP Secret Manager and injected into Cloud Run. |

### Server Configuration

| Variable | Required | Default | Used By | Description |
|----------|----------|---------|---------|-------------|
| `PORT` | No | `3001` (local), `8080` (Cloud Run) | Backend, Frontend | HTTP server port. Cloud Run overrides to 8080 automatically. |
| `NODE_ENV` | No | `development` | Both | Environment mode: `development`, `test`, or `production`. Controls CAPTCHA behavior, error verbosity, CORS origins, and logging. |
| `CORS_ORIGIN` | No | None | Backend | Additional CORS origin to allow (beyond hardcoded list). |
| `FRONTEND_URL` | No | None | Backend | Cloud Run frontend URL, added to CORS allowed origins dynamically. Stored as Cloud Run env var. |
| `HOSTNAME` | No | `0.0.0.0` | Frontend | Hostname for Next.js server binding. Set in Dockerfile for Cloud Run. |

### Security -- CAPTCHA

| Variable | Required | Default | Used By | Description |
|----------|----------|---------|---------|-------------|
| `RECAPTCHA_SECRET_KEY` | Prod only | None | Backend | Server-side Google reCAPTCHA v3 secret key. If not set, CAPTCHA verification is skipped with a warning. Stored in GCP Secret Manager. |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | Prod only | None | Frontend | Client-side reCAPTCHA site key (public, safe for exposure). Baked into frontend build. |
| `CAPTCHA_FAIL_MODE` | No | `open` | Backend | Behavior when Google reCAPTCHA API is unavailable: `open` (allow with fallback rate limiting) or `closed` (block all requests). |
| `CAPTCHA_MIN_SCORE` | No | `0.5` | Backend | Minimum reCAPTCHA v3 score (0.0-1.0) to pass verification. Scores below this threshold are rejected as likely bots. Configured in `config/constants.ts`. |
| `CAPTCHA_API_TIMEOUT_MS` | No | `5000` | Backend | Timeout in milliseconds for Google reCAPTCHA API calls. Configured in `config/constants.ts`. |
| `CAPTCHA_FALLBACK_MAX_REQUESTS` | No | `3` | Backend | Maximum requests allowed per IP per hour when CAPTCHA API is unavailable (fail-open mode). Configured in `config/constants.ts`. |
| `CAPTCHA_FALLBACK_WINDOW_MS` | No | `3600000` | Backend | Time window in milliseconds for fallback rate limiting (1 hour). Configured in `config/constants.ts`. |

### Security -- Admin

| Variable | Required | Default | Used By | Description |
|----------|----------|---------|---------|-------------|
| `ADMIN_SECRET` | Prod only | None | Backend | Secret value for `X-Admin-Secret` header to access admin endpoints. Validated using `crypto.timingSafeEqual` to prevent timing attacks. If not configured, admin endpoints return 503. Stored in GCP Secret Manager. |

### Caching

| Variable | Required | Default | Used By | Description |
|----------|----------|---------|---------|-------------|
| `REDIS_URL` | No | None | Backend | Redis connection string (e.g., `redis://10.0.0.3:6379`). Enables distributed rate limiting for horizontal scaling. Falls back to in-memory rate limiting when not configured. |

### External APIs

| Variable | Required | Default | Used By | Description |
|----------|----------|---------|---------|-------------|
| `ANTHROPIC_API_KEY` | No | None | Frontend (API route) | Anthropic Claude API key for insurance card extraction. If not configured, the feature is disabled gracefully. Stored in GCP Secret Manager, injected into frontend Cloud Run service. |

### Analytics

| Variable | Required | Default | Used By | Description |
|----------|----------|---------|---------|-------------|
| `NEXT_PUBLIC_POSTHOG_KEY` | No | None | Frontend | PostHog project API key (public). If not configured, analytics are silently disabled. Baked into frontend build via Docker build arg. |
| `NEXT_PUBLIC_POSTHOG_HOST` | No | `https://us.i.posthog.com` | Frontend | PostHog API host URL. Override for self-hosted PostHog instances. |

### Frontend

| Variable | Required | Default | Used By | Description |
|----------|----------|---------|---------|-------------|
| `NEXT_PUBLIC_API_URL` | Yes | `http://localhost:3001/api/v1` | Frontend | Backend API base URL. Must be set correctly for the deployment environment. Baked into frontend build via Docker build arg. |
| `NEXT_TELEMETRY_DISABLED` | No | `1` (in Docker) | Frontend | Disables Next.js anonymous telemetry reporting. |

### GCP / Deployment (CI/CD Only)

| Variable | Required | Default | Used By | Description |
|----------|----------|---------|---------|-------------|
| `GCP_PROJECT_ID` | CI/CD only | None | GitHub Actions | Google Cloud project identifier. Stored as GitHub Actions secret. |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | CI/CD only | None | GitHub Actions | Workload Identity Federation provider for keyless authentication. Stored as GitHub Actions secret. |
| `GCP_SERVICE_ACCOUNT` | CI/CD only | None | GitHub Actions | GCP service account email for Workload Identity Federation. Stored as GitHub Actions secret. |

---

## Secret Storage by Environment

### Local Development
- All secrets stored in `.env` file at repository root
- `.env` is gitignored (listed in `.gitignore`)
- Copy from `.env.example` template for initial setup
- Database typically points to local Docker PostgreSQL (`docker-compose.dev.yml`)

### CI/CD (GitHub Actions)
- GCP credentials stored as GitHub Actions repository secrets
- Accessed via `${{ secrets.SECRET_NAME }}` in workflow YAML
- Secrets used:
  - `GCP_PROJECT_ID`
  - `GCP_WORKLOAD_IDENTITY_PROVIDER`
  - `GCP_SERVICE_ACCOUNT`
  - `FRONTEND_URL`
  - `NEXT_PUBLIC_POSTHOG_KEY`

### Production (Google Cloud)
- **GCP Secret Manager** stores sensitive secrets:
  - `DATABASE_URL` -- PostgreSQL connection string with Cloud SQL proxy
  - `ADMIN_SECRET` -- Admin endpoint authentication
  - `RECAPTCHA_SECRET_KEY` -- reCAPTCHA server-side key
  - `ANTHROPIC_API_KEY` -- Claude API key (mounted to frontend service)
- **Cloud Run environment variables** for non-sensitive configuration:
  - `NODE_ENV=production`
  - `FRONTEND_URL` (for CORS)
- **Docker build arguments** for public frontend config:
  - `NEXT_PUBLIC_API_URL` -- Baked into Next.js build
  - `NEXT_PUBLIC_POSTHOG_KEY` -- Baked into Next.js build

### Staging
- Same secret structure as production
- Services suffixed with `-staging` (e.g., `verifymyprovider-backend-staging`)
- Max 2 instances (vs 10 for production)
- Same GCP Secret Manager secrets (shared with production for now)

---

## Security Properties

### No Long-Lived Keys
- GCP authentication uses Workload Identity Federation (OIDC tokens from GitHub Actions)
- No service account JSON key files exist in the repository or CI/CD
- No SSH keys or deploy keys required

### Secret Rotation
| Secret | Rotation Steps |
|--------|---------------|
| `DATABASE_URL` | 1. Rotate Cloud SQL password via GCP Console. 2. Update secret version in Secret Manager. 3. Redeploy Cloud Run services (they pick up latest version). |
| `ADMIN_SECRET` | 1. Generate new random string. 2. Update in GCP Secret Manager. 3. Redeploy backend. 4. Update any Cloud Scheduler jobs. |
| `RECAPTCHA_SECRET_KEY` | 1. Generate new key pair in Google reCAPTCHA Console. 2. Update both `RECAPTCHA_SECRET_KEY` (backend) and `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` (frontend rebuild). 3. Redeploy both services. |
| `ANTHROPIC_API_KEY` | 1. Generate new key in Anthropic Console. 2. Update in GCP Secret Manager. 3. Redeploy frontend service. |

### Variables That Must Match
- `NEXT_PUBLIC_API_URL` (frontend) must point to the backend Cloud Run URL + `/api/v1`
- `FRONTEND_URL` (backend) must match the frontend Cloud Run URL for CORS
- `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` and `RECAPTCHA_SECRET_KEY` must be from the same reCAPTCHA key pair
