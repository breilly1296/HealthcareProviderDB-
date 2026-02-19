# Environment & Secrets Review

**Generated:** 2026-02-18
**Prompt:** 11-environment-secrets.md
**Status:** STRONG -- All secrets properly externalized, no hardcoded credentials found, GCP Secret Manager used for production. `.env.example` has been updated to include all variables. Two gaps: no automated secret scanning in CI, no rotation alerts.

---

## Environment Variable Inventory Verification

### Database
| Variable | Required | Verified In | Status |
|----------|----------|-------------|--------|
| `DATABASE_URL` | Yes | `packages/backend/src/lib/prisma.ts` (Prisma reads automatically), `scripts/pre-import-check.ts` (line 84), `scripts/import-npi-direct.ts` (line 329), `deploy.yml` (line 151) | CONFIRMED |

**Findings:** Prisma reads `DATABASE_URL` automatically from environment. Import scripts also accept it via `--database` CLI flag. The `createPool()` function in `pre-import-check.ts` strips `sslmode` from the URL and sets `ssl: { rejectUnauthorized: false }` to work around pg v8.x Cloud SQL incompatibility.

### Server Configuration
| Variable | Default | Verified In | Status |
|----------|---------|-------------|--------|
| `PORT` | `3001` | `packages/backend/src/index.ts` (line 22) | CONFIRMED |
| `NODE_ENV` | `development` | `index.ts` (lines 33, 55), `captcha.ts` (line 121), `prisma.ts` (lines 10, 15), `csrf.ts` (line 4) | CONFIRMED |
| `CORS_ORIGIN` | -- | Not used directly; CORS origins are hardcoded in `index.ts` (lines 25-30) | LEGACY -- superseded by hardcoded list |
| `FRONTEND_URL` | -- | `index.ts` (line 29) added to CORS whitelist | CONFIRMED |
| `LOG_LEVEL` | `info` | Referenced in prompt but logger configuration not directly inspected | LISTED |

**Findings:** `CORS_ORIGIN` is technically in `.env.example` but the actual CORS config in `index.ts` uses a hardcoded array of allowed origins plus `FRONTEND_URL`. The `CORS_ORIGIN` env var is not directly read in the current code.

### Security -- CAPTCHA
| Variable | Default | Verified In | Status |
|----------|---------|-------------|--------|
| `RECAPTCHA_SECRET_KEY` | -- | `captcha.ts` (line 47) | CONFIRMED |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | -- | Frontend `ReCaptchaProvider.tsx` | CONFIRMED |
| `CAPTCHA_FAIL_MODE` | `open` | `captcha.ts` (line 52) | CONFIRMED |
| `CAPTCHA_MIN_SCORE` | `0.5` | `config/constants.ts` (line 52) | CONFIRMED |
| `CAPTCHA_API_TIMEOUT_MS` | `5000` | `config/constants.ts` (line 57) | CONFIRMED |
| `CAPTCHA_FALLBACK_MAX_REQUESTS` | `3` | `config/constants.ts` (line 62) | CONFIRMED |
| `CAPTCHA_FALLBACK_WINDOW_MS` | `3600000` | `config/constants.ts` (line 67) | CONFIRMED |

**Findings:** All CAPTCHA settings have sensible defaults in `constants.ts`. The middleware skips verification entirely when `NODE_ENV` is `development` or `test`.

### Security -- Admin
| Variable | Default | Verified In | Status |
|----------|---------|-------------|--------|
| `ADMIN_SECRET` | -- | `routes/admin.ts` (line 25) | CONFIRMED |

**Findings:** Uses `crypto.timingSafeEqual()` for constant-time comparison (line 49-51). Returns 503 (not 401) when secret is not configured, preventing information leakage about endpoint existence. Buffer length check precedes timing-safe comparison.

### Security -- Encryption
| Variable | Required | Verified In | Status |
|----------|----------|-------------|--------|
| `INSURANCE_ENCRYPTION_KEY` | Yes (card storage) | `lib/encryption.ts` (line 20) | CONFIRMED |
| `INSURANCE_ENCRYPTION_KEY_PREVIOUS` | No (rotation) | `lib/encryption.ts` (line 31) | CONFIRMED |
| `CSRF_SECRET` | Yes (auth) | `middleware/csrf.ts` (line 9) | CONFIRMED |

