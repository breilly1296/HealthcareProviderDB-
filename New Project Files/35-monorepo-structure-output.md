# Monorepo Structure Review — Output

**Last Updated:** 2026-04-16
**Tool:** npm workspaces
**Scope:** `package.json`, `tsconfig*.json`, `packages/*/package.json`

## Overview

HealthcareProviderDB is a three-package npm workspaces monorepo. Root (`C:\Users\breil\OneDrive\Desktop\HealthcareProviderDB`) does not build source itself; it orchestrates workspace scripts.

```
HealthcareProviderDB/
  package.json                 root (private, workspaces, orchestration scripts)
  package-lock.json            unified lockfile
  tsconfig.json                (backend-style; see note)
  tsconfig.base.json           shared compiler options
  docker-compose.yml           prod stack
  docker-compose.dev.yml       dev stack
  jest.config.js               root jest config (backend tests)
  prisma/                      Prisma schema shared across workspace
  scripts/                     root-level maintenance scripts
  docs/
  packages/
    shared/                    types-only package
    backend/                   Express 4 + Prisma 5 API
    frontend/                  Next.js 14.2 app
```

## Root `package.json`

`package.json:1-58`:

- `"private": true`, workspaces `"packages/*"` (line 7) — **glob pattern**, not the explicit list shown in prompt.
- Node engine pinned: `"node": ">=20.0.0"` (line 45).
- Package name `healthcareproviderdb` (line 2), version `1.0.0`.
- Workspace package IDs use the `@healthcareproviderdb/` scope (e.g., `@healthcareproviderdb/backend`), not `@healthcare-provider-db/` as shown in prompt.

### Root scripts (lines 9-31)
- `build` = `build:shared && build:backend && build:frontend` — enforces order.
- `build:shared|backend|frontend` — delegate to each workspace.
- `dev` = `build:shared && concurrently "dev:backend" "dev:frontend"` — builds shared once so live backend/frontend have compiled JS to import.
- `db:generate|push|migrate|studio|seed` — proxied to backend workspace (Prisma lives there).
- `docker:dev(:down)`, `docker:build|up|down` — compose shortcuts.
- `clean` = workspace-wide (`--if-present`).
- `lint` = workspace-wide.
- `test` = backend only.
- `test:backend` — alias.

### Root runtime deps (lines 47-52)
- `@prisma/client ^5.22.0`, `prisma ^5.22.0` — installed at root so the NPI import/enrichment scripts at `scripts/` and under `packages/backend/scripts/` share one Prisma client install.
- `csv-parse ^6.1.0` — NPI import CSV parsing.
- `pg ^8.16.3` — direct PG client for bulk imports.

### Root dev deps (lines 53-57)
- `@types/pg`, `concurrently ^9.2.1`, `rimraf ^6.1.2`.

Per memory: "NEVER put `next` in root package.json — it overrides the frontend workspace version." Root is clean of framework deps — correct.

## Shared Package (`packages/shared`)

`packages/shared/package.json:1-14`:

- Name `@healthcareproviderdb/shared`, `main: dist/index.js`, `types: dist/index.d.ts`.
- Only three scripts: `build` (`tsc`), `dev` (`tsc --watch`), `clean` (rimraf dist).
- **No `dependencies` or `devDependencies` block** — relies entirely on hoisted `typescript` from workspaces (resolved from backend/frontend dev deps).

Entry: `packages/shared/src/index.ts:1-3`:
```ts
export * from './types';
```

Contents: `packages/shared/src/types/`:
- `enums.ts`, `provider.ts`, `insurance-plan.ts`, `provider-plan-acceptance.ts`, `verification.ts`
- `index.ts` (re-export barrel).

Compiled to CommonJS (`module: commonjs` inherited from `tsconfig.base.json`).

## Backend Package (`packages/backend`)

`packages/backend/package.json:1-59`:

- Name `@healthcareproviderdb/backend`, `main: dist/index.js`.
- `dependencies` include `@healthcareproviderdb/shared: "*"` (line 25) — workspace symlink.
- Scripts:
  - `build` = `prisma generate && tsc` — generates Prisma client then compiles.
  - `start` = `node dist/index.js`.
  - `dev` = `tsx watch src/index.ts`.
  - `pretest` = `prisma generate` (line 11) — ensures generated client exists before Jest.
  - `test` = `node ../../node_modules/jest/bin/jest.js` — absolute path into hoisted Jest (workaround for Windows/npm-workspaces Jest resolution).
  - `test:watch`, `test:coverage`, `db:generate|push|migrate|studio|seed`.
