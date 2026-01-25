# Prompt Analysis: 06-api-routes.md

**Type:** Code Review / Inventory
**Quality Rating:** 4/5

## Intent/Goal
To review the security and structure of the backend API routes.

## Components
- **Route Inventory:** Lists the main route files (`providers.ts`, `verify.ts`, `admin.ts`).
- **Security Checklist:** Asks about Auth, Validation (Zod), and Error Handling.
- **Output Template:** Provides a clear markdown format for the audit result.

## Gaps/Improvements
- **Specifics:** Compared to `08-rate-limiting`, this is a bit generic. It asks "Are any routes missing authentication?" when we know *all* are missing it. It could be more targeted (e.g., "Verify Admin route header protection").

## Analysis
A standard, useful inventory prompt. It helps ensure no "ghost routes" exist and that standard middleware (validation, error handling) is applied everywhere.