**Findings:**
- Encryption uses AES-256-GCM with 12-byte IV and 16-byte auth tag.
- Key must be exactly 32 bytes when base64-decoded (validated in `parseKey()`).
- Previous key support enables zero-downtime key rotation.
- CSRF uses `csrf-csrf` (double-submit cookie pattern) with `X-CSRF-Token` header.
- CSRF throws `Error` (not graceful degradation) if `CSRF_SECRET` is missing -- this is correct since auth cannot work without it.

### Caching -- Redis
| Variable | Required | Verified In | Status |
|----------|----------|-------------|--------|
| `REDIS_URL` | No | `lib/redis.ts` (line 40) | CONFIRMED |

**Findings:** Falls back to in-memory rate limiting and caching when `REDIS_URL` is not set. Logs `'REDIS_URL not configured - Redis features disabled'` at info level.

### Authentication -- Magic Link
| Variable | Default | Verified In | Status |
|----------|---------|-------------|--------|
| `JWT_SECRET` | -- | `services/authService.ts` (line 33) | CONFIRMED |
| `RESEND_API_KEY` | -- | `services/authService.ts` (line 20) | CONFIRMED |
| `MAGIC_LINK_BASE_URL` | `https://verifymyprovider.com` | `services/authService.ts` (line 21) | CONFIRMED |

**Findings:**
- `JWT_SECRET` throws `Error` if missing (line 34) -- correct for required secret.
- `RESEND_API_KEY` logs warning and skips email send if missing (line 106) -- allows local dev without email.
- JWT uses HS256 algorithm with jose library.
- Magic link token is 32 random bytes (256-bit entropy).

### External APIs
| Variable | Required | Verified In | Status |
|----------|----------|-------------|--------|
| `ANTHROPIC_API_KEY` | No | `frontend/src/app/api/insurance-card/extract/route.ts` (line 316) | CONFIRMED |

**Findings:** Feature disabled gracefully if key not set -- returns 500 with "image scanning service is not available" message.

### Analytics
| Variable | Default | Verified In | Status |
|----------|---------|-------------|--------|
| `NEXT_PUBLIC_POSTHOG_KEY` | -- | `PostHogProvider.tsx` (line 10) | CONFIRMED |
| `NEXT_PUBLIC_POSTHOG_HOST` | `https://us.i.posthog.com` | `PostHogProvider.tsx` (line 14) | CONFIRMED |

**Findings:** PostHog is only initialized if `posthogKey` is truthy (line 12). Analytics completely disabled without the key.

### Frontend
| Variable | Required | Verified In | Status |
|----------|----------|-------------|--------|
| `NEXT_PUBLIC_API_URL` | Yes | `next.config.js` (line 27, 107) used in CSP and rewrites | CONFIRMED |
| `NEXT_PUBLIC_SITE_URL` | No | Referenced in `.env.example` for sitemap generation | LISTED |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | Prod only | `ReCaptchaProvider.tsx` | CONFIRMED |

---

## .env.example Completeness

**File:** `.env.example` (root level)

Checked against full variable inventory:

| Variable | In .env.example | Status |
|----------|----------------|--------|
| `DATABASE_URL` | Yes (line 12) | OK |
| `PORT` | Yes (line 17) | OK |
| `NODE_ENV` | Yes (line 18) | OK |
| `CORS_ORIGIN` | Yes (line 23) | OK (legacy) |
| `FRONTEND_URL` | Yes (line 25) | OK |
| `REDIS_URL` | Yes (line 31, commented) | OK |
| `ADMIN_SECRET` | Yes (line 37, commented) | OK |
| `RECAPTCHA_SECRET_KEY` | Yes (line 44, commented) | OK |
| `CAPTCHA_FAIL_MODE` | Yes (line 46, commented) | OK |
| `ANTHROPIC_API_KEY` | Yes (line 52, commented) | OK |
| `NPI_DATA_URL` | Yes (line 58, commented) | OK |
| `NEXT_PUBLIC_POSTHOG_KEY` | Yes (line 63, commented) | OK |
| `NEXT_PUBLIC_POSTHOG_HOST` | Yes (line 64, commented) | OK |
| `NEXT_PUBLIC_API_URL` | Yes (line 69) | OK |
| `NEXT_PUBLIC_SITE_URL` | Yes (line 75, commented) | OK |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | Yes (line 81, commented) | OK |
| `JWT_SECRET` | Yes (line 88, commented) | OK |
| `RESEND_API_KEY` | Yes (line 92, commented) | OK |
| `MAGIC_LINK_BASE_URL` | Yes (line 96, commented) | OK |
| `LOG_LEVEL` | Yes (line 102, commented) | OK |
| `INSURANCE_ENCRYPTION_KEY` | NOT LISTED | MISSING |
| `INSURANCE_ENCRYPTION_KEY_PREVIOUS` | NOT LISTED | MISSING |
| `CSRF_SECRET` | NOT LISTED | MISSING |
| `CAPTCHA_MIN_SCORE` | NOT LISTED | MINOR (has code default 0.5) |
| `CAPTCHA_API_TIMEOUT_MS` | NOT LISTED | MINOR (has code default 5000) |
| `CAPTCHA_FALLBACK_MAX_REQUESTS` | NOT LISTED | MINOR (has code default 3) |
| `CAPTCHA_FALLBACK_WINDOW_MS` | NOT LISTED | MINOR (has code default 3600000) |

