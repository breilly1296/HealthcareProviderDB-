# Sybil Attack Prevention Review

**Last Updated:** 2026-04-16

---

## Protection Layers

| # | Layer | Status | File:Line | Notes |
|---|-------|--------|-----------|-------|
| 1 | Rate Limiting (IP-based) | Verified | `middleware/rateLimiter.ts:340-367` | 10/hr verify, 10/hr vote, 100/hr search. Redis-backed when available. |
| 2 | Honeypot (hidden field) | Verified | `middleware/honeypot.ts` + `routes/verify.ts:61, 96` + frontend `ProviderVerificationForm.tsx:481-492` | Hidden `website` field, fake 200 OK on bot hit. |
| 3 | CAPTCHA (reCAPTCHA v3) | Verified | `middleware/captcha.ts` + `routes/verify.ts:62, 97` | Score >= 0.5; fail-open with fallback limit. |
| 4 | Vote Deduplication | Verified | `schema.prisma:284` + `services/verificationService.ts:463-537` | `@@unique([verificationId, sourceIp])` on `VoteLog`. |
| 5 | Verification 30-day Window | Verified | `services/verificationService.ts:94-137` + `schema.prisma:270-271` | `checkSybilAttack()` blocks duplicate IP and duplicate email in 30-day window. Indexes `idx_vl_sybil_ip` and `idx_vl_sybil_email`. |
| 6 | PII Stripping | Verified | `services/verificationService.ts:329-332` | `stripVerificationPII()` removes `sourceIp`, `userAgent`, `submittedBy` from public responses. |
| 7 | Consensus Threshold | Verified | `services/verificationService.ts:183-207` + `config/constants.ts:36, 42` | Status change requires >= 3 verifications AND score >= 60 AND 2:1 majority ratio. |
| 8 | User Authentication (optional) | Verified | `middleware/auth.ts` + `routes/auth.ts` | Magic-link auth available but NOT required for verifying; see L1 below. |

---

## Detailed Verification

### Rate Limiters applied to verify/vote

```
routes/verify.ts:58-63  POST /api/v1/verify
  verificationRateLimiter (10/hr per IP)
  -> honeypotCheck('website')
  -> verifyCaptcha
  -> handler

routes/verify.ts:93-98  POST /api/v1/verify/:verificationId/vote
  voteRateLimiter (10/hr per IP)
  -> honeypotCheck('website')
  -> verifyCaptcha
  -> handler
```

All three layers run before the DB write.

### Vote deduplication (schema-enforced)

```
prisma/schema.prisma:276-288
  model VoteLog {
    ...
    @@unique([verificationId, sourceIp])
    @@index([sourceIp])
    @@index([verificationId])
  }
```

Service code (`verificationService.ts:462-537`) uses `findUnique({ where: { verificationId_sourceIp }})`:
- Same vote direction -> `AppError.conflict('You have already voted on this verification')` (line 478)
- Opposite direction -> `$transaction` updates `VoteLog.vote` and adjusts `upvotes`/`downvotes` atomically (lines 483-515)
- No existing vote -> new `VoteLog` + increment

### 30-day Sybil window

```
config/constants.ts:26  SYBIL_PREVENTION_WINDOW_MS = 30 * MS_PER_DAY
services/verificationService.ts:94-137  checkSybilAttack()
  - Queries verification_logs for same (npi, planId, sourceIp) within 30 days
  - Queries verification_logs for same (npi, planId, submittedBy) within 30 days
  - Throws AppError.conflict on either match
```

Indexes backing these queries:
- `idx_vl_sybil_ip` on `(provider_npi, plan_id, source_ip, created_at)` (`schema.prisma:271`)
- `idx_vl_sybil_email` on `(provider_npi, plan_id, submitted_by, created_at)` (`schema.prisma:270`)

### PII stripping

`stripVerificationPII()` removes `sourceIp`, `userAgent`, `submittedBy`. Applied in:
- `submitVerification()` return (`verificationService.ts:434`)
- `voteOnVerification()` return (line 573)
- Public list/detail endpoints use `VERIFICATION_PUBLIC_SELECT` (line 19-35) — Prisma-level exclusion is stronger than post-query stripping.

### Consensus / status-change protection

`determineAcceptanceStatus()` (lines 183-207) gates status changes behind:
- `verificationCount >= MIN_VERIFICATIONS_FOR_CONSENSUS` (3)
- `confidenceScore >= MIN_CONFIDENCE_FOR_STATUS_CHANGE` (60)
- `hasClearMajority`: `accepted > notAccepted * 2 || notAccepted > accepted * 2`

Before consensus, status stays `PENDING` — cannot be flipped by a single attacker submission.

---

## Checklist Results

