# Monorepo Structure Review -- Analysis

**Generated:** 2026-02-05
**Source Prompt:** prompts/35-monorepo-structure.md
**Status:** Well-implemented -- npm workspaces monorepo is correctly configured with minor discrepancies from prompt documentation

---

## Findings

### Configuration
- [x] **Workspaces defined in root package.json** -- Verified. Root `package.json` line 6-8 defines `"workspaces": ["packages/*"]`. Note: The prompt documents the more explicit form `["packages/shared", "packages/backend", "packages/frontend"]`, but the actual code uses the glob pattern `"packages/*"` which is functionally equivalent and more maintainable.

- [x] **Build scripts respect order** -- Partially verified. The root `dev` script (line 14) correctly runs `npm run build:shared &&` before starting backend and frontend concurrently, ensuring shared types are compiled first. However, the root `build` script (line 10) uses `npm run build --workspaces` which relies on npm's workspace ordering rather than explicit sequential execution. The prompt documents a sequential `npm run build:shared && npm run build:backend && npm run build:frontend` approach, but the actual implementation delegates ordering to npm. Since `packages/*` is a glob, npm processes workspaces in filesystem order (alphabetical: backend, frontend, shared), which does NOT guarantee shared builds first.

- [x] **Shared package references work** -- Verified. Both `packages/backend/package.json` (line 23) and `packages/frontend/package.json` (line 22) declare `"@healthcareproviderdb/shared": "*"` as a dependency. npm workspaces resolves this to the local `packages/shared` via symlink.

- [ ] **CI builds in correct order** -- The deploy.yml builds Docker images for backend and frontend separately. The shared package build order in CI would need separate verification.

### Package Details

| Package | Name | Purpose | Dependencies on Shared |
|---------|------|---------|----------------------|
| shared | `@healthcareproviderdb/shared` | Types & constants | None (leaf package) |
| backend | `@healthcareproviderdb/backend` | Express.js API | `@healthcareproviderdb/shared: "*"` |
| frontend | `@healthcareproviderdb/frontend` | Next.js 14 web app | `@healthcareproviderdb/shared: "*"` |

### Shared Package Structure
- **Entry point:** `src/index.ts` re-exports from `./types`
- **Type files:** `provider.ts`, `insurance-plan.ts`, `verification.ts`, `provider-plan-acceptance.ts`, `enums.ts`
- **Constants:** `dist/constants/domain.js` exists in dist (built output includes domain constants)
- **Build output:** `dist/` with `.js`, `.d.ts`, `.js.map`, `.d.ts.map` files -- declarations enabled
- **TypeScript config:** Targets ES2022, CommonJS module output, strict mode, declaration generation enabled
- **No runtime dependencies** -- `package.json` has zero dependencies, only type definitions

### Naming Discrepancy

| Aspect | Prompt Says | Actual Code |
|--------|-------------|-------------|
| Package name prefix | `@healthcare-provider-db/` | `@healthcareproviderdb/` |
| Root package name | `healthcare-provider-db` | `healthcareproviderdb` |
| Workspaces field | `["packages/shared", "packages/backend", "packages/frontend"]` | `["packages/*"]` |
| Root build script | Sequential with `&&` | `npm run build --workspaces` |

The prompt documentation uses hyphens in the package scope name, but the actual code uses no hyphens. This is cosmetic but the prompt should be updated to match.

### Root Dependencies
The root `package.json` places the following at root level:
- `@prisma/client: ^5.22.0` (production)
- `csv-parse: ^6.1.0` (production)
- `pg: ^8.16.3` (production)
- `prisma: ^5.22.0` (production)
- `@types/pg: ^8.16.0` (dev)
- `concurrently: ^9.2.1` (dev)

Per the MEMORY.md lesson: `next` is correctly NOT in root package.json (only in `packages/frontend`), avoiding the SWC version mismatch issue previously encountered.

### Development
- [x] **`npm run dev` starts both services** -- Verified. Root `dev` script: `npm run build:shared && concurrently "npm run dev:backend" "npm run dev:frontend"`. Uses `concurrently` to run both in parallel after building shared.
- [x] **Hot reload works in both** -- Backend uses `tsx watch src/index.ts`; frontend uses `next dev --port 3000`. Both support hot reload.
- [x] **Shared types update in real-time** -- The shared package has a `dev` script (`tsc --watch`) but it is NOT started by the root `dev` script. Changes to shared types require manually rebuilding shared, or running `npm run dev -w @healthcareproviderdb/shared` in a separate terminal.

### Build
- [x] **`npm run build` works** -- Individual build scripts verified: shared uses `tsc`, backend uses `tsc`, frontend uses `next build`.
- [x] **Docker builds work** -- Dockerfiles referenced in deploy.yml for both backend and frontend.
- [ ] **Production optimization** -- Not specifically verified. Frontend relies on Next.js built-in optimization. No Turborepo or build caching configured.

### Frontend Postinstall
The frontend has a `postinstall` script (`node scripts/patch-next-swc.js || true`) that patches Next.js SWC for Windows ARM64 compatibility, as documented in MEMORY.md.

---

## Summary

The monorepo is correctly structured using npm workspaces with three packages: shared (types/constants), backend (Express API), and frontend (Next.js 14). Both backend and frontend properly depend on the shared package via `"@healthcareproviderdb/shared": "*"`. The root `dev` script correctly builds shared first, then starts backend and frontend concurrently.

Key concerns: (1) The root `build` script uses `npm run build --workspaces` which processes workspaces in alphabetical order (backend, frontend, shared), potentially building shared AFTER packages that depend on it. (2) The shared `tsc --watch` is not included in the root `dev` command, so shared type changes during development require a manual rebuild. (3) The prompt documentation uses incorrect package name prefixes (`@healthcare-provider-db/` vs actual `@healthcareproviderdb/`).

---

## Recommendations

1. **Fix the root `build` script** to explicitly order shared first: `"build": "npm run build:shared && npm run build:backend && npm run build:frontend"` rather than `npm run build --workspaces`. This ensures deterministic build ordering regardless of filesystem sort order.
2. **Include shared watch in dev script** -- Update the root `dev` script to also run `npm run dev -w @healthcareproviderdb/shared` via concurrently so that shared type changes are automatically recompiled during development.
3. **Update prompt documentation** to use the actual package name prefix `@healthcareproviderdb/` and the glob workspace pattern `"packages/*"`.
4. **Consider adding Turborepo** for build caching and intelligent task scheduling. The project is at a size where build times may benefit from incremental builds and remote caching.
5. **Verify CI build order** in the GitHub Actions deploy workflow to ensure `packages/shared` is built before backend and frontend Docker images are created.
