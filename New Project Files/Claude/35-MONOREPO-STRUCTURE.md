# VerifyMyProvider Monorepo Structure Analysis

**Last Updated:** 2026-01-31
**Analyzed By:** Claude Code

---

## Executive Summary

VerifyMyProvider uses a monorepo structure with npm workspaces. This enables shared code between frontend and backend while maintaining clear separation of concerns and simplified dependency management.

---

## Repository Structure

```
HealthcareProviderDB/
├── packages/
│   ├── frontend/          # Next.js frontend application
│   │   ├── src/
│   │   ├── public/
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── backend/           # Express.js backend API
│   │   ├── src/
│   │   ├── prisma/
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── shared/            # Shared types and utilities
│       ├── src/
│       ├── package.json
│       └── tsconfig.json
│
├── e2e/                   # End-to-end tests
│   ├── tests/
│   └── playwright.config.ts
│
├── scripts/               # Build and deployment scripts
│   ├── deploy.sh
│   └── import-npi.ts
│
├── prompts/               # Claude prompts for code generation
│   └── *.md
│
├── package.json           # Root workspace configuration
├── tsconfig.json          # Root TypeScript configuration
├── .env.example           # Environment template
├── .gitignore
└── README.md
```

---

## Workspace Configuration

### Root package.json

```json
{
  "name": "verifymyprovider",
  "private": true,
  "workspaces": [
    "packages/*"
  ],
  "scripts": {
    "dev": "npm run dev --workspaces --if-present",
    "build": "npm run build --workspaces --if-present",
    "test": "npm run test --workspaces --if-present",
    "lint": "npm run lint --workspaces --if-present",
    "clean": "rm -rf packages/*/dist packages/*/node_modules node_modules",
    "prepare": "npm run build --workspace=packages/shared"
  },
  "devDependencies": {
    "typescript": "^5.0.0"
  }
}
```

### Package Dependencies

```
┌─────────────────────────────────────────────────────────────┐
│                    Dependency Graph                          │
│                                                              │
│      @vmp/frontend                @vmp/backend              │
│           │                            │                    │
│           │                            │                    │
│           └──────────┬─────────────────┘                    │
│                      │                                      │
│                      ▼                                      │
│                @vmp/shared                                  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Package Details

### packages/shared

Shared types, utilities, and constants.

```json
{
  "name": "@vmp/shared",
  "version": "1.0.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "devDependencies": {
    "typescript": "^5.0.0"
  }
}
```

**Contents:**
- TypeScript types (Provider, Verification, etc.)
- Validation utilities
- Formatting functions
- Constants

### packages/backend

Express.js API server.

```json
{
  "name": "@vmp/backend",
  "version": "1.0.0",
  "main": "dist/index.js",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "jest"
  },
  "dependencies": {
    "@vmp/shared": "*",
    "express": "^4.18.0",
    "@prisma/client": "^5.0.0",
    "zod": "^3.22.0",
    "ioredis": "^5.3.0",
    "helmet": "^7.0.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.0",
    "tsx": "^4.0.0",
    "jest": "^29.0.0"
  }
}
```

### packages/frontend

Next.js web application.

```json
{
  "name": "@vmp/frontend",
  "version": "1.0.0",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "jest"
  },
  "dependencies": {
    "@vmp/shared": "*",
    "next": "^14.0.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "tailwindcss": "^3.4.0",
    "posthog-js": "^1.90.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@testing-library/react": "^14.0.0"
  }
}
```

---

## TypeScript Configuration

### Root tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "composite": true
  }
}
```

### Package tsconfig.json (Backend)

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "references": [
    { "path": "../shared" }
  ]
}
```

### Package tsconfig.json (Frontend)

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "esnext"],
    "jsx": "preserve",
    "plugins": [{ "name": "next" }]
  },
  "include": ["src/**/*", "next-env.d.ts"],
  "references": [
    { "path": "../shared" }
  ]
}
```

---

## Build Order

Due to dependencies, packages must be built in order:

```bash
# 1. Build shared first
npm run build --workspace=packages/shared

# 2. Build frontend and backend (can be parallel)
npm run build --workspace=packages/backend &
npm run build --workspace=packages/frontend &
wait

# Or use the root script
npm run build  # Builds all in correct order
```

### CI/CD Build

```yaml
# .github/workflows/build.yml

steps:
  - name: Install dependencies
    run: npm ci

  - name: Build shared
    run: npm run build --workspace=packages/shared

  - name: Build backend
    run: npm run build --workspace=packages/backend

  - name: Build frontend
    run: npm run build --workspace=packages/frontend
```

---

## Development Workflow

### Starting Development

```bash
# Install all dependencies
npm install

# Build shared package (required first)
npm run build --workspace=packages/shared

# Start all dev servers
npm run dev
# Or individually:
npm run dev --workspace=packages/backend
npm run dev --workspace=packages/frontend
```

### Adding Dependencies

```bash
# Add to specific package
npm install lodash --workspace=packages/backend

# Add to shared
npm install date-fns --workspace=packages/shared

# Add dev dependency to root
npm install -D prettier
```

### Running Tests

```bash
# All packages
npm run test

# Specific package
npm run test --workspace=packages/backend
```

---

## Import Patterns

### Frontend importing from Shared

```typescript
// packages/frontend/src/components/ProviderCard.tsx

import type { Provider, PlanAcceptance } from '@vmp/shared';
import { formatProviderName, formatAddress } from '@vmp/shared';

export function ProviderCard({ provider }: { provider: Provider }) {
  return (
    <div>
      <h3>{formatProviderName(provider)}</h3>
      <p>{formatAddress(provider)}</p>
    </div>
  );
}
```

### Backend importing from Shared

```typescript
// packages/backend/src/routes/providers.ts

import type { Provider, ProviderSearchQuery } from '@vmp/shared';
import { isValidNpi, isValidState } from '@vmp/shared';

export async function searchProviders(query: ProviderSearchQuery): Promise<Provider[]> {
  // ...
}
```

---

## Benefits of Monorepo

| Benefit | Description |
|---------|-------------|
| **Shared Types** | Same TypeScript types in frontend and backend |
| **Atomic Changes** | Single PR for full-stack features |
| **Simplified Dependencies** | One npm install for everything |
| **Consistent Tooling** | Shared linting, formatting, testing config |
| **Easy Refactoring** | Rename/move code across packages |

## Potential Drawbacks

| Challenge | Mitigation |
|-----------|------------|
| Build complexity | Clear build order, CI scripts |
| Large node_modules | Hoisting, pruned installs |
| IDE performance | Scoped tsconfig, exclude patterns |
| Deployment coupling | Independent package builds |

---

## Recommendations

### Immediate
- ✅ Structure is well-organized
- Add package-specific READMEs
- Document build order in CI

### Future
1. **Turborepo/Nx**
   - For faster builds
   - Better caching

2. **Changesets**
   - For versioning
   - Automated changelogs

3. **Package Scoping**
   - @verifymyprovider/shared
   - Prepare for npm publishing

---

## Conclusion

The monorepo structure is **well-implemented**:

- ✅ Clear package separation
- ✅ Shared types and utilities
- ✅ npm workspaces configured
- ✅ TypeScript project references
- ✅ Proper build order

The structure supports efficient development while maintaining clear boundaries between packages.