### Rate Limiting
| Item | Status |
|------|--------|
| Verification: 10/hour per IP | Verified (`rateLimiter.ts:340-345`) |
| Voting: 10/hour per IP | Verified (`rateLimiter.ts:351-356`) |
| Search: 100/hour per IP | Verified (`rateLimiter.ts:362-367`) |
| Rate limit headers returned | Verified (`rateLimiter.ts:159-161, 258-260`) |
| Retry-After on 429 | Verified (`rateLimiter.ts:164, 263`) |

### Honeypot
| Item | Status |
|------|--------|
| Hidden `website` field on verification + vote | Verified (`routes/verify.ts:31, 37`; frontend `ProviderVerificationForm.tsx:481-492`) |
| Fake 200 OK to confuse bots | Verified (`middleware/honeypot.ts:21`) |
| Bot detection logged with IP + path | Verified (`middleware/honeypot.ts:15-19`) |

### CAPTCHA
| Item | Status |
|------|--------|
| reCAPTCHA v3 on verification | Verified |
| reCAPTCHA v3 on voting | Verified |
| Score threshold: 0.5 | Verified (`constants.ts:52`) |
| Fallback rate limiting | Verified (`captcha.ts:64, 210-229`) |

### Vote Deduplication
| Item | Status |
|------|--------|
| `VoteLog` table | Verified (`schema.prisma:276-288`) |
| Unique constraint on `(verificationId, sourceIp)` | Verified (`schema.prisma:284`) |
| Vote change allowed | Verified (`verificationService.ts:475-515`) |
| Duplicate prevention | Verified (`verificationService.ts:476-479`) |

### Verification Windows
| Item | Status |
|------|--------|
| Sybil prevention indexes | Verified (`schema.prisma:270-271`) |
| 30-day window check | Verified (`verificationService.ts:94-137`) |
| Duplicate IP check | Verified (lines 102-118) |
| Duplicate email check | Verified (lines 120-136) |

### Monitoring
| Item | Status |
|------|--------|
| Suspicious pattern queries | Missing — no admin/monitoring endpoint exposing these |
| Alerting on high volumes | Missing |
| Admin review queue | Missing — no disputed-verification workflow |

---

## Findings (ranked by severity)

### HIGH

(none)

### MEDIUM

**M1 — User auth not integrated as a trust signal for verification**
- Files: `routes/verify.ts:58-87, 93-118`, `services/verificationService.ts:338-437`
- `POST /verify` and `/vote` are anonymous — `req.user` is not consulted. Authenticated users with long-term accounts are no more trusted than anonymous submitters from the same IP. A Sybil attacker can rotate IPs and/or emails to defeat both the 30-day IP window and email window.
- Also: `vote_logs` uniqueness is only `(verificationId, sourceIp)` — an authenticated user rotating IPs via mobile/VPN can vote multiple times.
- **Mitigation**: When `req.user` is present, also record `userId` on `verification_logs` and `vote_logs`, and enforce uniqueness per-user in addition to per-IP. Weight verifications from long-term accounts higher in confidence scoring.

**M2 — No admin review queue for disputed verifications**
- Current code has no endpoint for flagging disputed provider-plan pairs (high-conflict patterns). `determineAcceptanceStatus` holds status at `PENDING` but humans have no way to triage.
- **Mitigation**: Add `POST /admin/verifications/flag`, query for provider-plan pairs with near-50/50 accept/reject split at 3+ verifications.

**M3 — Honeypot fake success has static `id: 'submitted'`**
- File: `middleware/honeypot.ts:21`
- Bot developers running the form twice (once with honeypot filled, once empty) will see the static response differ from a real verification response and detect the honeypot.
- **Mitigation**: Return a realistic-looking cuid and response shape matching actual success.

### LOW

**L1 — Email-based Sybil check is bypassable (no email verification for verification submitters)**
- File: `services/verificationService.ts:120-136` checks `submittedBy` but `submittedBy` is a free-text field (`VerificationLog.submittedBy`, `schema.prisma:250`) — any email string works. An attacker cycles through fake emails.
- **Mitigation**: Require magic-link auth for verification submissions (higher friction), OR require email verification ping before accepting a verification (e.g., send confirm link).

**L2 — No VPN/proxy detection**
- Files: `services/verificationService.ts:94-137`
- Rate limits and Sybil window use `req.ip` directly. VPN/Tor users bypass both trivially.
- **Mitigation**: Integrate with an IP-intelligence service (IPQualityScore, MaxMind Anonymous Plus). Apply stricter rules to flagged IPs (lower CAPTCHA threshold, blocking known VPN ranges).

