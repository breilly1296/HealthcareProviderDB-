# Sybil Attack Prevention

## Status: ALL 5 LAYERS IMPLEMENTED

## Overview

Sybil attacks occur when a single adversary creates multiple fake identities to manipulate a system. In VerifyMyProvider, this could mean submitting fraudulent verifications or manipulating votes to distort provider confidence scores. Five independent protection layers work together to mitigate these attacks.

## Protection Layers

### Layer 1: Rate Limiting

IP-based rate limits prevent any single source from flooding the system.

| Endpoint Category | Limit | Window |
|-------------------|-------|--------|
| Verification submissions | 10 requests | per hour |
| Voting | 10 requests | per hour |
| Search | 100 requests | per hour |

Rate limits are applied per IP address. Exceeding the limit returns HTTP 429 (Too Many Requests) with a `Retry-After` header.

### Layer 2: Honeypot

A hidden form field technique to detect automated bot submissions.

- A hidden `website` field is included in verification and vote forms
- The field is invisible to real users (CSS `display: none` or off-screen positioning)
- Bots that parse the DOM and fill all fields will populate this field
- If the honeypot field contains a value, the server:
  - Returns a fake `200 OK` response (so the bot believes it succeeded)
  - Logs the detection event for monitoring
  - Does **not** process the submission

### Layer 3: CAPTCHA

Google reCAPTCHA v3 provides invisible bot detection through behavioral analysis.

- **Score threshold:** >= 0.5 required to proceed
- Scores below 0.5 are rejected with `CAPTCHA_FAILED` error
- **Fallback:** If reCAPTCHA service is unavailable, rate limiting drops to 3 requests per hour as a compensating control
- reCAPTCHA v3 runs invisibly (no user interaction required)

### Layer 4: Vote Deduplication

Database-level enforcement of one vote per IP per verification.

- `VoteLog` table has a unique constraint on `(verificationId, sourceIp)`
- Each IP address can cast only one vote per verification record
- **Vote changes are allowed** - a user can switch their vote (e.g., helpful to not helpful)
- **Duplicate votes are prevented** - attempting to cast the same vote again is rejected
- Enforced at the database level, making it impossible to bypass through API manipulation

### Layer 5: Verification Windows

The `checkSybilAttack()` function in `verificationService.ts` performs temporal and identity-based duplicate detection.

#### Checks Performed

1. **30-day window check** - Looks for existing verifications for the same NPI + plan within the past 30 days
2. **Duplicate IP check** - Flags if the same IP has already submitted a verification for this NPI + plan combination
3. **Duplicate email check** - Flags if the same `submittedBy` email has already submitted a verification for this NPI + plan combination

#### Database Indexes

Two composite indexes support efficient Sybil detection queries:

```sql
-- Index for IP-based duplicate detection
CREATE INDEX idx_sybil_ip ON verification_logs (npi, plan_id, source_ip, created_at);

-- Index for email-based duplicate detection
CREATE INDEX idx_sybil_email ON verification_logs (npi, plan_id, submitted_by, created_at);
```

## Attack Scenarios

### Bot Spam

**Attack:** Automated scripts submit hundreds of fake verifications.

**Mitigation:** Rate limiting caps submissions at 10 per hour per IP, even with VPN rotation. Honeypot catches naive bots. reCAPTCHA v3 detects automated behavior patterns.

### Vote Manipulation

**Attack:** Attacker tries to cast many votes to inflate or deflate a verification's credibility.

**Mitigation:** Unique constraint on `(verificationId, sourceIp)` limits each IP to exactly one vote per verification. Vote changes are allowed but duplicate votes are blocked.

### VPN Rotation

**Attack:** Attacker rotates through VPN exit nodes to bypass IP-based rate limiting.

**Mitigation:** Each new IP is still individually rate-limited. reCAPTCHA v3 behavioral analysis detects bot-like patterns regardless of IP. Honeypot catches automated form fillers.

### Coordinated Attack

**Attack:** Multiple real people coordinate to submit conflicting verifications to lower confidence scores.

**Mitigation:** Conflicting verifications naturally result in low confidence scores, which is the correct outcome when there is genuine disagreement. The confidence algorithm treats conflicting data as uncertain, which is the appropriate signal to users.