- Prisma `"seed": "tsx scripts/seed.ts"` block at lines 56-58.

Runtime deps (lines 23-39): express 4.18, prisma client 5.22, jose 6.1 (JWT), helmet, cors, cookie-parser, csrf-csrf 4, pino/pino-http (logging), ioredis 5.9, sharp 0.34, zod 3.22, dotenv, @anthropic-ai/sdk.

Dev deps (lines 40-55): `@types/*`, jest 29.7 + ts-jest 29.4, supertest 7.2, tsx 4.6, typescript 5.3, pino-pretty.

## Frontend Package (`packages/frontend`)

`packages/frontend/package.json:1-60`:

- Name `@healthcareproviderdb/frontend`.
- Scripts:
  - `dev` = `next dev --port 3000`.
  - `build` = `next build`.
  - `start` = `next start`.
  - `lint` = `next lint`.
  - `test*` scripts run Jest from repo root via explicit `cd ../.. && npx jest` (lines 10-12) — mirrors backend's hoist-aware pattern.
  - `test:e2e[:ui|:headed]` — Playwright.
  - **`postinstall` = `node scripts/patch-next-swc.js || true`** (line 16) — patches Next.js SWC loader to enable WASM fallback on Windows ARM64 + Node 24 (documented in `CLAUDE.md` memory).
- Runtime deps (lines 20-37): `next ^14.2.35`, `react/react-dom ^18.3.1`, `@tanstack/react-query ^5.90.20`, `@healthcareproviderdb/shared "*"`, `@anthropic-ai/sdk`, `sharp`, `zod`, `lucide-react`, `posthog-js`, `react-hot-toast`, `focus-trap-react`, `@react-google-maps/api`, `react-google-recaptcha-v3`, `client-only`, `detect-libc`.
- Dev deps (lines 38-58): `@next/swc-wasm-nodejs ^14.2.33` (the ARM64-safe SWC binary), `@playwright/test 1.58`, `@testing-library/*`, jest/jest-jsdom, tailwindcss, ts-jest, typescript 5.3, babel preset pack.

## TypeScript Configuration

### `tsconfig.base.json` (shared, lines 1-15)

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
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

### Root `tsconfig.json` (lines 1-25)

**Does not `extends: tsconfig.base.json`.** Instead re-declares the same compiler options plus:
- `outDir: ./dist`, `rootDir: .`
- `paths: { "@/*": ["src/*"] }` — backend-style path alias.
- `types: ["node", "jest"]`.
- `include: ["src/**/*", "scripts/**/*"]` — points at **non-existent** `src/` at repo root; primarily used for `scripts/` typecheck and as the "VS Code default" tsconfig.
- `exclude: ["node_modules", "dist", "**/*.test.ts"]`.

Each workspace has its own `tsconfig.json` (backend: `packages/backend/tsconfig.json`; frontend: `packages/frontend/tsconfig.json`; shared: `packages/shared/tsconfig.json`).

## Dependency Graph

```
  frontend ──┐
             ├─> shared  (workspace: "*")
  backend ──┘
```

- Frontend and backend both declare `@healthcareproviderdb/shared: "*"` (symlink to workspace).
- Shared has no workspace dependencies.
- Backend depends on `@prisma/client` at both root (hoisted) and workspace (local copy).
- Root orchestration scripts (`dev`, `build`) enforce the `shared → backend → frontend` order.

## Build Order (from `package.json:10-16`)

1. `npm run build:shared` — compiles `packages/shared/src` to `packages/shared/dist`.
2. `npm run build:backend` — runs `prisma generate` first, then compiles.
3. `npm run build:frontend` — `next build` (consumes compiled `@healthcareproviderdb/shared`).

`npm run dev` deliberately builds shared **once** before spawning dev servers so that hot-reload consumers see compiled types/JS. Shared's `tsc --watch` (`dev` script) can be run manually for active shared-types editing.

## Lockfile & Install

Single `package-lock.json` at root. `npm install` hoists where possible; workspace-local `node_modules` hold only packages that can't be hoisted (e.g., different versions of `sharp` — frontend `^0.33.2`, backend `^0.34.5`).

## Docker

- `docker-compose.yml` — prod stack.
- `docker-compose.dev.yml` — dev stack.
- Each workspace has its own `Dockerfile`:
  - `packages/backend/Dockerfile`.
  - `packages/frontend/Dockerfile` — pairs with `next.config.js: output: 'standalone'`.

## Pitfalls / Conventions Captured

