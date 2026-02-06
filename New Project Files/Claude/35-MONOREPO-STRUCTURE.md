# Monorepo Structure

**Last Updated:** 2026-02-06
**Tool:** npm workspaces

## Packages

| Package | Name | Purpose | Dependencies |
|---------|------|---------|--------------|
| shared | `@healthcareproviderdb/shared` | Types and enums | None |
| backend | `@healthcareproviderdb/backend` | Express.js API | shared, prisma, express, zod, pino, ioredis, helmet, cors |
| frontend | `@healthcareproviderdb/frontend` | Next.js 14.2 web app | shared, next, react, posthog-js, @tanstack/react-query, @anthropic-ai/sdk, zod |

## Actual Root package.json Analysis

The root `package.json` uses:
- **Name**: `healthcareproviderdb` (not `healthcare-provider-db` as in the prompt)
- **Workspaces**: `"packages/*"` (glob pattern, not explicit list)
- **Root dependencies**: `@prisma/client`, `csv-parse`, `pg`, `prisma` -- shared tooling for database operations
- **Root devDependencies**: `concurrently`, `@types/pg`
- **Node engine**: `>=20.0.0`
- **Private**: `true` (correct for monorepo root)

### Workspace Package Names
- Shared: `@healthcareproviderdb/shared`
- Backend: `@healthcareproviderdb/backend`
- Frontend: `@healthcareproviderdb/frontend`

Both backend and frontend reference shared via: `"@healthcareproviderdb/shared": "*"`

## Build Order

1. **shared** (no internal dependencies) -- `tsc` compilation
2. **backend** (depends on shared) -- `tsc` compilation
3. **frontend** (depends on shared) -- `next build`

The root `dev` script correctly builds shared first: `npm run build:shared && concurrently "npm run dev:backend" "npm run dev:frontend"`

The root `build` script uses `npm run build --workspaces` which relies on npm workspace ordering. This may not guarantee correct build order since npm processes workspaces in the order they appear in `packages/*` glob (alphabetical: backend, frontend, shared). **This is a potential issue** -- backend/frontend could build before shared.

The individual `build:*` scripts do target specific workspaces correctly: `build:shared` -> `build:backend` -> `build:frontend`.

## Shared Package Analysis

### Structure
```
packages/shared/src/
  index.ts          -- Re-exports all types
  types/
    index.ts        -- Re-exports from all type modules
    enums.ts        -- EntityType, PlanType, AcceptanceStatus, etc. (11 enums)
    provider.ts     -- Provider, ProviderSearchFilters, etc. + getProviderDisplayName()
    insurance-plan.ts -- InsurancePlan, InsurancePlanSearchFilters, etc.
    provider-plan-acceptance.ts -- ProviderPlanAcceptance, ConfidenceDetails, etc. + getConfidenceLevel()
    verification.ts -- VerificationLog, SubmitVerificationInput, etc. + calculateVerificationScore()
```

### Size Assessment
- 7 TypeScript files total
- Contains types/interfaces AND utility functions (getProviderDisplayName, getConfidenceLevel, calculateVerificationScore, isVerificationTrustworthy)
- Estimated compiled output: small -- well under 50KB
- **Not too large**: The package is appropriately scoped for its purpose

### Package Configuration
- **main**: `dist/index.js` (CommonJS output)
- **types**: `dist/index.d.ts`
- **tsconfig**: Targets ES2022, outputs CommonJS, rootDir is `./src`
- **Build**: Simple `tsc` compilation
- **Clean script**: `rm -rf dist` (Unix-only -- will fail on Windows CMD)

## TypeScript Configuration Analysis

### Root tsconfig.json
- Target: ES2022
- Module: commonjs
- Strict: true
- Includes: `src/**/*`, `scripts/**/*`
- Has `paths` mapping: `@/* -> src/*`
- Has `types: ["node", "jest"]`

### Shared tsconfig.json
- Standalone config (does NOT extend root)
- Target: ES2022, Module: commonjs
- rootDir: `./src`, outDir: `./dist`
- Generates declaration and source maps

### Backend tsconfig.json
- Standalone config (does NOT extend root)
- Target: ES2022, Module: commonjs
- rootDir: `./src`, outDir: `./dist`
- Excludes location-related services: `locationService.ts`, `locationEnrichment.ts`, `routes/locations.ts`
- No declaration map generation

### Frontend tsconfig.json
- Not inspected directly (Next.js typically generates its own)

**Finding**: None of the per-package tsconfigs extend the root tsconfig.json. The root tsconfig appears to be a standalone config (possibly for scripts at the root level). Each package maintains its own configuration independently.

## Key Scripts

