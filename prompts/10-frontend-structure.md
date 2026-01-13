---
tags:
  - frontend
  - architecture
  - medium
type: prompt
priority: 3
---

# Frontend Structure Review

## Files to Review
- `packages/frontend/src/` (entire frontend)
- `packages/frontend/pages/` (Next.js pages)
- `packages/frontend/components/` (React components)

## Questions to Ask
1. What pages exist? (Search, Results, Provider Detail, Verify?)
2. What components are reusable?
3. Is state managed properly? (React Context? Redux?)
4. Are API calls centralized? (services/api.ts?)
5. Is the frontend mobile-responsive?

## Output Format
```markdown
# Frontend Structure

## Pages
[List]

## Key Components
[List]

## State Management
[Approach]

## API Integration
[How it works]
```
