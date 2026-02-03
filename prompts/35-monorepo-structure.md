---
tags:
  - architecture
  - monorepo
type: prompt
priority: 2
---

# Monorepo Structure Review

## Files to Review
- `package.json` (root - workspace configuration)
- `packages/shared/package.json` (shared types)
- `packages/backend/package.json` (backend)
- `packages/frontend/package.json` (frontend)
- `tsconfig.json` (TypeScript configuration)
- `package-lock.json` (dependency lock)

## Monorepo Overview

VerifyMyProvider uses npm workspaces for monorepo management.

### Structure
```
HealthcareProviderDB/
├── package.json          # Root - workspace config
├── package-lock.json     # Unified lockfile
├── tsconfig.json         # Shared TS config
├── packages/
│   ├── shared/           # Shared types/utilities
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       └── types/
│   ├── backend/          # Express.js API
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   └── frontend/         # Next.js app
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
├── prisma/               # Database (shared)
├── scripts/              # Utilities
└── docs/                 # Documentation
```

## Workspace Configuration

### Root package.json
```json
{
  "name": "healthcare-provider-db",
  "private": true,
  "workspaces": [
    "packages/shared",
    "packages/backend",
    "packages/frontend"
  ],
  "scripts": {
    "build": "npm run build:shared && npm run build:backend && npm run build:frontend",
    "build:shared": "npm run build -w packages/shared",
    "build:backend": "npm run build -w packages/backend",
    "build:frontend": "npm run build -w packages/frontend",
    "dev": "concurrently \"npm run dev:backend\" \"npm run dev:frontend\"",
    "dev:backend": "npm run dev -w packages/backend",
    "dev:frontend": "npm run dev -w packages/frontend",
    "test": "npm run test -w packages/backend",
    "lint": "npm run lint -w packages/backend && npm run lint -w packages/frontend"
  }
}
```

### Package Dependencies

```
┌─────────────────┐
│    frontend     │
│   (Next.js)     │
└────────┬────────┘
         │ depends on
         ▼
┌─────────────────┐      ┌─────────────────┐
│     shared      │◄─────│     backend     │
│    (types)      │      │   (Express)     │
└─────────────────┘      └─────────────────┘
```

### Package References
```json
// packages/backend/package.json
{
  "dependencies": {
    "@healthcare-provider-db/shared": "*"
  }
}

// packages/frontend/package.json
{
  "dependencies": {
    "@healthcare-provider-db/shared": "*"
  }
}
```

## Shared Package

### Purpose
- Type definitions used by both frontend and backend
- Ensures type consistency across packages
- Compiled to CommonJS for compatibility

### Contents
```typescript
// packages/shared/src/types/index.ts
export interface Provider {
  npi: string;
  entityType: 'INDIVIDUAL' | 'ORGANIZATION';
  firstName?: string;
  lastName?: string;
  organizationName?: string;
  // ... other fields
}

export interface InsurancePlan {
  planId: string;
  planName: string;
  issuerName: string;
  // ... other fields
}

export type AcceptanceStatus = 'ACCEPTED' | 'NOT_ACCEPTED' | 'PENDING' | 'UNKNOWN';
```

## Build Order

Dependencies require specific build order:

1. **shared** (no dependencies)
2. **backend** (depends on shared)
3. **frontend** (depends on shared)

```bash
# Correct order
npm run build:shared
npm run build:backend
npm run build:frontend

# Or use root script
npm run build  # Builds in correct order
```

## Development Workflow

### Install Dependencies
```bash
# From root - installs all workspaces
npm install
```

### Start Development
```bash
# Both backend and frontend
npm run dev

# Or individually
npm run dev:backend
npm run dev:frontend
```

### Add Dependency
```bash
# To specific workspace
npm install express -w packages/backend

# To root (dev dependency)
npm install -D typescript
```

### Run Tests
```bash
# Backend tests
npm run test:backend

# Frontend tests
npm run test:frontend
```

## TypeScript Configuration

### Root tsconfig.json
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

### Package-Specific
Each package extends root and adds specific settings:
- `paths` for imports
- `outDir` for build output
- `include/exclude` for files

## Benefits of Monorepo

1. **Single Source of Truth**
   - Shared types prevent drift
   - One lockfile for all packages

2. **Atomic Changes**
   - Update type + both usages in one commit
   - No version sync issues

3. **Simplified Development**
   - One `npm install`
   - Easy cross-package imports

4. **Unified Tooling**
   - Shared ESLint, Prettier configs
   - Consistent code style

## Challenges

1. **Build Order Matters**
   - Must build shared first
   - CI must respect order

2. **Package Resolution**
   - Sometimes needs `npm rebuild`
   - Symlinks can confuse tools

3. **Bundle Size**
   - Frontend must tree-shake shared
   - Don't import backend-only code

## Checklist

### Configuration
- [x] Workspaces defined in root package.json
- [x] Build scripts respect order
- [x] Shared package references work
- [ ] CI builds in correct order

### Development
- [x] `npm run dev` starts both services
- [x] Hot reload works in both
- [x] Shared types update in real-time

### Build
- [x] `npm run build` works
- [x] Docker builds work
- [ ] Production optimization

## Questions to Ask

1. **Are there any circular dependencies?**
   - Between packages?
   - Would cause build issues

2. **Is the shared package too large?**
   - Tree-shaking working?
   - Bundle size impact?

3. **Should we add more shared code?**
   - Validation schemas?
   - Utility functions?

4. **Would Turborepo help?**
   - Build caching
   - Parallel builds
   - Remote caching

5. **Are there any workspace resolution issues?**
   - `npm rebuild` needed?
   - IDE path resolution?

## Output Format

```markdown
# Monorepo Structure

**Last Updated:** [Date]
**Tool:** npm workspaces

## Packages
| Package | Purpose | Dependencies |
|---------|---------|--------------|
| shared | Types | None |
| backend | API | shared, prisma |
| frontend | Web app | shared |

## Build Order
1. shared
2. backend
3. frontend

## Key Scripts
- `npm run dev` - Start all
- `npm run build` - Build all
- `npm run test` - Run tests

## Issues
[List any issues]

## Recommendations
[List recommendations]
```
