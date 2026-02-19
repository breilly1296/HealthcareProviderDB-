# VerifyMyProvider Development Workflow

**Last Updated:** 2026-02-18

---

## Golden Rule

**ALL code changes happen in Claude Code (local machine) -> Push to GitHub -> Auto-deploys to GCP**

Never edit code in Google Cloud Shell. It is a dead end -- changes do not persist, do not trigger auto-deploy, and cannot be version controlled.

---

## What Each Tool Is For

### Claude Code (Local Machine)

**USE FOR:**
- Writing and editing all application code (backend, frontend, shared)
- Bug fixes and feature development
- Running local tests (`npm test`, `npm run dev`)
- Git operations (commit, push, branch, merge)
- Database schema changes (Prisma migrations)
- Running data scripts (NPI imports, enrichment, quality checks)
- Reviewing and understanding codebase

**NEVER USE FOR:**
- Nothing -- Claude Code is the primary development tool for all code changes

### Google Cloud Shell / gcloud CLI

**USE FOR:**
- Database queries (connecting to Cloud SQL via `psql`)
- Checking Cloud Run service logs
- GCP infrastructure management (Cloud Run config, secrets, IAM)
- Cloud Scheduler setup and management
- One-off admin tasks (cache clear, confidence recalculation)
- Viewing deployment status and revisions

**NEVER USE FOR:**
- Editing application code
- Making bug fixes that need to deploy
- Any change that should be tracked in version control

---

## Development Flow

```
┌──────────────┐    git push    ┌──────────────┐   auto-deploy   ┌──────────────┐
│  Claude Code │ ─────────────► │    GitHub     │ ──────────────► │   GCP Cloud  │
│  (Windows)   │                │  Repository   │                 │   Run        │
│              │                │              │                  │              │
│  Edit code   │                │  Source of    │                 │  Backend:    │
│  Run tests   │                │  truth        │                 │  3001        │
│  Git commit  │                │              │                  │  Frontend:   │
│              │                │              │                  │  3000        │
└──────────────┘                └──────────────┘                  └──────────────┘
                                                                        │
                                                                        ▼
                                                                 ┌──────────────┐
                                                                 │  Cloud SQL   │
                                                                 │  PostgreSQL  │
                                                                 │              │
                                                                 │  verifymyprovider │
                                                                 └──────────────┘
```

---

## Project Structure

```
HealthcareProviderDB/               (monorepo root)
├── packages/
│   ├── backend/                    Express + Prisma + PostgreSQL
│   │   ├── src/
│   │   │   ├── config/             Constants (timeouts, thresholds)
│   │   │   ├── lib/                Prisma client, Redis, encryption
│   │   │   ├── middleware/         Auth, CAPTCHA, CORS, rate limiting, errors
│   │   │   ├── routes/             API route handlers
│   │   │   ├── schemas/            Zod validation schemas
│   │   │   ├── services/           Business logic
│   │   │   └── utils/              Logger, cache, response helpers
│   │   └── prisma/
│   │       └── schema.prisma       Database schema (20 models)
│   ├── frontend/                   Next.js 14.2 + React 18 + TailwindCSS
│   │   └── src/
│   │       ├── app/                Next.js App Router pages
│   │       ├── components/         React components
│   │       ├── hooks/              Custom hooks (useCaptcha, etc.)
│   │       └── lib/                API client, utilities
│   └── shared/                     Shared types and utilities
├── scripts/                        Data import, enrichment, quality scripts
├── docs/                           Operations docs, runbook, scaling guide
└── prompts/                        Claude Code prompt library
```

---

## Common Tasks

### Fix a Bug

1. **Identify the problem** -- Check logs, reproduce locally
2. **Find the relevant file** -- Use Claude Code to search codebase
3. **Make the fix** -- Edit the file(s) in Claude Code
4. **Test locally** -- `npm run dev` for manual testing, `npm test` for automated tests
5. **Commit and push:**
   ```bash
   git add <files>
   git commit -m "Fix: description of what was fixed"
   git push
   ```
6. **Verify deployment** -- Check Cloud Run logs to confirm new revision is serving
7. **Time to live:** ~2-5 minutes after push (Cloud Build + Cloud Run deployment)

### Add a Feature

