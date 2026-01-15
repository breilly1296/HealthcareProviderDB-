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
- `packages/backend/src/routes/index.ts` (route registry)
- `packages/backend/src/routes/providers.ts` (provider search, details)
- `packages/backend/src/routes/verify.ts` (verification submissions, votes)
- `packages/backend/src/routes/locations.ts` (location/organization search)
- `packages/backend/src/routes/plans.ts` (insurance plan lookup)
- `packages/backend/src/middleware/rateLimiter.ts` (rate limiting)
- `packages/backend/src/middleware/errorHandler.ts` (error handling)

## Current Route Structure
Routes are split into domain-specific files:
- `/api/v1/providers/*` - Provider search and details
- `/api/v1/verify/*` - Verification submissions and votes
- `/api/v1/locations/*` - Location/organization queries
- `/api/v1/plans/*` - Insurance plan lookup

## Questions to Ask
1. Which routes are currently implemented?
2. Are any routes missing authentication? (All are currently public)
3. Are inputs validated before processing? (Using Zod schemas)
4. Are errors handled gracefully? (asyncHandler + AppError)
5. Are all write endpoints rate limited? (verify.ts uses rate limiters)
6. Are new location endpoints properly secured?

## Output Format
```markdown
# API Routes Security

## Route Inventory
[List all routes with method, path, auth status, rate limit]

## Security Status
- Rate limiting: ✅ Implemented for verify/vote/search
- Input validation: ✅ Zod schemas on all endpoints
- Error handling: ✅ Centralized error handler
- Authentication: ⚠️ Not yet implemented (all routes public)

## Issues Found
[List]

## Recommendations
[Actions]
```
