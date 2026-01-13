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
- `packages/backend/src/api/routes.ts`
- `packages/backend/src/middleware/validation.ts` (if exists)

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
