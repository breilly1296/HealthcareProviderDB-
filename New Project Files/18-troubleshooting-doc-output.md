# VerifyMyProvider Troubleshooting Guide

**Last Updated:** 2026-04-16
**Scope:** Recurring issues in local development, deployment, and production operation.

Each section follows **Symptom → Cause → Fix → Prevention**.

---

## Table of Contents

1. Development Environment
2. Database & Prisma
3. CI/CD & Deployment
4. Runtime / Production
5. Data Quality & Imports
6. Quick Reference Commands

---

## 1. Development Environment

### 1.1 `next dev` / `next build` fails: "not a valid Win32 application"

**Symptom.** Frontend fails on Windows ARM64 with Node 24+:
```
Error: C:\...\node_modules\next\...\next-swc.win32-arm64-msvc.node is not a valid Win32 application.
```

**Cause.** Next.js 14.x ships native SWC binaries that don't load under Node 24 on `win32-arm64`. Next auto-enables the WASM fallback only for a hardcoded list of triples — and `aarch64-pc-windows-msvc` isn't in it.

**Fix.** The postinstall script `packages/frontend/scripts/patch-next-swc.js` patches `next/dist/build/swc/index.js` to (a) add the ARM64 Windows triple to `knownDefaultWasmFallbackTriples` and (b) remove the `useWasmBinary` gate. It runs automatically after `npm install`.

If the patch doesn't apply (e.g. after a fresh npm install didn't fire postinstall):
```bash
cd packages/frontend
node scripts/patch-next-swc.js
```

**Prevention.** The script is idempotent and safe on non-ARM64 systems. Don't remove it. See MEMORY.md → "Next.js SWC on Windows ARM64 + Node 24".

---

### 1.2 `npm install` hoists a different Next version

**Symptom.** Frontend builds use the wrong Next version; `next/dist/...` paths resolve to unexpected majors.

**Cause.** Someone added `next` (or a version-range conflict) to the **root** `package.json`. npm workspaces hoists the root's version, overriding the frontend's pin (`^14.2.35`).

**Fix.**
1. Remove `next` from root `package.json`.
2. `rm -rf node_modules packages/*/node_modules package-lock.json`
3. `npm install` (at root only).

**Prevention.** Only put dependencies at the root that are truly shared (`prisma`, `@prisma/client`, `pg`, `csv-parse`). Never `next`, `react`, `express`, or `typescript`. See MEMORY.md → "npm Workspaces Hoisting".

---

### 1.3 Native `.node` binaries corrupted by OneDrive

**Symptom.** Random crashes pointing at `*.node` files inside `node_modules`, especially for Prisma query engines or SWC bindings, on a laptop where the repo lives inside OneDrive.

**Cause.** OneDrive's file sync rewrites attributes on binary files. Native `.node` modules are sensitive to this.

**Fix.**
- Exclude `node_modules/` from OneDrive sync on the affected folder (Right-click → Free up space, or OneDrive settings → Exclude).
- Prefer WASM fallbacks where available (the SWC patch above already does this).
- If only one `node_modules` is affected, just delete and re-install:
  ```bash
  rm -rf node_modules packages/*/node_modules
  npm install
  ```

