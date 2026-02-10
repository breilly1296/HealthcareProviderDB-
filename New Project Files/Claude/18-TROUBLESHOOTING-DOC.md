# Troubleshooting Guide - VerifyMyProvider

## Overview

This guide covers known issues, workarounds, and diagnostic steps for the VerifyMyProvider development and deployment environment. Many issues stem from the specific combination of Windows ARM64, OneDrive file sync, and npm workspaces.

---

## Next.js SWC on Windows ARM64 + Node 24

### Problem

Next.js 14.x ships native SWC binaries for compilation. On Windows ARM64 running Node.js v24+, the native binary fails with:

```
Error: %1 is not a valid Win32 application
```

This occurs despite the binary being a valid PE32+ ARM64 executable. The root cause is that Next.js 14.x only auto-enables its WASM fallback for a hardcoded list of platforms, and `win32-arm64` is NOT in that list.

### Solution

A postinstall patch script at `packages/frontend/scripts/patch-next-swc.js` automates the fix:

1. Opens `next/dist/build/swc/index.js`
2. Adds `aarch64-pc-windows-msvc` to the `knownDefaultWasmFallbackTriples` array
3. Removes the `useWasmBinary` gate so WASM fallback is always available

The script runs automatically via the `postinstall` hook in `packages/frontend/package.json`.

### Manual Fix (if postinstall fails)

1. Open `node_modules/next/dist/build/swc/index.js`
2. Search for `knownDefaultWasmFallbackTriples`
3. Add `"aarch64-pc-windows-msvc"` to the array
4. Search for the `useWasmBinary` conditional and remove the gate

### Verification

After patching, run `npx next info` from the frontend workspace to confirm WASM fallback is active:

```bash
cd packages/frontend
npx next info
```

---

## OneDrive + node_modules Corruption

### Problem

OneDrive file synchronization can corrupt native `.node` binary files inside `node_modules`. Symptoms include:

- Random `ENOENT` errors on files that exist
- Binary files that suddenly fail to load
- Intermittent build failures that resolve after reinstalling

### Solution

- WASM fallbacks are more reliable than native binaries on OneDrive-synced projects
- The SWC WASM patch described above also mitigates this class of issue
- Consider adding `node_modules` to OneDrive's exclusion list if persistent problems occur

### How to Exclude node_modules from OneDrive

1. Right-click the OneDrive icon in the system tray
2. Go to Settings > Account > Choose folders
3. Deselect the project's `node_modules` directories

Alternatively, you can mark folders as "Always keep on this device" to prevent OneDrive from managing them.

---

## npm Workspaces Hoisting

### Problem

The monorepo uses npm workspaces with three packages: `packages/backend`, `packages/frontend`, and `packages/shared`. A common mistake is adding `next` to the root `package.json`, which causes version conflicts.

**What happened:** Root had `next@^16.1.1` while frontend had `next@^14.2.35`. npm hoisting resolved to the root version, causing SWC version mismatches and build failures.

### Rule

**NEVER put `next` in the root `package.json`.** Only shared dependencies belong at root (e.g., `prisma`, `csv-parse`, `pg`). Framework-specific dependencies must stay in their respective workspace.

### Diagnosis

If you see unexpected Next.js version errors:

```bash
# Check which version is resolved
npm ls next

# Check for duplicate installations
npm ls next --all
```

### Fix

1. Remove `next` from root `package.json` if present
2. Run `npm install` from the project root to re-resolve the dependency tree
3. Verify: `npm ls next` should show only the frontend workspace version

---

## Prisma Schema Conventions

### Problem

Running `prisma db pull` (introspection) generates raw lowercase model names from PostgreSQL tables. This produces models like `provider_cms_details` instead of `ProviderCmsDetails`, which breaks TypeScript conventions.

### Solution

After every `prisma db pull`, manually apply these conventions:

