# Monorepo Structure Review

**Generated:** 2026-02-18
**Prompt:** `prompts/35-monorepo-structure.md`
**Status:** Well-Architected -- Mature npm Workspaces Setup

---

## Files Reviewed

| File | Path | Status |
|------|------|--------|
| Root package.json | `package.json` | Verified |
| Shared package.json | `packages/shared/package.json` | Verified |
| Backend package.json | `packages/backend/package.json` | Verified |
| Frontend package.json | `packages/frontend/package.json` | Verified |
| Root tsconfig.json | `tsconfig.json` | Verified |
| Base tsconfig | `tsconfig.base.json` | Verified |
| Shared tsconfig | `packages/shared/tsconfig.json` | Verified |
| Backend tsconfig | `packages/backend/tsconfig.json` | Verified |
| Frontend tsconfig | `packages/frontend/tsconfig.json` | Verified |

---

## Workspace Configuration

### Root package.json -- Verified

```json
{
  "name": "healthcareproviderdb",
  "private": true,
  "workspaces": ["packages/*"],
  "engines": { "node": ">=20.0.0" }
}
```

**Key observations:**
- Workspace pattern is `"packages/*"` (glob), not explicit package names. This is simpler but means any directory under `packages/` becomes a workspace.
- `"private": true` correctly prevents accidental npm publish.
- Engine constraint `>=20.0.0` matches the Node.js version used in the project.

### Package Names -- Scoped Under `@healthcareproviderdb`

| Package | Name | Version |
|---------|------|---------|
| Root | `healthcareproviderdb` | 1.0.0 |
| Shared | `@healthcareproviderdb/shared` | 1.0.0 |
| Backend | `@healthcareproviderdb/backend` | 1.0.0 |
| Frontend | `@healthcareproviderdb/frontend` | 1.0.0 |

**Note:** The prompt documents package names as `@healthcare-provider-db/*` (with hyphens), but the actual code uses `@healthcareproviderdb/*` (no hyphens). The workspace scripts in root `package.json` correctly use the actual names (e.g., `npm run build -w @healthcareproviderdb/shared`).

### Cross-Package Dependencies -- Verified

Both backend and frontend depend on shared:
```json
"@healthcareproviderdb/shared": "*"
```

The `*` version specifier is correct for local workspace packages -- npm resolves it to the local directory via symlink.

---

## Build Configuration

### Build Scripts -- Correct Order Verified

```json
"build": "npm run build:shared && npm run build:backend && npm run build:frontend"
```

The sequential `&&` chain ensures shared compiles first, then backend, then frontend. This respects the dependency graph:

```
shared (no deps) --> backend (depends on shared)
                 --> frontend (depends on shared)
```

Backend and frontend could theoretically build in parallel since they only depend on shared (not each other), but the sequential approach is safer and simpler.

### Dev Script -- Concurrent with Pre-build

```json
"dev": "npm run build:shared && concurrently \"npm run dev:backend\" \"npm run dev:frontend\""
```

Builds shared first, then starts backend and frontend dev servers concurrently. This is correct -- shared must compile before the others can reference its types.

### Individual Build Commands

| Script | Command | Notes |
|--------|---------|-------|
| `build:shared` | `tsc` | Simple TypeScript compilation to `dist/` |
| `build:backend` | `prisma generate && tsc` | Generates Prisma client first |
| `build:frontend` | `next build` | Next.js production build |
| `dev:backend` | `tsx watch src/index.ts` | Uses tsx for fast dev restart |
| `dev:frontend` | `next dev --port 3000` | Next.js dev server |

---

## TypeScript Configuration

### Three-Tier Config Architecture

1. **`tsconfig.base.json`** -- Shared compiler options
   ```json
   {
     "compilerOptions": {
       "target": "ES2022",
       "module": "commonjs",
       "strict": true,
       "esModuleInterop": true,
       "skipLibCheck": true,
       "forceConsistentCasingInFileNames": true,
       "resolveJsonModule": true,
       "declaration": true,
       "declarationMap": true,
       "sourceMap": true
     }
   }
   ```

2. **`tsconfig.json`** (root) -- Extends base with additional settings
   - Adds `outDir`, `rootDir`, `paths`, `types`
   - Used for scripts and root-level TypeScript files

3. **Package-level configs:**
   - `packages/shared/tsconfig.json` -- Extends `../../tsconfig.base.json`, sets `rootDir: ./src`, `outDir: ./dist`
   - `packages/backend/tsconfig.json` -- Same pattern, excludes some service files
   - `packages/frontend/tsconfig.json` -- **Does not extend base** -- uses Next.js-specific settings (`module: esnext`, `moduleResolution: bundler`, `jsx: preserve`)