**Prevention.** Move the repo out of OneDrive entirely (`C:\dev\`), or add `node_modules` to OneDrive exclusions once.

---

### 1.4 `npm run dev` can't find the Prisma client

**Symptom.** `@prisma/client did not initialize yet` on backend start.

**Cause.** You ran `npm install` but never ran `prisma generate`. Or the Prisma client was generated against an older schema.

**Fix.**
```bash
npm run db:generate        # runs `prisma generate` in the backend workspace
```

The backend's `build` script also runs `prisma generate` before `tsc`, so `npm run build` fixes it implicitly.

---

### 1.5 Backend port 3001 already in use

**Symptom.** `Error: listen EADDRINUSE: address already in use :::3001`.

**Fix (Windows):**
```bash
netstat -ano | findstr :3001
taskkill /PID <pid> /F
```

**Fix (macOS/Linux):**
```bash
lsof -i :3001
kill -9 <pid>
```

Or set `PORT=3002` in `.env`.

---

## 2. Database & Prisma

### 2.1 `prisma db pull` produced lowercase model names

**Symptom.** Fresh schema from `prisma db pull` gives models like `providers`, `practice_locations`, and breaks all TypeScript imports referencing `Provider` or `PracticeLocation`.

**Cause.** Prisma introspection preserves the Postgres identifier verbatim.

**Fix.** Convention in this repo: rename models to PascalCase and add `@@map("snake_case_table_name")`. Fields get `@map("snake_case_column_name")`. See any existing model in `packages/backend/prisma/schema.prisma` for the pattern.

**Prevention.** Don't commit raw `db pull` output. Always rename before pushing.

---

### 2.2 Cloud SQL + pg: `self signed certificate in certificate chain`

**Symptom.** Scripts that connect via `pg` (not Prisma) fail with TLS errors when `DATABASE_URL` contains `sslmode=require`.

**Cause.** pg v8+ interprets `sslmode=require` in the URL as `verify-full` and rejects Cloud SQL's CA chain.

**Fix.** Use `createPool()` from `scripts/pre-import-check.ts`, which strips `sslmode` from the URL and sets `ssl: { rejectUnauthorized: false }` programmatically. All import/admin scripts already do this.

---

### 2.3 Migration marked as failed in `_prisma_migrations`

**Symptom.** `prisma migrate dev` complains about failed migration, or `prisma migrate status` shows drift.

**Fix.**
- If migration actually applied but the row is marked failed:
  ```sql
  UPDATE _prisma_migrations
  SET finished_at = NOW(), applied_steps_count = 1, logs = NULL
  WHERE migration_name = '...';
  ```
- If you need to baseline pre-existing migrations (as we did in Phase 6):
  ```bash
  npx prisma migrate resolve --applied 20250101000000_baseline
  ```

---

### 2.4 Connection pool exhausted in production (`P2024`)

**Symptom.** Sporadic `503 DATABASE_TIMEOUT` errors.

**Cause.** Cloud Run scaled up; each instance opened its own pool. Cloud SQL tier caps total connections.

**Fix (short-term).** Bump Cloud SQL tier, or lower `DATABASE_URL`'s `connection_limit` so instances × pool ≤ max.

**Fix (long-term).** Deploy PgBouncer between Cloud Run and Cloud SQL, or use the Prisma Data Proxy.

---

## 3. CI/CD & Deployment

### 3.1 GH Actions job fails at `Apply database schema changes`

**Symptom.** `prisma db push --accept-data-loss` errors or hangs.

**Cause.** The Cloud SQL Auth Proxy didn't come up in time, or the migration contains a lock-taking change (e.g. adding a NOT NULL column to a large table).

**Fix.**
- Re-run the workflow; transient proxy timeouts do happen.
- For lock-taking migrations, pre-apply them in a maintenance window via `gcloud sql` or `psql` connected through the proxy manually, then re-run deploy.

**Prevention.** Review schema diffs at PR time (`npx prisma migrate dev --create-only`) — never let `deploy.yml` be the first place a migration is tried.

---

### 3.2 Smoke test fails with 502 right after deploy

**Symptom.** `deploy.yml` shows "health check failed with status 502". Manually hitting the URL a few seconds later returns 200.

**Cause.** Cloud Run cold-start. First request lands before the container finished booting.

**Fix.** The workflow already sleeps 10 s. If this is consistently flaky, bump the sleep to 20 s or implement a retry loop in the smoke step.

---

### 3.3 Rollback workflow errors: "No previous revision found"

**Symptom.** `rollback.yml` with empty `revision` input can't find a prior revision.

**Cause.** Service has only one revision (brand-new service or revisions were pruned).

**Fix.** Either supply an explicit revision name, or restore from a Cloud SQL backup + redeploy from a known-good git SHA:
```bash
gcloud run deploy verifymyprovider-backend \
  --image=us-central1-docker.pkg.dev/.../verifymyprovider-backend:<GOOD_SHA> \
  --region=us-central1
```

---

## 4. Runtime / Production

### 4.1 All `/admin/*` calls return `503 ADMIN_NOT_CONFIGURED`

**Symptom.** Admin endpoints respond 503 no matter what header you send.

**Cause.** `ADMIN_SECRET` env var is not set in the Cloud Run service (or not wired into Secret Manager).

**Fix.**
```bash
echo -n "<random-base64-32-bytes>" | gcloud secrets versions add ADMIN_SECRET --data-file=-
# Then redeploy (or `gcloud run services update`) so the new version is picked up.
```

This is intentional: we'd rather return 503 than accept admin calls unauthenticated.

---

### 4.2 Rate limit header shows `X-RateLimit-Status: degraded`

**Symptom.** Rate limits aren't being enforced across instances.

**Cause.** `REDIS_URL` is not set, or Redis is down, and the middleware is failing open.

**Fix.** Set `REDIS_URL` to a reachable Memorystore instance. The code will auto-detect on next boot and log `Rate limiter using Redis (distributed mode)`.

If Redis goes down mid-traffic, the middleware fails open with a warning log — this is by design (availability > strict limiting). Fix the Redis outage; the middleware will recover without a redeploy.

---

### 4.3 CORS blocked requests from legitimate frontend

**Symptom.** Browser console: `Access to fetch at 'https://api...' from origin '...' has been blocked by CORS policy`.

**Cause.** `ALLOWED_ORIGINS` in `src/index.ts` doesn't include the origin. Logs show `CORS blocked request from origin`.

**Fix.** Add the origin to `ALLOWED_ORIGINS` (or set `FRONTEND_URL` env var in the Cloud Run service — it's appended automatically). Redeploy.

---

### 4.4 `/verify` endpoints constantly return 400 with `CAPTCHA_FAILED`

**Symptom.** Users complain they can't submit verifications.

**Cause.** `RECAPTCHA_SECRET_KEY` is stale/wrong, or the frontend site key is mismatched, or the action name changed.

**Fix.**
- Confirm the secret in Secret Manager matches the Google reCAPTCHA admin console.
- Set `CAPTCHA_FAIL_MODE=open` temporarily to let legitimate traffic through while debugging (falls back to rate limit + honeypot).
- Check logs: `captcha score` < threshold means real bots; a total failure typically logs the Google error code.

---

### 4.5 Prisma P2024 (connection pool timeout)

Covered in 2.4.

---

### 4.6 Graceful shutdown hangs after SIGTERM

**Symptom.** Cloud Run logs show "Graceful shutdown timed out, forcing exit" (`index.ts` prints this at 10 s).

**Cause.** Long-running handler (usually an admin job) didn't finish before SIGTERM window.

**Fix.** Run long-running admin jobs via the dedicated `adminTimeout` (5 min) path, and make sure they checkpoint so they can resume. If you regularly exceed 10 s on shutdown, bump `SHUTDOWN_TIMEOUT_MS` in `src/index.ts`.

---

## 5. Data Quality & Imports

### 5.1 Import conflicts after an NPI refresh

**Symptom.** `scripts/pre-import-check.ts` reports pending `import_conflicts` rows and refuses to proceed.

**Cause.** The NPI re-import detected that NPPES data disagrees with our enriched values (phone, fax, URLs, etc.). The row was protected, and the delta was logged.

**Fix.** Resolve conflicts in the `import_conflicts` table:
- `keep_current` — stay with what's in `providers` / `practice_locations`
- `accept_incoming` — overwrite with NPPES values
- `manual` — mark for human follow-up

Then re-run the import.

See MEMORY.md → "Enrichment Protection (Phase 6)" for the full protocol.

---

### 5.2 City names look duplicated in dropdowns

**Symptom.** "Birmingham", "Birmingham,", "Birmingham,AL", "Birmingam" all show up separately.

**Cause.** NPPES has inconsistent city-name hygiene.

**Fix.** Run `npx tsx scripts/normalize-city-names.ts` after any import. Safe to re-run.

---

### 5.3 Provider profile URLs stale/broken

**Symptom.** 404s when clicking through to an external provider profile.

**Cause.** URLs were verified once, but health-system sites changed. MSK rate-limits validation after ~100 requests; NYU Langone slugs often need middle initials.

**Fix.** See the URL validation progress doc (`url-validation-progress.md`). For active fixes, the `providerProfileUrl`, `profileUrlVerified`, and `profileUrlVerifiedAt` columns track state.

---

## 6. Quick Reference Commands

### Production logs
```bash
gcloud run services logs tail verifymyprovider-backend  --region=us-central1
gcloud run services logs tail verifymyprovider-frontend --region=us-central1
gcloud run services logs read verifymyprovider-backend  --region=us-central1 --limit=100 --format=json | jq .
```

### Filter errors only
```bash
gcloud logging read \
  'resource.type=cloud_run_revision AND severity>=ERROR AND resource.labels.service_name="verifymyprovider-backend"' \
  --limit=50 --format=json
```

### Connect to Cloud SQL from laptop
```bash
cloud-sql-proxy verifymyprovider-prod:us-central1:verifymyprovider-db --port 5432 &
psql "postgresql://<user>:<pass>@127.0.0.1:5432/verifymyprovider"
```

### Re-apply schema manually
```bash
DATABASE_URL="postgresql://...@127.0.0.1:5432/verifymyprovider" \
  npx prisma db push --skip-generate --accept-data-loss
```

### List Cloud Run revisions / rollback
```bash
gcloud run revisions list --service=verifymyprovider-backend --region=us-central1 --limit=5
gcloud run services update-traffic verifymyprovider-backend \
  --region=us-central1 --to-revisions=<revision>=100
```

---

## Related Docs

- Known issues register → `20-known-issues-doc-output.md`
- Deployment steps → `15-deployment-guide-output.md`
- Dev workflow → `24-development-workflow-output.md`
- Error handling in code → prompt `37-error-handling.md`
