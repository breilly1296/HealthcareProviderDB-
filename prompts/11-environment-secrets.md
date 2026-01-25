---
tags:
  - security
  - secrets
  - critical
type: prompt
priority: 1
---

# Environment & Secrets Review

## Files to Review
- `.env.example` (root level)
- `packages/backend/.env.example` (backend specific)
- `packages/frontend/.env.example` (frontend specific)
- `packages/backend/src/index.ts` (environment variable usage)
- GCP Secret Manager (DATABASE_URL, ADMIN_SECRET, etc.)

## Questions to Ask
1. What secrets exist in Secret Manager? (DATABASE_URL, etc.)
2. Are any secrets hardcoded? (Search for API keys in code)
3. Are secrets documented in .env.example?
4. How are secrets accessed in CI/CD?

## Output Format
```markdown
# Environment & Secrets

## Secret Manager Inventory
| Secret | Purpose |
|--------|---------|
| DATABASE_URL | PostgreSQL connection |
[etc]

## Security Status
[Assessment]

## Issues Found
[List]
```
