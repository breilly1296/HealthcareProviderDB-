# Prompt Analysis: 09-external-apis.md

**Type:** Security Audit
**Quality Rating:** 3/5

## Intent/Goal
To review integrations with third-party services (CMS, FHIR, etc.).

## Components
- **Search Patterns:** Suggests looking for `fetch(` or `axios(`.
- **Questions:** Basic questions about API keys and SSRF.

## Gaps/Improvements
- **Vague:** It mentions "FHIR integration code (when implemented)" but doesn't point to specific files or planned endpoints.
- **Missing Specifics:** Unlike the NPI pipeline prompt, this doesn't detail *which* external APIs are actually in use or planned (NPI Registry? CMS Data Dissemination? Mapbox?).

## Analysis
A bit of a placeholder. It needs more specific context about the external dependencies of the project to be truly useful.
