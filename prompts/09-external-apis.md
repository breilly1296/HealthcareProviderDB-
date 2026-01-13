---
tags:
  - security
  - external-apis
  - medium
type: prompt
priority: 3
---

# External API Security Review

## Files to Review
- Check for `fetch(` or `axios(` calls
- FHIR integration code (when implemented)

## Questions to Ask
1. Which external APIs are integrated? (FHIR? NPI Registry?)
2. How are API keys managed?
3. Are API responses validated?
4. Can user input influence API URLs? (SSRF risk)

## Output Format
```markdown
# External API Security
[Assessment and recommendations]
```
