# Monorepo Structure

## Overview

The VerifyMyProvider project uses an npm workspaces monorepo to manage three packages (shared, backend, frontend) plus supporting directories for scripts, Prisma schema, and prompts.

## Tool

**npm workspaces** - Native npm feature for managing multiple packages in a single repository. No additional tooling (Lerna, Nx, Turborepo) is required.

## Directory Structure

```
HealthcareProviderDB/
├── package.json              # Root: workspace definitions, shared scripts
├── tsconfig.json             # Root TypeScript config (strict mode)
├── packages/
│   ├── shared/               # Shared TypeScript types
│   │   ├── package.json
│   │   ├── tsconfig.json     # Extends root tsconfig
│   │   └── src/
│   │       └── types/        # Provider, InsurancePlan, AcceptanceStatus, etc.
│   ├── backend/              # Express + Prisma API server
│   │   ├── package.json
│   │   ├── tsconfig.json     # Extends root tsconfig
│   │   └── src/
│   └── frontend/             # Next.js 14.2 + React 18 application
│       ├── package.json
│       ├── tsconfig.json     # Extends root tsconfig
│       └── src/
├── prisma/                   # Prisma schema and migrations
├── scripts/                  # Utility and data import scripts
└── prompts/                  # Claude prompt templates
```

## Root package.json

```json
{
  "workspaces": [
    "packages/shared",
    "packages/backend",
    "packages/frontend"
  ]
}
```

## Package Dependencies

| Package | Depends On |
|---------|------------|
| `packages/shared` | (none) |
| `packages/backend` | `packages/shared` |
| `packages/frontend` | `packages/shared` |

The shared package is the dependency root. Both backend and frontend import types from it.

## Shared Package

### Purpose

Single source of truth for TypeScript types used across backend and frontend.

### Key Types

- `Provider` - Core provider data structure
- `InsurancePlan` - Insurance plan details
- `AcceptanceStatus` - Enum for plan acceptance states
- Additional shared interfaces and enums

### Compilation

Compiled to **CommonJS** for compatibility with both the backend (Node.js) and frontend (Next.js) packages.

## Build Order

Build order is critical because packages depend on each other:

```
1. shared    (no dependencies, must build first)
2. backend   (depends on shared)
3. frontend  (depends on shared)
```

## Scripts

### Development

```bash
npm run dev
```

Runs `concurrently` to start both backend and frontend dev servers in parallel.

### Build

```bash
npm run build
```

Runs sequential builds: shared, then backend, then frontend.

### Test

```bash
npm test
```

Runs Jest tests in the backend package.

## TypeScript Configuration

### Root tsconfig.json

- **strict mode** enabled
- Serves as the base configuration for all packages

### Package tsconfigs

Each package has its own `tsconfig.json` that extends the root:

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    // Package-specific overrides
  }
}
```

## Benefits

- **Single source of truth** - Shared types prevent drift between backend and frontend
- **Atomic changes** - A single commit can update types, backend, and frontend together
- **One npm install** - All dependencies resolved from the root with hoisting
- **Shared tooling** - TypeScript config, linting, and formatting defined once

## Challenges

- **Build order matters** - The shared package must be compiled before backend or frontend can build; forgetting this step causes import errors
- **Package resolution** - Occasionally requires `npm rebuild` when native dependencies mismatch after updates or platform changes
- **Bundle size** - The shared package should be tree-shaken in the frontend to avoid shipping unused types or utilities; be mindful of what gets exported
