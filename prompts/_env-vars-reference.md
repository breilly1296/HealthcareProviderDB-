---
tags:
  - reference
  - environment
  - secrets
type: reference
priority: 1
updated: 2026-04-16
---

# Environment Variable Reference

Single source of truth for every environment variable used across VerifyMyProvider. Individual prompts should reference this file (`see _env-vars-reference.md`) rather than restate the full inventory.

**Full context and file-by-file breakdown:** see [[11-environment-secrets]].

---

## Database

| Variable | Required | Where used |
|---|---|---|
| `DATABASE_URL` | Yes | Backend (Prisma). Prod: GCP Secret Manager. |

## Server config

| Variable | Required | Default | Notes |
|---|---|---|---|
| `PORT` | No | `3001` | Cloud Run overrides to `8080`. |
| `NODE_ENV` | No | `development` | Controls CAPTCHA skip, log format, CORS. |
| `CORS_ORIGIN` | No | — | Legacy; hardcoded origins in `index.ts` take priority. |
| `FRONTEND_URL` | No | — | Cloud Run frontend URL, added to CORS whitelist. |
| `LOG_LEVEL` | No | `info` | Pino log level. |

## Security — CAPTCHA

| Variable | Required | Default |
|---|---|---|
| `RECAPTCHA_SECRET_KEY` | Prod | — |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | Prod | — |
| `CAPTCHA_FAIL_MODE` | No | `open` |
| `CAPTCHA_MIN_SCORE` | No | `0.5` |
| `CAPTCHA_API_TIMEOUT_MS` | No | `5000` |
| `CAPTCHA_FALLBACK_MAX_REQUESTS` | No | `3` |
| `CAPTCHA_FALLBACK_WINDOW_MS` | No | `3600000` |

## Security — Admin & encryption

| Variable | Required | Notes |
|---|---|---|
| `ADMIN_SECRET` | Prod | `X-Admin-Secret` header on admin endpoints. Endpoints return 503 if unset. |
| `INSURANCE_ENCRYPTION_KEY` | Card storage | AES key. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. |
| `CSRF_SECRET` | Auth | CSRF double-submit cookie signing. Throws if missing. |

## Caching

| Variable | Required | Notes |
|---|---|---|
| `REDIS_URL` | No | Falls back to in-memory rate limiting + caching if unset. |

## Authentication (magic link)

| Variable | Required | Notes |
|---|---|---|
| `JWT_SECRET` | Yes (auth) | 64-byte hex. Generate: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`. |
| `RESEND_API_KEY` | Yes (auth) | Magic link email delivery. |
| `MAGIC_LINK_BASE_URL` | No | Default: `https://verifymyprovider.com`. |

## External APIs

| Variable | Required | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | No | Insurance card OCR. Feature disabled if unset. |

## Analytics (PostHog)

| Variable | Required | Default |
|---|---|---|
| `NEXT_PUBLIC_POSTHOG_KEY` | No | — |
| `NEXT_PUBLIC_POSTHOG_HOST` | No | `https://app.posthog.com` |

## Frontend

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Yes | Backend API base URL. Build-time arg. |

## GCP / CI/CD (GitHub Actions secrets)

| Variable | Required | Notes |
|---|---|---|
| `GCP_PROJECT_ID` | CI/CD | |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | CI/CD | Workload Identity Federation. |
| `GCP_SERVICE_ACCOUNT` | CI/CD | GCP deploy SA. |
| `GCP_REGION` | CI/CD | Hardcoded to `us-central1`. |
| `NPI_DATA_URL` | No | Reference only; unused in code. |

---

## Secret storage map

- **Local dev:** `.env` at project root (gitignored). Copy from `.env.example`.
- **Cloud Run — backend:** secrets injected as `DATABASE_URL`, `JWT_SECRET`, `RESEND_API_KEY`, `INSURANCE_ENCRYPTION_KEY`, `CSRF_SECRET` from GCP Secret Manager.
- **Cloud Run — frontend:** `ANTHROPIC_API_KEY` from Secret Manager; `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_POSTHOG_KEY` as build-args.
- **GitHub Actions:** `GCP_*`, `FRONTEND_URL`, `NEXT_PUBLIC_POSTHOG_KEY`.

See [[11-environment-secrets]] for deploy.yml snippets and secret rotation notes.
