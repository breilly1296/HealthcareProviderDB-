# Technical Debt Report

This document outlines technical debt and code quality issues identified in the codebase.

## 1. Duplicated Code

### NPI Validation Logic
- **Location:** `src/api/routes.ts`
- **Lines:** 169, 234, 358
- **Issue:** The regex check `/^\d{10}$/` for NPI validation is repeated in three different route handlers.
- **Refactoring Suggestion:** Create a shared Zod schema or helper function (e.g., `isValidNpi(npi: string)`) or middleware to validate NPI parameters.

### Specialty/Taxonomy Mappings
- **Location:**
    - `src/api/routes.ts` (Lines 46-53): `SPECIALTY_MAP`
    - `scripts/import-npi.ts` (Lines 28-59): `TAXONOMY_MAPPINGS`
- **Issue:** Both files maintain mappings between string representations and `SpecialtyCategory` enums. While they serve slightly different purposes (URL param mapping vs CMS taxonomy mapping), they represent a shared domain concept that risks divergence.
- **Refactoring Suggestion:** Centralize specialty definitions and mappings in a shared constant file (e.g., `src/lib/constants.ts` or `src/types/specialties.ts`).

## 2. Functions Over 50 Lines

### API Route Handlers
- **Location:** `src/api/routes.ts`
    - `GET /providers` handler (Lines 66-160, ~94 lines)
    - `GET /providers/:npi/plans` handler (Lines 230-349, ~119 lines)
    - `POST /providers/:npi/verify` handler (Lines 355-442, ~87 lines)
- **Issue:** Route handlers contain mixed concerns: request validation, database query construction, business logic (confidence scoring), and response formatting.
- **Refactoring Suggestion:** Extract logic into controller functions or service layers. For example:
    - Move query building to a `ProviderService.search()` method.
    - Move confidence calculation loop to a helper method.
    - Move verification logic to `VerificationService`.

### NPI Import Logic
- **Location:** `scripts/import-npi.ts`
    - `importNPIData` (Lines 228-369, ~141 lines)
- **Issue:** This function handles file stats, database logging, CSV parsing, batch processing, and error handling all in one massive block.
- **Refactoring Suggestion:** Break down into smaller steps: `createSyncLog`, `processBatch`, `parseRecord`, `updateSyncLog`.

## 3. Inconsistent Patterns

### Hardcoded Provider Status
- **Location:** `src/api/routes.ts` (Lines 289-301)
- **Issue:** In `GET /providers/:npi/plans`, the `ProviderPlanData` object is manually constructed with hardcoded values:
    ```typescript
    providerStatus: 'ACTIVE', // Line 300
    providerLastUpdateDate: null, // Line 299
    ```
    This ignores the actual `npiStatus` available on the provider record.
- **Refactoring Suggestion:** Use a mapper function that correctly populates these fields from the `provider` database record.

### Promise Handling
- **Location:** `scripts/import-npi.ts` (Lines 191-226)
- **Issue:** The `downloadNPIFile` function mixes `response.on('data')` callbacks with a `pipeline(...).then(...)` chain inside a Promise constructor.
- **Refactoring Suggestion:** Convert fully to `async/await` using `events.on` or stream iterators for cleaner, modern Node.js stream handling.

## 4. Dead Code

### Unused Confidence Utilities
- **Location:** `src/matching/confidence.ts`
    - `calculateBatchConfidenceScores` (Lines 315-319)
    - `needsReverification` (Lines 325-342)
    - `calculateProviderAggregateConfidence` (Lines 348-364)
- **Issue:** These functions are exported but never used in the application code (only in tests).
- **Refactoring Suggestion:** If these are intended for future features (e.g., background re-verification jobs), keep them but add comments explaining their intended use. If not, remove them to reduce maintenance burden.

### Unused Schema Field
- **Location:** `src/api/routes.ts` (Lines 39-42)
- **Issue:** `voteSchema` defines `verificationId`, but in the route handler (Line 450), `verificationId` is overridden by `req.params.id`.
- **Refactoring Suggestion:** Remove `verificationId` from the Zod schema if it's always handled via URL params.

## 5. Missing Error Handling

### Silent Failures in Import Script
- **Location:** `scripts/import-npi.ts`
    - `parseDate` (Lines 105-117): Returns `null` on failure without logging.
    - `cleanPhone` (Lines 119-123): Returns `null` if formatting fails.
- **Issue:** Data issues in the source CSV might be silently ignored, leading to missing data in the database.
- **Refactoring Suggestion:** Consider logging warnings or collecting "dirty data" stats instead of silent nulls, or ensuring `null` is the desired fallback for all invalid inputs.

### API Error Responses
- **Location:** `src/api/routes.ts`
- **Issue:** `GET /providers` parses `page` and `limit` with `parseInt` without explicit `isNaN` checks after regex validation (the regex `^\d+$` does technically protect it, but it's brittle).
- **Refactoring Suggestion:** Rely fully on Zod's `coerce.number()` or `transform` to handle string-to-number conversion safely and consistently.

## 6. TODO/FIXME Comments

- **Status:** None found in source code.
- **Note:** The absence of TODOs might indicate a lack of tracking for known technical debt within the codebase itself.
