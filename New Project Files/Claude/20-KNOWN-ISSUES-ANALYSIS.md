# VerifyMyProvider Known Issues

**Last Updated:** January 25, 2026

---

## Critical Issues

### ISSUE-001: Exposed Secrets in Repository
**Severity:** CRITICAL
**Status:** OPEN

**Description:**
Database credentials and Anthropic API key are committed in .env files.

**Impact:**
- Potential unauthorized database access
- API key abuse

**Files Affected:**
- `.env` (root)
- `packages/frontend/.env.local`
- `packages/backend/.env`

**Workaround:**
None - credentials must be rotated immediately.

**Fix Required:**
1. Rotate all exposed credentials
2. Remove .env files from git history
3. Implement Secret Manager

---

### ISSUE-002: Rate Limiting Won't Scale Horizontally
**Severity:** HIGH
**Status:** KNOWN LIMITATION

**Description:**
In-memory rate limiting uses per-process storage. Multiple Cloud Run instances would have independent counters.

**Impact:**
- Rate limits become (limit × instances) effective
- Attackers could bypass by distributing requests

**Workaround:**
Keep `maxInstances=1` in Cloud Run configuration.

**Fix Required:**
Implement Redis-based rate limiting before scaling.

---

## High Priority Issues

### ISSUE-003: NPI Import Deactivation Logic Bug
**Severity:** HIGH
**Status:** OPEN

**Description:**
`import-npi-direct.ts` uses string comparison for deactivation dates instead of proper date parsing.

**Impact:**
- May incorrectly import deactivated providers
- May incorrectly skip active providers

**Location:**
`scripts/import-npi-direct.ts` lines 398-407

**Workaround:**
Run `cleanup-deactivated-providers.ts` after imports.

**Fix Required:**
Parse dates before comparison.

---

### ISSUE-004: Admin Auth Uses String Comparison
**Severity:** MEDIUM
**Status:** OPEN

**Description:**
Admin secret comparison uses basic `!==` instead of timing-safe comparison.

**Impact:**
- Theoretical timing attack vulnerability
- Low practical risk

**Location:**
`packages/backend/src/routes/admin.ts` line 33

**Workaround:**
None needed for current threat model.

**Fix Required:**
Use `crypto.timingSafeEqual()`.

---

## Medium Priority Issues

### ISSUE-005: CAPTCHA Fails Open
**Severity:** MEDIUM
**Status:** KNOWN LIMITATION

**Description:**
When Google reCAPTCHA API errors, requests are allowed through (fail open behavior).

**Impact:**
- If Google API is down, bot protection is disabled
- Could be exploited during outages

**Location:**
`packages/backend/src/middleware/captcha.ts`

**Workaround:**
Monitor for Google API issues.

**Fix Required:**
Consider fail-closed with queue, or rate limiting fallback.

---

### ISSUE-006: City Name Normalization Limited to NYC
**Severity:** MEDIUM
**Status:** KNOWN LIMITATION

**Description:**
City name normalization script only handles NYC neighborhoods.

**Impact:**
- Other cities have inconsistent naming
- Search may miss some providers

**Location:**
`scripts/normalize-city-names.ts`

**Workaround:**
None - live with inconsistent names for non-NYC cities.

**Fix Required:**
Expand normalization to other major cities.

---

### ISSUE-007: Taxonomy Mapping Duplication
**Severity:** MEDIUM
**Status:** OPEN

**Description:**
Taxonomy codes are defined in two places that may diverge.

**Impact:**
- Inconsistent specialty categorization
- Maintenance burden

**Locations:**
- `scripts/import-npi-direct.ts` (116 prefixes)
- `src/taxonomy-mappings.ts` (876+ codes)

**Workaround:**
None - risk of inconsistency.

**Fix Required:**
Consolidate to single source of truth.

---

## Low Priority Issues

### ISSUE-008: No Admin Action Audit Logging
**Severity:** LOW
**Status:** OPEN

**Description:**
Admin operations (cleanup, etc.) are not specifically logged for audit.

**Impact:**
- Cannot trace who triggered admin actions
- Compliance gap

**Workaround:**
Review Cloud Logging manually.

**Fix Required:**
Add structured admin action logging.

---

### ISSUE-009: providerCount Denormalization Risk
**Severity:** LOW
**Status:** KNOWN LIMITATION

**Description:**
Location.providerCount is denormalized and may become inconsistent.

**Impact:**
- Wrong provider counts displayed
- No application logic to maintain it currently

**Workaround:**
Recalculate periodically with SQL.

**Fix Required:**
Add database trigger or application logic.

---

### ISSUE-010: Missing Geographic Coordinates
**Severity:** LOW
**Status:** ENHANCEMENT

**Description:**
Location table has no latitude/longitude fields.

**Impact:**
- Cannot do radius searches
- Cannot show on maps

**Workaround:**
Use ZIP code as proxy for location.

**Fix Required:**
Add geocoding during import or via API.

---

## Resolved Issues

### ISSUE-R001: Unauthenticated Verification Spam
**Severity:** HIGH
**Status:** RESOLVED (Jan 2026)

**Resolution:**
Rate limiting implemented (10 verifications/hour per IP).

---

### ISSUE-R002: Vote Manipulation
**Severity:** MEDIUM
**Status:** RESOLVED (Jan 2026)

**Resolution:**
VoteLog table with unique constraint per IP per verification.

---

### ISSUE-R003: Confidence Score Dropping Bug
**Severity:** HIGH
**Status:** RESOLVED (Jan 2026)

**Resolution:**
Fixed algorithm to properly count past verifications.

---

## Issue Tracking

| ID | Severity | Status | Priority |
|----|----------|--------|----------|
| 001 | Critical | Open | Immediate |
| 002 | High | Known | Pre-scale |
| 003 | High | Open | Next import |
| 004 | Medium | Open | Low priority |
| 005 | Medium | Known | Consider |
| 006 | Medium | Known | Future |
| 007 | Medium | Open | Future |
| 008 | Low | Open | Future |
| 009 | Low | Known | Future |
| 010 | Low | Enhancement | Future |

---

*Report issues at https://github.com/[repo]/issues*