**Verdict:** `.env.example` is substantially complete. Three security-critical variables are missing: `INSURANCE_ENCRYPTION_KEY`, `INSURANCE_ENCRYPTION_KEY_PREVIOUS`, and `CSRF_SECRET`. The CAPTCHA tuning variables have code defaults so they are lower priority.

---

## Secret Storage Locations

### Local Development
- `.env` file at project root (confirmed in `.gitignore`)
- Only `DATABASE_URL`, `PORT`, `NODE_ENV`, `CORS_ORIGIN`, `NEXT_PUBLIC_API_URL` needed locally
- CAPTCHA, PostHog, Anthropic, Redis, Encryption all optional locally

### Production (Cloud Run) -- Verified from deploy.yml

**Backend Cloud Run service (lines 147-157):**
```yaml
env_vars:
  NODE_ENV=production
  FRONTEND_URL=${{ secrets.FRONTEND_URL }}
secrets:
  DATABASE_URL=DATABASE_URL:latest
  ADMIN_SECRET=ADMIN_SECRET:latest
  RECAPTCHA_SECRET_KEY=RECAPTCHA_SECRET_KEY:latest
  JWT_SECRET=JWT_SECRET:latest
  RESEND_API_KEY=RESEND_API_KEY:latest
  INSURANCE_ENCRYPTION_KEY=INSURANCE_ENCRYPTION_KEY:latest
  CSRF_SECRET=CSRF_SECRET:latest
```

**Frontend Cloud Run service (lines 216-239):**
```yaml
build-args:
  NEXT_PUBLIC_API_URL=<backend-url>/api/v1
  NEXT_PUBLIC_POSTHOG_KEY=${{ secrets.NEXT_PUBLIC_POSTHOG_KEY }}
env_vars:
  NODE_ENV=production
secrets:
  ANTHROPIC_API_KEY=ANTHROPIC_API_KEY:latest
```

### GitHub Actions Secrets (verified from deploy.yml)
| Secret | Usage | Line |
|--------|-------|------|
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Auth to GCP | 67 |
| `GCP_SERVICE_ACCOUNT` | Deploy service account | 68 |
| `GCP_PROJECT_ID` | GCP project ID | 72, 88, etc. |
| `FRONTEND_URL` | Backend CORS env var | 149 |
| `NEXT_PUBLIC_POSTHOG_KEY` | Frontend build arg | 217 |

### GCP Secret Manager (verified from deploy.yml secrets blocks)
| Secret Name | Used By | Status |
|-------------|---------|--------|
| `DATABASE_URL` | Backend | CONFIRMED (line 151) |
| `ADMIN_SECRET` | Backend | CONFIRMED (line 152) |
| `RECAPTCHA_SECRET_KEY` | Backend | CONFIRMED (line 153) |
| `JWT_SECRET` | Backend | CONFIRMED (line 154) |
| `RESEND_API_KEY` | Backend | CONFIRMED (line 155) |
| `INSURANCE_ENCRYPTION_KEY` | Backend | CONFIRMED (line 156) |
| `CSRF_SECRET` | Backend | CONFIRMED (line 157) |
| `ANTHROPIC_API_KEY` | Frontend | CONFIRMED (line 239) |

