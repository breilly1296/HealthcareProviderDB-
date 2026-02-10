# Authentication Architecture - VerifyMyProvider

## Overview

VerifyMyProvider uses a phased authentication strategy. The current implementation (Phase 1) relies on admin-only secret-based authentication for backend management endpoints, with all user-facing endpoints being public and anonymous. User authentication will be introduced in later phases as the platform scales.

---

## Phase 1: Current Implementation (Admin-Only Auth)

### Admin Authentication

Admin endpoints are protected by a shared secret passed via the `X-Admin-Secret` HTTP header. The secret is validated using **timing-safe comparison** to prevent timing attacks.

```typescript
// Admin middleware implementation
import crypto from 'crypto';

function adminAuth(req, res, next) {
  const adminSecret = process.env.ADMIN_SECRET;

  if (!adminSecret) {
    return res.status(503).json({
      success: false,
      error: { message: 'Admin functionality not configured', statusCode: 503 }
    });
  }

  const providedSecret = req.headers['x-admin-secret'];

  if (!providedSecret) {
    return res.status(401).json({
      success: false,
      error: { message: 'Admin secret required', statusCode: 401 }
    });
  }

  const secretBuffer = Buffer.from(adminSecret);
  const providedBuffer = Buffer.from(String(providedSecret));

  if (secretBuffer.length !== providedBuffer.length ||
      !crypto.timingSafeEqual(secretBuffer, providedBuffer)) {
    return res.status(401).json({
      success: false,
      error: { message: 'Invalid admin secret', statusCode: 401 }
    });
  }

  next();
}
```

### Protected Admin Endpoints (9)

All admin endpoints are mounted under `/api/v1/admin` and require the `X-Admin-Secret` header:

| Endpoint | Method | Purpose |
|---|---|---|
| `/admin/cleanup-expired` | POST | Clean up expired verifications |
| `/admin/expiration-stats` | GET | View verification expiration statistics |
| `/admin/health` | GET | Detailed system health check |
| `/admin/cache/clear` | POST | Clear application caches |
| `/admin/cache/stats` | GET | View cache hit/miss statistics |
| `/admin/enrichment/stats` | GET | View data enrichment statistics |
| `/admin/cleanup/sync-logs` | POST | Clean up old sync log entries |
| `/admin/retention/stats` | GET | View data retention statistics |
| `/admin/recalculate-confidence` | POST | Recalculate provider confidence scores |

### Error Responses

| Scenario | Status Code | Message |
|---|---|---|
| `ADMIN_SECRET` env var not set | 503 | "Admin functionality not configured" |
| Header missing or incorrect | 401 | "Invalid admin secret" / "Admin secret required" |
| Valid secret | 200 | Request proceeds to handler |

### Public Endpoints (No Auth Required)

All user-facing endpoints are public and anonymous:

- Provider search and detail views
- Insurance plan search and detail views
- Verification submission (protected by CAPTCHA + rate limiting instead)
- Vote submission (protected by CAPTCHA + rate limiting instead)
- Verification statistics
- Location search
- Health check

**Anti-abuse for public endpoints is handled by rate limiting and CAPTCHA, not authentication.**

---

## Phase 2: Beta Launch (Lightweight Auth)

### Planned Features

| Feature | Description |
|---|---|
| Email verification | Optional email-only verification for higher rate limits |
| Optional accounts | Users can create accounts but are not required to |
| Progressive disclosure | Benefits revealed gradually to encourage signup |
| Email-based rate tiers | Verified emails get higher verification limits |

### Implementation Approach

- **No passwords** in Phase 2 -- email magic links only
- Verify email ownership to increase trust score
- Store minimal user data (email + verification history)
- Session via short-lived JWT in httpOnly cookie

### Graduated Rate Limits (Phase 2)

| User Tier | Verifications/Day | Features |
|---|---|---|
| Anonymous | 5 | Basic search, view scores, submit verifications |
| Email verified | 20 | Higher limits, verification history |

---

## Phase 3: Scale (Full Auth)

### Planned Features

| Feature | Description |
|---|---|
| Full user accounts | Email + password, profile management |
| JWT authentication | Access + refresh token pattern |
| OAuth (optional) | Google, Apple sign-in as convenience options |
| Phone verification | SMS verification for highest trust tier |
| Reputation system | Trust scores based on verification accuracy |
| Premium features | Paid tier with enhanced capabilities |
| API keys | B2B access for third-party integrations |

### Graduated Rate Limits (Phase 3)

| User Tier | Verifications/Day | Additional Features |
|---|---|---|
| Anonymous | 5 | Basic search, view scores |
| Email verified | 20 | Verification history, saved searches |
| Full account | 50 | All features, reputation score, provider alerts |
| Premium ($4.99/mo) | Unlimited | Export data, priority support, API access |

### Premium Tier Comparison

| Feature | Free | Pro ($4.99/mo) |
|---|---|---|
| Provider search | Yes | Yes |
| View confidence scores | Yes | Yes |
| Submit verifications | Limited (5-50/day by tier) | Unlimited |
| Saved providers | No | Yes |
| Insurance change alerts | No | Yes |
| Data export | No | Yes (CSV, JSON) |
| API access | No | Yes (API key) |
| Priority in search results | No | Yes (for providers who claim profiles) |

### JWT Token Strategy (Phase 3)

```
Access Token:  15-minute expiry, stored in memory
Refresh Token: 7-day expiry, stored in httpOnly secure cookie
```

- Access tokens are short-lived and never stored in localStorage
- Refresh tokens rotate on each use (rotation prevents replay)
- Logout invalidates the refresh token server-side

---

## Security Considerations

### Why No Auth in Phase 1

1. **All data is public** -- there is nothing to protect behind a login wall
2. **Anonymous submissions are acceptable** -- community verification works with anonymous crowd data
3. **Rate limiting is sufficient** -- IP-based rate limiting prevents abuse without requiring login
4. **Lower friction = more verifications** -- requiring accounts would dramatically reduce community participation
5. **No HIPAA requirement** -- no patient data means no regulatory requirement for access controls

### When Auth Becomes Necessary

Authentication should be introduced when any of these conditions are met:

- Users need to manage personal data (saved providers, preferences)
- Payment processing is added (premium subscriptions)
- API keys are needed for B2B partners
- Verification quality needs to be tied to user reputation
- Legal/regulatory requirements change

### Defense in Depth (Current)

Even without user authentication, the application employs multiple layers of protection:

| Layer | Mechanism | Purpose |
|---|---|---|
| Rate limiting | IP-based sliding window | Prevent bulk abuse |
| CAPTCHA | reCAPTCHA v3 (score >= 0.5) | Block automated submissions |
| Input validation | Zod schemas | Prevent malformed/malicious input |
| IP tracking | sourceIp on verifications | 30-day Sybil detection |
| Vote deduplication | Unique constraint (verificationId + sourceIp) | One vote per IP per verification |
| Admin auth | Timing-safe secret | Protect management endpoints |
| Helmet headers | Strict CSP, HSTS, etc. | Prevent XSS, clickjacking |
| CORS whitelist | Allowed origins only | Prevent unauthorized cross-origin requests |
