---
tags:
  - security
  - validation
  - high
type: prompt
priority: 2
---

# Input Validation Review

## Files to Review
- `packages/backend/src/routes/` (all route files use Zod validation)
  - `providers.ts` - NPI validation, search params
  - `verify.ts` - verification submission validation
  - `plans.ts` - plan ID validation
  - `locations.ts` - location query validation
- `packages/backend/src/middleware/errorHandler.ts` (handles Zod validation errors)

## Current Validation Implementation (✅ IMPLEMENTED)
- **Zod schemas** on all route inputs
- **NPI validation**: 10-digit format check
- **String length limits**: Prevents large payload attacks
- **Type coercion**: Handles query string types properly
- **Error responses**: Detailed validation error messages

## Questions to Ask
1. Are NPIs validated (10-digit format)?
2. Are UUIDs validated before database queries?
3. Are strings sanitized?
4. Are file uploads validated (if any)?
5. Are there any SQL injection risks? (Prisma should prevent)

## Output Format
```markdown
# Input Validation

## Validation Status
[Current state]

## Issues Found
[List]

## Recommendations
[Fixes needed]
```