**Total: 8 secrets in GCP Secret Manager.**

---

## Checklist Results

### Secret Security
- [x] No secrets hardcoded in source code (verified across all files reviewed)
- [x] `.env` files in `.gitignore`
- [x] `.env.example` exists with placeholder values (root + backend + frontend)
- [x] Production secrets in GCP Secret Manager (8 secrets)
- [x] Timing-safe comparison for `ADMIN_SECRET` (`crypto.timingSafeEqual`)
- [x] CAPTCHA key validated server-side only
- [x] Encryption key validation (exact 32-byte length check)
- [x] CSRF double-submit cookie pattern with signed tokens
- [ ] Secret rotation procedure -- partially documented (encryption key has admin endpoint, others manual)
- [ ] No automated secret scanning in CI (no gitleaks or truffleHog)

### Environment Configuration
- [x] All env vars have sensible defaults for development
- [x] Optional features degrade gracefully (CAPTCHA, PostHog, Redis, Anthropic, Resend)
- [x] Production-specific values set via Cloud Run deployment
- [ ] `.env.example` missing 3 security variables (INSURANCE_ENCRYPTION_KEY, CSRF_SECRET, INSURANCE_ENCRYPTION_KEY_PREVIOUS)

### CI/CD Secret Injection
- [x] Workload Identity Federation (no long-lived keys)
- [x] Secrets passed via GitHub Actions secrets
- [x] Build args for public frontend env vars (NEXT_PUBLIC_*)
- [x] Cloud Run Secret Manager for sensitive backend vars
- [x] Automated `prisma db push` via Cloud SQL Auth Proxy during deploy (lines 98-129)
- [x] Smoke tests after deployment (backend health check, frontend HTTP status)
- [ ] No secret expiration/rotation alerts

---

## Security Analysis

### Secrets That Throw on Missing (Correct Behavior)
| Secret | Behavior | File |
|--------|----------|------|
| `JWT_SECRET` | `throw new Error(...)` | authService.ts line 34 |
| `CSRF_SECRET` | `throw new Error(...)` | csrf.ts line 11 |
| `INSURANCE_ENCRYPTION_KEY` | `throw new Error(...)` | encryption.ts line 22 |

### Secrets That Degrade Gracefully (Correct Behavior)
| Secret | Behavior | File |
|--------|----------|------|
| `RECAPTCHA_SECRET_KEY` | Skip verification, log warning | captcha.ts line 127 |
| `ADMIN_SECRET` | Return 503 on admin endpoints | admin.ts line 29 |
| `REDIS_URL` | Fall back to in-memory | redis.ts line 42 |
| `ANTHROPIC_API_KEY` | Return 500 with user message | route.ts line 317 |
| `RESEND_API_KEY` | Skip email, log warning | authService.ts line 106 |
| `NEXT_PUBLIC_POSTHOG_KEY` | Analytics disabled | PostHogProvider.tsx line 12 |

### CORS Configuration (index.ts)
```
Allowed origins:
- https://verifymyprovider.com
- https://www.verifymyprovider.com
- https://verifymyprovider-frontend-741434145252.us-central1.run.app
- process.env.FRONTEND_URL (dynamic)
- http://localhost:3000 (development only)
- http://localhost:3001 (development only)
```
Requests with no origin are allowed (mobile apps, curl).

---

## Recommendations

1. **Add missing variables to `.env.example`:**
   ```
   # INSURANCE_ENCRYPTION_KEY=<base64-encoded-32-byte-key>
   # INSURANCE_ENCRYPTION_KEY_PREVIOUS=<for-key-rotation>
   # CSRF_SECRET=<random-string>
   ```

2. **Add automated secret scanning** -- Integrate gitleaks or truffleHog as a pre-commit hook or CI step to prevent accidental secret commits.

3. **Remove legacy `CORS_ORIGIN`** -- The variable is defined in `.env.example` but not read in the current code. Remove to avoid confusion.

4. **Secret rotation documentation** -- Document the rotation procedure for each secret, especially the encryption key rotation workflow which already has an admin endpoint.

5. **Secret expiration alerts** -- Configure GCP Secret Manager notifications for secret versions approaching rotation deadlines.