1. **npm workspaces Jest hoist** — both backend and frontend call Jest via an explicit absolute path (`node ../../node_modules/jest/bin/jest.js` for backend; `cd ../.. && npx jest` for frontend). Direct `jest` invocation breaks on Windows because npm doesn't always create workspace-local bin shims.
2. **Next.js SWC on ARM64 Node 24** — `patch-next-swc.js` postinstall is required; adds `aarch64-pc-windows-msvc` to `knownDefaultWasmFallbackTriples`. Codified in `packages/frontend/package.json:16` and `next.config.js:84-90`.
3. **Never add `next` to root** — noted in user memory; confirmed clean at root `package.json:47-57`.
4. **Two different `sharp` versions** — root lockfile allows per-workspace hoist. Intentional because backend 0.34 and frontend 0.33 coexist.
5. **Prisma lives at two levels** — `prisma/schema.prisma` at repo root (primary); `packages/backend/prisma/` for migrations. Both `@prisma/client` entries (root + backend) resolve to a single generated client because backend's `build`/`pretest` run `prisma generate`.
6. **Root `tsconfig.json` doesn't extend `tsconfig.base.json`** — mild inconsistency; easy cleanup task.

## Checklist

- [x] Workspaces defined (`package.json:7`).
- [x] Build scripts respect order (`package.json:10`).
- [x] Shared referenced via workspace protocol `"*"` (backend L25, frontend L22).
- [x] Single lockfile present.
- [x] `npm run dev` starts both services via `concurrently`.
- [x] Hot reload (backend `tsx watch`, frontend `next dev`).
- [x] `npm run build` builds all workspaces in dependency order.
- [x] Docker multi-stage builds per workspace.
- [ ] CI build order (not verified in repo; recommend explicit step ordering in CI).
- [ ] Turborepo / remote caching — not adopted.
- [ ] Root `tsconfig.json` does not `extends` `tsconfig.base.json` — minor drift.

## Drift from Prompt

1. **Package scope** — prompt shows `@healthcare-provider-db/shared`; actual is `@healthcareproviderdb/shared` (no dashes). Verified: `packages/shared/package.json:2`, `packages/backend/package.json:2`, `packages/frontend/package.json:2`.
2. **Workspaces pattern** — prompt shows explicit array of three entries; actual uses `"packages/*"` glob (`package.json:7`).
3. **Prompt `tsconfig.json` root example** is a simplified snippet; real root config adds `outDir`, `paths`, `types`, `include`, `exclude`. Also does not extend `tsconfig.base.json`.
4. **Prompt didn't mention** Prisma-at-root duplication, Next SWC patch postinstall, Jest hoist workarounds, or dual `sharp` versions.
5. **Prompt's Build Order commands** still valid.
6. **No Turborepo** — prompt's "Questions to Ask" lists it; not adopted.

## Issues / Recommendations

1. **Unify scope or tsconfig base** — make root `tsconfig.json` `extends: "./tsconfig.base.json"` to remove duplication.
2. **CI ordering** — add an explicit build step sequence in CI or gate on `npm run build` root script to ensure shared is rebuilt before consumers.
3. **Consider Turborepo or Nx** — would cache `build:shared` and Prisma generate, dramatically speeding CI and cold dev starts.
4. **Shared package has no deps/devDeps block** — makes TypeScript resolution dependent on workspace hoisting; consider adding `devDependencies: { typescript }` explicitly so the package builds in isolation.
5. **Root-level scripts under `scripts/`** imply root should have a `tsx` devDep (it doesn't); `tsx` is inherited from backend's devDeps via hoisting — fragile.
6. **Document SWC patch** — `docs/next-swc-arm64.md` per memory notes; keep current.
7. **Backend `test` invokes Jest via `node ../../node_modules/jest/bin/jest.js`** — readable but brittle; consider a small shell wrapper or `npm exec jest`.
8. **No top-level `typecheck` script** — recommend `tsc --noEmit` per workspace wired at root for pre-merge checks.

## Questions from Prompt — Answers

1. *Circular dependencies?* — None. Shared has no deps; backend and frontend both import shared one-way.
2. *Shared package too large?* — Currently types-only; tree-shaking concerns are minimal. Would grow if validation schemas are hoisted here.
3. *Add more shared code?* — Yes, recommend moving Zod schemas from `packages/backend/src/schemas/commonSchemas.ts` to shared so frontend and backend validate identically.
4. *Turborepo?* — Worthwhile once CI is formalized; biggest wins are `prisma generate` caching and `next build` caching.
5. *Resolution issues?* — The Next SWC patch is the main source of friction. After patching, workspace resolution is stable.
