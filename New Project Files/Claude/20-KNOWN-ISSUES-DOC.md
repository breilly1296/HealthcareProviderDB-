# VerifyMyProvider Known Issues

**Last Updated:** 2026-01-31
**Analyzed By:** Claude Code

---

## Active Issues

### ISSUE-001: Rate Limiter Window Reset Not Sliding

**Status:** Low Priority
**Affects:** All rate-limited endpoints
**Severity:** Low

**Description:**
The in-memory rate limiter uses fixed windows instead of sliding windows, which can allow brief bursts at window boundaries.

**Impact:**
Users could potentially make 20 requests in a short period by timing requests at the window boundary (10 at end of window, 10 at start of next).

**Workaround:**
Redis mode uses proper sliding windows. Enable Redis for production:
```bash
REDIS_URL=redis://your-redis-instance:6379
```

**Planned Fix:**
Implement sliding window for in-memory mode in v1.1.

---

### ISSUE-002: Location Names Not Auto-Populated

**Status:** Enhancement
**Affects:** Location grouping feature
**Severity:** Low

**Description:**
Location records are created from provider addresses but don't have human-readable names (e.g., "Cedars-Sinai Medical Center").

**Impact:**
Users see addresses instead of facility names when browsing locations.

**Workaround:**
Manually populate location names for major hospitals/clinics.

**Planned Fix:**
Implement location enrichment using Google Places API or NPI organization name matching.

---

### ISSUE-003: Insurance Card OCR Limited to Common Formats

**Status:** Known Limitation
**Affects:** Insurance card upload feature
**Severity:** Medium

**Description:**
The OCR feature may not correctly extract plan information from:
- Cards with unusual layouts
- Non-English text
- Heavily stylized fonts
- Low-quality photos

**Impact:**
Some users may need to manually enter plan information.

**Workaround:**
- Ensure good lighting when photographing card
- Use the manual plan search as fallback

**Planned Fix:**
Fine-tune prompts and add support for more card formats in v1.2.

---

### ISSUE-004: Search Performance on Large Result Sets

**Status:** Optimization Needed
**Affects:** Provider search
**Severity:** Low

**Description:**
Searches with very broad criteria (e.g., state-only search with "CA") may be slow due to large result sets.

**Impact:**
State-only searches for populous states (CA, TX, NY, FL) may take 1-2 seconds.

**Workaround:**
Encourage users to add additional filters (city, specialty).

**Planned Fix:**
Add search result caching for common queries.

---

### ISSUE-005: Vote Changes Not Reflected Immediately

**Status:** UI Issue
**Affects:** Verification voting
**Severity:** Low

**Description:**
When a user changes their vote (e.g., upvote to downvote), the UI may show stale counts until page refresh.

**Impact:**
Minor UX issue; actual data is correct in database.

**Workaround:**
Refresh the page to see updated vote counts.

**Planned Fix:**
Implement optimistic UI updates with proper rollback.

---

## Resolved Issues

### RESOLVED-001: CAPTCHA Tokens Expire Before Submission

**Resolved In:** v0.9.1
**Original Issue:** Users completing long verification forms would have expired CAPTCHA tokens by submission time.

**Resolution:**
Generate CAPTCHA token immediately before form submission instead of on page load.

---

### RESOLVED-002: Memory Leak in Rate Limiter

**Resolved In:** v0.9.2
**Original Issue:** In-memory rate limiter accumulated entries without cleanup, causing memory growth over time.

**Resolution:**
Added periodic cleanup task that removes expired entries every 5 minutes.

---

### RESOLVED-003: Sybil Attack Vulnerability

**Resolved In:** v1.0.0
**Original Issue:** Users could submit multiple verifications for the same provider-plan combination.

**Resolution:**
Added 24-hour cooldown per IP/provider/plan combination with Sybil prevention indexes.

---

## Limitations (By Design)

### No User Accounts

**Description:**
The MVP uses anonymous crowdsourcing without user accounts.

**Rationale:**
Lower friction encourages more verifications. CAPTCHA + rate limiting prevents abuse.

**Future:**
User accounts planned for v2.0 with graduated trust levels.

---

### No Real-Time Updates

**Description:**
Verification data is not pushed to clients in real-time.

**Rationale:**
MVP complexity reduction. Most users view data once.

**Future:**
Consider WebSocket or SSE for high-traffic providers.

---

### Limited Insurance Plan Database

**Description:**
Not all insurance plans are pre-loaded. Users may need to enter custom plan IDs.

**Rationale:**
Insurance plan landscape is complex and varies by region.

**Future:**
Import insurance plan database from public sources.

---

## Reporting New Issues

When reporting issues, please include:

1. **Environment:** Production/Development/Local
2. **Steps to reproduce**
3. **Expected behavior**
4. **Actual behavior**
5. **Screenshots/logs** (if applicable)
6. **Browser/device** (for frontend issues)

Report issues at: https://github.com/verifymyprovider/issues

---

## Issue Severity Levels

| Level | Description | Response Time |
|-------|-------------|---------------|
| **Critical** | Service down, data loss | Immediate |
| **High** | Major feature broken | < 24 hours |
| **Medium** | Feature partially broken | < 1 week |
| **Low** | Minor issue, workaround exists | Next release |