1. **Plan the feature** -- Identify affected files (routes, services, frontend components)
2. **Database changes (if needed):**
   - Update `packages/backend/prisma/schema.prisma`
   - Run `npx prisma migrate dev --name descriptive-name`
   - Apply to production: `npx prisma migrate deploy`
3. **Backend changes:**
   - Add/modify route in `packages/backend/src/routes/`
   - Add/modify service in `packages/backend/src/services/`
   - Add Zod validation schema
   - Add rate limiting if endpoint is write-capable
4. **Frontend changes:**
   - Add/modify components in `packages/frontend/src/components/`
   - Add/modify pages in `packages/frontend/src/app/`
5. **Test, commit, push** (same as bug fix flow)

### Run Database Queries

**Via Cloud Shell (production):**
```bash
gcloud sql connect verifymyprovider --user=postgres
# Password: stored in Proton Pass under "VerifyMyProvider GCP"
```

**Via local scripts:**
```bash
# Set DATABASE_URL in .env, then:
npx tsx scripts/verify-data-quality.ts
npx tsx scripts/check-import-status.ts
```

**Common queries:**
```sql
-- Count providers by state
SELECT state, COUNT(*) FROM practice_locations GROUP BY state ORDER BY count DESC;

-- Check enrichment status
SELECT data_source, COUNT(*) FROM practice_locations GROUP BY data_source;

-- Check pending import conflicts
SELECT resolution, COUNT(*) FROM import_conflicts GROUP BY resolution;

-- Check verification stats
SELECT COUNT(*) as total,
       COUNT(CASE WHEN expires_at > NOW() THEN 1 END) as active
FROM verification_logs;
```

### Check Deployment Status

1. **GitHub:** Check if push triggered a build (repository actions/builds)
2. **GCP Console:**
   ```bash
   # List Cloud Run services
   gcloud run services list

   # Check latest revision
   gcloud run revisions list --service=verifymyprovider-backend
   gcloud run revisions list --service=verifymyprovider-frontend
   ```

### View Logs

```bash
# Backend logs (last 100 lines)
gcloud run services logs read verifymyprovider-backend --limit=100

# Frontend logs
gcloud run services logs read verifymyprovider-frontend --limit=100

# Filter for errors only
gcloud run services logs read verifymyprovider-backend --limit=50 | grep -i error

# Tail logs in real-time
gcloud run services logs tail verifymyprovider-backend
```

---

## Quick Reference

| Task | Tool | Command/Action |
|------|------|----------------|
| Edit code | Claude Code | Direct file editing |
| Run backend locally | Claude Code | `npm run dev:backend` |
| Run frontend locally | Claude Code | `npm run dev:frontend` |
| Run both locally | Claude Code | `npm run dev` |
| Run tests | Claude Code | `npm test` |
| Generate Prisma client | Claude Code | `npm run db:generate` |
| Run migration | Claude Code | `npm run db:migrate` |
| View DB in browser | Claude Code | `npm run db:studio` |
| Connect to prod DB | Cloud Shell | `gcloud sql connect verifymyprovider --user=postgres` |
| View backend logs | Cloud Shell | `gcloud run services logs read verifymyprovider-backend` |
| Clear cache | API call | `POST /api/v1/admin/cache/clear` with `X-Admin-Secret` header |
| Cleanup expired data | API call | `POST /api/v1/admin/cleanup-expired` with `X-Admin-Secret` header |
| Run data import | Claude Code | `npx tsx scripts/import-npi.ts` |
| Run quality check | Claude Code | `npx tsx scripts/verify-data-quality.ts` |
| Pre-import safety check | Claude Code | `npx tsx scripts/pre-import-check.ts` |

---

## URLs

- **Frontend (Production):** https://verifymyprovider.com
- **Backend (Production):** https://verifymyprovider-backend-[hash].us-central1.run.app
- **Frontend (Cloud Run):** https://verifymyprovider-frontend-741434145252.us-central1.run.app
- **GitHub:** https://github.com/breilly1296/HealthcareProviderDB-
- **GCP Console:** https://console.cloud.google.com (project: verifymyprovider)

---

## Credentials (Proton Pass: "VerifyMyProvider GCP")