**L3 — No anomaly detection on submission patterns**
- Example: 50 verifications in 30 minutes across different providers from the same /16 subnet. Rate limiters are per-IP, not subnet.
- **Mitigation**: Periodic job to flag high-volume subnets; admin alert.

**L4 — `source_ip` comparison is string-equality**
- Files: `services/verificationService.ts:107`
- IPv6 with varying zone identifiers, or IPv4 proxies serializing differently, could cause mismatches. Minor edge case.

**L5 — Frontend honeypot uses `absolute; left: -9999px`**
- File: `ProviderVerificationForm.tsx:481`
- Modern screen readers respect `aria-hidden="true"` (present) but some accessibility tools could still interact. Acceptable trade-off.

### INFORMATIONAL

**I1 — Schema has proper cascade for vote cleanup**
- `VoteLog.verification` relation has `onDelete: Cascade` (`schema.prisma:282`) — deleting a verification removes its votes. No orphan risk.

**I2 — Vote logs retained even after verification expiration**
- `cleanupExpiredVerifications` (`verificationService.ts:757-844`) deletes expired verification logs. Because of `onDelete: Cascade`, votes are also removed. No silent orphans.

**I3 — PII protection is defense-in-depth**
- Both `VERIFICATION_PUBLIC_SELECT` (DB-level) and `stripVerificationPII()` (runtime) enforce redaction. Good layering.

---

## Attack Scenarios & Current Coverage

### Scenario 1: Single-IP bot spam
Mitigation: rate limiter (10/hr) + CAPTCHA (score < 0.5 blocks) + honeypot. **Covered.**

### Scenario 2: Vote manipulation from single user
Mitigation: `VoteLog @@unique([verificationId, sourceIp])`. **Covered for same IP.** Bypassable via VPN rotation (see M1, L2).

### Scenario 3: IP rotation (VPN/proxy cycling)
Mitigation: Each IP still rate-limited. 30-day window blocks repeat from same IP. **Partially covered.** Attacker with 10+ VPN endpoints can still submit 100+ verifications/hour. No VPN detection (L2).

### Scenario 4: Coordinated real-user attack (paid clicks)
Mitigation: 3-verification consensus + 60 confidence score + 2:1 majority ratio required for status changes. Status stays `PENDING` under conflicting submissions. **Covered for headline status change.** But the `verification_logs` rows exist and influence future aggregations. No admin review queue (M2).

### Scenario 5: Authenticated user voting multiple times
Mitigation: `VoteLog` is keyed by `sourceIp`, not `userId`. **Not covered.** Authenticated user on mobile can flip networks and vote again. See M1.

---

## Recommendations (priority order)

1. **M1** — Link verifications/votes to `userId` when authenticated; enforce per-user uniqueness; weight authenticated submissions higher.
2. **M2** — Build admin review queue for high-conflict provider-plan pairs.
3. **M3** — Harden honeypot fake response.
4. **L2** — Integrate IP reputation (IPQS or MaxMind) for VPN/proxy detection.
5. **L1** — Either require auth for verifications, or send email confirmation ping.
6. **L3** — Subnet-level anomaly job; admin alerts.

---

## Monitoring SQL (recommended, from prompt)

```sql
-- IPs with many verifications
SELECT source_ip, COUNT(*) as count
FROM verification_logs
WHERE created_at > NOW() - INTERVAL '1 day'
GROUP BY source_ip
HAVING COUNT(*) > 20
ORDER BY count DESC;

-- Provider-plans with conflicting verifications
SELECT provider_npi, plan_id,
       SUM(CASE WHEN new_value->>'acceptanceStatus' = 'ACCEPTED' THEN 1 ELSE 0 END) as accepts,
       SUM(CASE WHEN new_value->>'acceptanceStatus' = 'NOT_ACCEPTED' THEN 1 ELSE 0 END) as rejects
FROM verification_logs
GROUP BY provider_npi, plan_id
HAVING SUM(CASE WHEN new_value->>'acceptanceStatus' = 'ACCEPTED' THEN 1 ELSE 0 END) > 0
   AND SUM(CASE WHEN new_value->>'acceptanceStatus' = 'NOT_ACCEPTED' THEN 1 ELSE 0 END) > 0;
```

Note: the documented JSON path `new_value->>'accepted'` in the prompt does not match the actual schema; verifications store `acceptanceStatus` in `newValue` (`services/verificationService.ts:406`). Queries above updated to match.

---

## Metrics to Track (not implemented)

- Verifications blocked by rate limit (429 count)
- Verifications blocked by Sybil window (409 conflict count from `checkSybilAttack`)
- Votes rejected as duplicates (409 conflict from `voteOnVerification`)
- CAPTCHA low-score blocks (`captcha.ts:174-181` log volume)
- Honeypot hits (`honeypot.ts:15-19` log volume)
