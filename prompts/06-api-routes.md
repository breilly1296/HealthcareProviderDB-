---
tags:
  - security
  - api
  - high
type: prompt
priority: 2
---

# API Routes Security Review

## Files to Review
- `packages/backend/src/api/routes.ts` (all routes)
- `packages/backend/src/middleware/` (auth, validation)

## Questions to Ask
1. Which routes are currently implemented?
2. Are any routes missing authentication? (All are currently)
3. Are inputs validated before processing?
4. Are errors handled gracefully?
5. What routes need rate limiting? (Verifications!)

## Output Format
```markdown
# API Routes Security

## Route Inventory
[List all routes with method, path, auth status]

## Security Status
[Assessment]

## Issues Found
[List]

## Recommendations
[Actions]
```