| Convention | Before (generated) | After (corrected) |
|---|---|---|
| Model names | `model provider_cms_details` | `model ProviderCmsDetails` with `@@map("provider_cms_details")` |
| Field names | `first_name` | `firstName` with `@map("first_name")` |
| Relations | Auto-generated names | Meaningful names matching TypeScript conventions |

### Workflow

1. Run `prisma db pull` to sync schema with database
2. Rename models to PascalCase, add `@@map("original_table_name")`
3. Rename fields to camelCase, add `@map("original_column_name")`
4. Run `prisma generate` to regenerate the Prisma Client
5. Verify the application compiles without errors

---

## Cloud SQL Connection

### Local Development

Local connections use `DATABASE_URL` from the `.env` file in `packages/backend`:

```
DATABASE_URL="postgresql://username:password@cloud-sql-ip:5432/verifymyprovider"
```

Ensure the Cloud SQL instance has your local IP whitelisted in the authorized networks, or use the Cloud SQL Auth Proxy.

### Cloud Run Deployment

Cloud Run connects via the built-in Cloud SQL proxy using Unix socket:

```
DATABASE_URL="postgresql://username:password@/verifymyprovider?host=/cloudsql/project:region:instance"
```

The Cloud Run service is configured with the `--add-cloudsql-instances` flag, which automatically mounts the proxy socket.

### Diagnosis

If database connections fail:

```bash
# Check if Cloud SQL instance is running
gcloud sql instances describe <instance-name> --format="value(state)"

# Test connectivity from Cloud Run logs
gcloud run logs read --service verifymyprovider --limit 50

# Verify the database exists
gcloud sql databases list --instance=<instance-name>
```

---

## Locations Route

### Status

The Locations route is **active** with 5 endpoints. It uses the `practice_locations` table (not the old `Location` model which has been replaced).

### Endpoints

1. `GET /api/locations/search` -- Search practice locations
2. `GET /api/locations/health-systems` -- List health systems
3. `GET /api/locations/stats/:state` -- Location statistics by state
4. `GET /api/locations/:locationId` -- Single location details
5. `GET /api/locations/:locationId/providers` -- Providers at a location

### Common Confusion

The codebase previously had a separate `Location` model that has been superseded by `practice_locations`. Some admin endpoints (like location enrichment) still reference the old model and are disabled. The public-facing location routes all work correctly against `practice_locations`.

---

## ADMIN_SECRET Not Configured Returns 503

### Behavior

If the `ADMIN_SECRET` environment variable is not set, all admin endpoints return:

```json
{
  "error": "Admin functionality not available"
}
```

**HTTP Status:** `503 Service Unavailable`

### This Is Intentional

This is a deliberate security design -- admin functionality is completely disabled until an administrator explicitly configures the secret. This prevents accidental exposure of admin endpoints in environments where the secret has not been set up.

### Fix

Set the `ADMIN_SECRET` environment variable:

- **Local:** Add `ADMIN_SECRET=your-secret-here` to `packages/backend/.env`
- **Cloud Run:** Set via `gcloud run services update` or in the Cloud Run console under environment variables

### Calling Admin Endpoints

```bash
curl -H "X-Admin-Secret: your-secret-here" https://your-api-url/api/admin/health
```

---

## Quick Diagnostic Checklist

| Symptom | Likely Cause | Fix |
|---|---|---|
| "not a valid Win32 application" | SWC ARM64 incompatibility | Run postinstall patch script |
| Intermittent `ENOENT` on node_modules | OneDrive sync corruption | Exclude node_modules from OneDrive |
| Wrong Next.js version resolved | `next` in root package.json | Remove from root, `npm install` |
| Prisma Client type errors after db pull | Lowercase model names | Apply PascalCase + `@@map` conventions |
| Database connection refused locally | IP not whitelisted in Cloud SQL | Add IP to authorized networks |
| Admin endpoints return 503 | `ADMIN_SECRET` not configured | Set the environment variable |
| Location enrichment not working | References old Location model | Known issue -- enrichment disabled in admin.ts |
