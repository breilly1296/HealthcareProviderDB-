# VerifyMyProvider External API Security Review

**Last Updated:** January 25, 2026
**Priority:** Medium
**External APIs Identified:** 3 integrations

---

## External API Inventory

### 1. Google reCAPTCHA v3
**Purpose:** Bot protection on verification submissions
**Location:** `packages/backend/src/middleware/captcha.ts`

**Security:**
- API key stored in environment variable
- Server-side validation only
- Score threshold: 0.5

**Potential Issues:**
- Fails open on Google API errors (allows request through)
- No rate limiting on CAPTCHA verification calls

---

### 2. Anthropic Claude API
**Purpose:** Insurance card extraction (AI-powered OCR)
**Location:** `packages/frontend/src/app/api/insurance-card/extract/route.ts`

**Security:**
- API key should be in environment variable
- **CRITICAL:** Key currently in .env.local (committed)
- Server-side only (Next.js API route)

**Potential Issues:**
- API key exposed in repository
- No rate limiting on extraction endpoint
- Image uploads could be used for abuse

---

### 3. NPI Registry API (Future)
**Purpose:** On-demand provider data enrichment
**Endpoint:** `https://npiregistry.cms.hhs.gov/api/?version=2.1`
**Status:** Planned, not implemented

**Notes:**
- Currently using bulk CSV downloads
- API planned for provider detail enrichment
- Rate limited by CMS

---

## API Key Management

### Current State

| API | Key Location | Status |
|-----|--------------|--------|
| reCAPTCHA | process.env.RECAPTCHA_SECRET_KEY | Correct |
| Anthropic | .env.local (committed) | **EXPOSED** |
| NPI Registry | N/A (public API) | N/A |

### Recommended

| API | Storage | Access |
|-----|---------|--------|
| reCAPTCHA | GCP Secret Manager | Backend only |
| Anthropic | GCP Secret Manager | Frontend API route |
| Future keys | GCP Secret Manager | As needed |

---

## SSRF Risk Assessment

### Can User Input Influence API URLs?

| API | User Input Used | SSRF Risk |
|-----|-----------------|-----------|
| reCAPTCHA | Only token (string) | None |
| Anthropic | Image data (base64) | Low |
| NPI Registry | NPI number (validated) | None |

**Conclusion:** Low SSRF risk - no URL construction from user input

---

## API Response Validation

### reCAPTCHA Response
```typescript
// Current validation
const result = await response.json();
if (!result.success) {
  throw new Error('CAPTCHA verification failed');
}
if (result.score < 0.5) {
  throw new Error('Request blocked due to suspicious activity');
}
```
**Status:** Validated

### Anthropic Response
```typescript
// Validates message content structure
const extractedData = JSON.parse(/* response */);
// Returns structured insurance data
```
**Status:** Basic validation

---

## Error Handling

### reCAPTCHA Errors
```typescript
// From captcha.ts
try {
  const response = await fetch(RECAPTCHA_VERIFY_URL, ...);
  // ...
} catch (error) {
  console.error('[CAPTCHA] Error:', error);
  return next(); // FAILS OPEN - allows request
}
```

**Issue:** Fails open on errors - could be exploited if Google API is down

### Anthropic Errors
```typescript
if (!process.env.ANTHROPIC_API_KEY) {
  return NextResponse.json(
    { success: false, error: 'API key not configured' },
    { status: 500 }
  );
}
```
**Status:** Proper error handling

---

## Rate Limiting External Calls

### Current Implementation
- No rate limiting on outbound API calls
- Relies on external service limits

### Recommended
- Cache CAPTCHA verifications briefly
- Rate limit insurance card extraction endpoint
- Implement circuit breaker for external APIs

---

## Timeout Configuration

### Current
- No explicit timeouts on fetch calls
- Relies on Node.js defaults

### Recommended
```typescript
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 5000);

const response = await fetch(url, {
  signal: controller.signal,
  // ...
});
```

---

## Security Recommendations

### Immediate (Critical)
1. **Rotate Anthropic API key** - Currently exposed
2. Move to GCP Secret Manager

### Before Beta
1. Add request timeouts to all external calls
2. Implement circuit breaker pattern
3. Rate limit insurance card extraction

### Future
1. Cache CAPTCHA verifications (short TTL)
2. Monitor external API response times
3. Add fallback behavior for API failures

---

## External API Security Checklist

### API Key Management
- [ ] Rotate exposed Anthropic key
- [ ] Move keys to Secret Manager
- [ ] No hardcoded keys in code

### Request Security
- [x] HTTPS only for all external calls
- [x] No user input in URLs
- [ ] Explicit timeouts configured
- [ ] Rate limiting on outbound calls

### Response Validation
- [x] reCAPTCHA response validated
- [x] Anthropic response parsed safely
- [ ] Schema validation for responses

### Error Handling
- [ ] reCAPTCHA should fail closed (not open)
- [x] Anthropic errors handled properly
- [ ] Circuit breaker for external APIs

---

## Summary

| API | Security Status | Priority |
|-----|-----------------|----------|
| reCAPTCHA | Good (fails open issue) | Medium |
| Anthropic | **Key exposed** | Critical |
| NPI Registry | Not implemented | Future |

**Overall Assessment:** One critical issue (exposed API key) requires immediate action. Other external API integrations follow reasonable security practices.

---

*Rotate Anthropic API key immediately and implement Secret Manager*