- **Database password:** Stored in Proton Pass (never hardcode)
- **GCP Project ID:** Referenced in Cloud Run service configs
- **ADMIN_SECRET:** Stored in GCP Secret Manager (for admin API endpoints)
- **RECAPTCHA_SECRET_KEY:** Stored in GCP Secret Manager
- **JWT_SECRET:** Stored in GCP Secret Manager
- **CSRF_SECRET:** Stored in GCP Secret Manager
- **INSURANCE_ENCRYPTION_KEY:** Stored in GCP Secret Manager (AES-256-GCM)

---

## Environment Variables

### Backend (Required in Production)

| Variable | Purpose | Source |
|----------|---------|--------|
| `DATABASE_URL` | PostgreSQL connection string | GCP Secret Manager |
| `ADMIN_SECRET` | Admin endpoint authentication | GCP Secret Manager |
| `RECAPTCHA_SECRET_KEY` | Google reCAPTCHA v3 | GCP Secret Manager |
| `JWT_SECRET` | JWT signing for auth tokens | GCP Secret Manager |
| `CSRF_SECRET` | CSRF double-submit cookie | GCP Secret Manager |
| `INSURANCE_ENCRYPTION_KEY` | AES-256-GCM encryption key | GCP Secret Manager |
| `REDIS_URL` | Redis for distributed rate limiting | GCP Secret Manager |
| `FRONTEND_URL` | CORS allowed origin | Cloud Run config |
| `NODE_ENV` | Environment mode | Cloud Run config |
| `PORT` | Server port (default: 3001) | Cloud Run config |

### Frontend (Required in Production)

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_API_URL` | Backend API base URL |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | reCAPTCHA v3 site key (public) |
| `NEXT_PUBLIC_POSTHOG_KEY` | PostHog analytics |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Google Maps for provider map |

---

## Emergency Procedures

### Something Broke in Production

1. **Check logs immediately:**
   ```bash
   gcloud run services logs read verifymyprovider-backend --limit=50
   ```
2. **Identify the issue:** Look for error patterns, stack traces, or timeout messages
3. **If it is a code bug:** Fix locally, test, push (auto-deploys in ~3-5 minutes)
4. **If it is infrastructure:** Check Cloud SQL status, Redis connectivity, Secret Manager access

### Need to Rollback

```bash
# List recent revisions
gcloud run revisions list --service=verifymyprovider-backend

# Route traffic to a previous revision
gcloud run services update-traffic verifymyprovider-backend \
  --to-revisions=REVISION_NAME=100
```

### Database Connection Lost

1. Check Cloud SQL instance status in GCP Console
2. Verify authorized networks include Cloud Run's egress IP
3. Check if SSL configuration changed (see `createPool()` in `scripts/pre-import-check.ts` for SSL fix)
4. Verify `DATABASE_URL` secret has not been rotated without updating Cloud Run

### Cache Issues

```bash
# Clear all caches via admin API
curl -X POST https://[backend-url]/api/v1/admin/cache/clear \
  -H "X-Admin-Secret: [secret]"
```

---

## Workspace Architecture Notes

- **npm workspaces:** Root `package.json` manages `packages/*`
- **NEVER** put `next` in root `package.json` -- it overrides the frontend workspace version
- Root dependencies: Only shared deps (prisma, csv-parse, pg)
- Backend dependencies: Express, middleware libraries, Prisma
- Frontend dependencies: Next.js 14.2, React 18, TailwindCSS
- **OneDrive caveat:** Native `.node` binaries can be corrupted by OneDrive sync. WASM fallbacks are more reliable. The frontend has a `postinstall` script to patch Next.js SWC for Windows ARM64.

---

## Development Tips

1. **Use `tsx` for scripts:** All scripts in `scripts/` use `npx tsx` for TypeScript execution without compilation
2. **Prisma schema changes:** Always run `npx prisma generate` after editing `schema.prisma`
3. **Test CAPTCHA locally:** CAPTCHA is skipped in development mode (`NODE_ENV=development`)
4. **Test auth locally:** Set `JWT_SECRET` in `.env` to enable local auth testing
5. **pg SSL fix:** When connecting to Cloud SQL locally, use `createPool()` from `scripts/pre-import-check.ts` -- it strips `sslmode` from the URL and sets `ssl: { rejectUnauthorized: false }`