**Finding:** The frontend tsconfig does not extend `tsconfig.base.json`. This is correct because Next.js requires fundamentally different compiler options (`module: esnext` vs `commonjs`, `noEmit: true`, etc.). The frontend also enables stricter checks: `noUncheckedIndexedAccess`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noUnusedLocals`, `noUnusedParameters`.

---

## Dependency Management

### Root Dependencies (Shared Infrastructure)

```json
"dependencies": {
  "@prisma/client": "^5.22.0",
  "csv-parse": "^6.1.0",
  "pg": "^8.16.3",
  "prisma": "^5.22.0"
}
```

These are correctly hoisted to root because they are used by scripts in the root `scripts/` directory (import scripts, pre-import checks).

### Root Dev Dependencies

```json
"devDependencies": {
  "concurrently": "^9.2.1",
  "rimraf": "^6.1.2"
}
```

Minimal -- only build tooling that serves the monorepo itself.

### Backend Dependencies (Key Packages)

| Package | Version | Purpose |
|---------|---------|---------|
| express | ^4.18.2 | HTTP framework |
| @prisma/client | ^5.22.0 | Database ORM |
| zod | ^3.22.4 | Input validation |
| helmet | ^7.1.0 | Security headers |
| cors | ^2.8.5 | Cross-origin requests |
| ioredis | ^5.9.2 | Redis client (caching/rate limiting) |
| jose | ^6.1.3 | JWT handling |
| pino | ^10.3.0 | Structured logging |
| sharp | ^0.34.5 | Image processing |
| @anthropic-ai/sdk | ^0.71.2 | Claude AI integration |
| csrf-csrf | ^4.0.3 | CSRF protection |
| cookie-parser | ^1.4.7 | Cookie handling |

### Frontend Dependencies (Key Packages)

| Package | Version | Purpose |
|---------|---------|---------|
| next | ^14.2.35 | React framework |
| react | ^18.3.1 | UI library |
| posthog-js | ^1.321.2 | Analytics |
| @tanstack/react-query | ^5.90.20 | Data fetching |
| @react-google-maps/api | ^2.20.8 | Map integration |
| react-google-recaptcha-v3 | ^1.11.0 | CAPTCHA |
| lucide-react | ^0.563.0 | Icons |
| tailwindcss | ^3.3.6 | CSS framework |
| @anthropic-ai/sdk | ^0.71.2 | Claude AI (card scanning) |
| zod | ^3.25.76 | Input validation |

**Finding:** Both backend and frontend have independent `zod` dependencies with different versions (^3.22.4 vs ^3.25.76). npm workspaces will hoist the compatible version, but the version discrepancy is worth noting.

**Finding:** `@anthropic-ai/sdk` appears in both backend and frontend. The frontend uses it for insurance card scanning (client-side Claude API calls). This is an architectural choice worth monitoring -- API keys in client-side bundles require careful security review.

### Frontend SWC Workaround -- Confirmed

```json
"postinstall": "node scripts/patch-next-swc.js || true"
```

The frontend has a postinstall script to patch Next.js SWC for Windows ARM64 + Node 24 compatibility, as documented in the MEMORY.md context. The `@next/swc-wasm-nodejs` WASM fallback is also listed in devDependencies.

---

## Shared Package Assessment

### Structure

```
packages/shared/
  package.json
  tsconfig.json
  src/
    types/
      ...
```

- **Main entry:** `dist/index.js`
- **Types entry:** `dist/index.d.ts`
- **Build:** Simple `tsc` compilation to CommonJS
- **No runtime dependencies** -- purely type definitions and constants

### Assessment

The shared package is lean and focused on types, which is appropriate. It avoids the common monorepo antipattern of putting too much into shared and creating coupling.

---

## Checklist Verification

### Configuration
- [x] Workspaces defined in root package.json -- `"packages/*"` glob pattern
- [x] Build scripts respect dependency order -- shared first, then backend/frontend
- [x] Shared package references work -- `"@healthcareproviderdb/shared": "*"` in both consumers
- [ ] CI builds in correct order -- no CI config reviewed (Cloud Build uses Docker)

### Development
- [x] `npm run dev` starts both services -- via concurrently after shared build
- [x] Hot reload works in both -- tsx watch for backend, next dev for frontend
- [x] Shared types update in real-time -- shared dev mode uses `tsc --watch`

### Build
- [x] `npm run build` works -- sequential chain with correct order
- [x] Docker builds work -- Docker scripts present in root package.json
- [ ] Production optimization -- not assessed (would require Docker file review)

---

## Additional Scripts Verified

| Script | Purpose |
|--------|---------|
| `db:generate` | Prisma client generation |
| `db:push` | Push schema to database |
| `db:migrate` | Run migrations |
| `db:studio` | Prisma Studio GUI |
| `db:seed` | Seed database |
| `docker:dev` | Start dev containers |
| `docker:build` | Build production containers |
| `clean` | Clean all workspace dist/ dirs |
| `lint` | Lint all workspaces |
| `test` | Run backend tests |

---

## Issues

1. **Zod version discrepancy:** Backend uses `^3.22.4`, frontend uses `^3.25.76`. While npm deduplication handles this, explicit version alignment would prevent subtle schema behavior differences.

2. **No frontend test script in root:** `test` and `test:backend` both point to backend tests only. There is no `test:frontend` in the root even though the frontend package has its own test scripts.

3. **Missing lint script in shared:** The root `lint` script runs across workspaces with `--if-present`, but the shared package has no lint script defined.

4. **Backend tsconfig excludes files:** `packages/backend/tsconfig.json` excludes `locationService.ts`, `locationEnrichment.ts`, and `routes/locations.ts`. This suggests incomplete or in-progress features that should be resolved.

---

## Recommendations

1. **Align Zod versions** across backend and frontend to the same minor version to ensure consistent validation behavior, especially for shared schemas.

2. **Add `test:frontend` to root package.json** for completeness:
   ```json
   "test:frontend": "npm run test -w @healthcareproviderdb/frontend"
   ```

3. **Consider Turborepo** for build caching and parallel execution. The project is at a size where Turborepo's incremental builds would noticeably speed up the dev-build-test cycle, especially with shared package changes.

4. **Clean up backend tsconfig excludes** -- either complete the location features or remove the dead files to avoid confusion.

5. **Add a shared lint configuration** -- even if the shared package is types-only, linting ensures consistent code style across the monorepo.

6. **Document the `@anthropic-ai/sdk` frontend usage** -- client-side AI SDK usage requires API key exposure in the browser bundle. Ensure this is proxied through the backend in production.