| Script | Command | Notes |
|--------|---------|-------|
| `npm run dev` | Build shared, then concurrently run backend + frontend | Correct build order |
| `npm run build` | `npm run build --workspaces` | May not respect build order |
| `npm run build:shared` | Build shared package | Must run first |
| `npm run test` | Run backend tests only | No frontend tests from root |
| `npm run lint` | Lint all workspaces | Uses `--if-present` |
| `npm run db:*` | Prisma commands via backend workspace | 5 database scripts |
| `npm run docker:*` | Docker compose commands | Dev and production variants |
| `npm run clean` | Clean all workspaces | Uses `--if-present` |

## Checklist Verification

### Configuration
- [x] Workspaces defined in root package.json -- VERIFIED: `"packages/*"` glob pattern
- [x] Build scripts respect order -- VERIFIED for `dev` script (build:shared first); WARNING for `build` script (uses `--workspaces` which may not guarantee order)
- [x] Shared package references work -- VERIFIED: both backend and frontend reference `@healthcareproviderdb/shared: "*"`
- [ ] CI builds in correct order -- Cannot verify (no CI config reviewed)

### Development
- [x] `npm run dev` starts both services -- VERIFIED: uses `concurrently` to run both
- [x] Hot reload in backend -- VERIFIED: uses `tsx watch src/index.ts`
- [x] Hot reload in frontend -- VERIFIED: uses `next dev --port 3000`
- [x] Shared types available -- VERIFIED: dist/index.js and dist/index.d.ts

### Build
- [x] `npm run build` exists -- VERIFIED
- [x] Docker builds configured -- VERIFIED: Dockerfile in backend, docker scripts in root
- [ ] Production optimization -- Not verified

## Questions Answered

### 1. Are there any circular dependencies?
**No circular dependencies detected.** The dependency graph is strictly one-directional:
- `shared` depends on: nothing
- `backend` depends on: `shared`
- `frontend` depends on: `shared`
- `backend` and `frontend` do NOT depend on each other

### 2. Is the shared package too large?
**No, it is appropriately sized.** The shared package contains 7 files with type definitions, enums, and a few utility functions. The utility functions (`getProviderDisplayName`, `getConfidenceLevel`, `calculateVerificationScore`, `isVerificationTrustworthy`) are small and used by both frontend and backend. Tree-shaking should work well since the package uses named exports from an index barrel file.

### 3. Should we add more shared code?
Potential candidates for the shared package:
- **Validation schemas**: Both backend and frontend use `zod` -- common validation rules (NPI format, state codes) could be shared
- **Constants**: The backend has `config/constants.ts` with values like `VERIFICATION_TTL_MS` that the frontend might benefit from knowing
- **API response types**: Currently frontend defines its own types in `types/` -- these could align with shared types

### 4. Would Turborepo help?
For the current size (3 packages), Turborepo would add marginal benefit:
- **Build caching**: Useful as the project grows, but current builds are fast
- **Correct build order**: Would fix the `npm run build --workspaces` ordering concern
- **Remote caching**: Valuable for CI but adds infrastructure
- **Recommendation**: Not urgent, but consider adopting when build times become noticeable or when adding more packages

### 5. Are there any workspace resolution issues?
**Potential issues identified:**
1. The `packages/shared/package.json` clean script uses `rm -rf dist` which is Unix-only. On Windows, this would fail in CMD (though works in Git Bash/WSL).
2. The backend test script uses a relative path: `node ../../node_modules/jest/bin/jest.js` -- this is fragile and depends on hoisting behavior.
3. The frontend test script uses `cd ../..` -- also fragile for the same reason.
4. Root has `@prisma/client` and `prisma` as direct dependencies AND backend has them as well. This double-listing is intentional for database scripts at root level but could cause version conflicts if versions diverge.

## Issues

1. **Build order risk**: `npm run build --workspaces` does not guarantee shared builds before backend/frontend. The glob pattern `"packages/*"` resolves alphabetically (backend, frontend, shared), meaning shared would build LAST. Use explicit workspace order or individual build scripts.
2. **Inconsistent tsconfig inheritance**: No package extends the root tsconfig, leading to duplicated configuration across all three packages.
3. **Platform-specific scripts**: The shared package `clean` script (`rm -rf dist`) is Unix-only.
4. **Fragile test paths**: Backend and frontend test scripts use relative paths to the root node_modules.
5. **Multiple tmpclaude directories**: The backend directory contains ~40 `tmpclaude-*` temporary directories that should be cleaned up and added to `.gitignore`.

## Recommendations

1. **Fix build order**: Change root `build` script to sequential: `npm run build:shared && npm run build:backend && npm run build:frontend` instead of `npm run build --workspaces`.
2. **Extract shared tsconfig base**: Create a base tsconfig that all packages extend to reduce duplication.
3. **Use cross-platform scripts**: Replace `rm -rf` with a cross-platform alternative or add `rimraf` as a dev dependency.
4. **Clean up temp directories**: Remove all `tmpclaude-*` directories from `packages/backend/` and add `tmpclaude-*` to `.gitignore`.
5. **Consider shared Zod schemas**: Move common validation patterns (NPI, state codes, pagination) to the shared package.
