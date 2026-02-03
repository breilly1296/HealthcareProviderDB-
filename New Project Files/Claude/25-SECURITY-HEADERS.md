# VerifyMyProvider Security Headers Analysis

**Last Updated:** 2026-01-31
**Analyzed By:** Claude Code

---

## Executive Summary

Security headers are implemented at multiple layers: Vercel (frontend), Cloud Run (backend), and Express middleware. The configuration provides defense-in-depth against common web vulnerabilities.

---

## Header Implementation

### Frontend (Vercel)

```json
// vercel.json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "X-XSS-Protection",
          "value": "1; mode=block"
        },
        {
          "key": "Referrer-Policy",
          "value": "strict-origin-when-cross-origin"
        },
        {
          "key": "Permissions-Policy",
          "value": "camera=(), microphone=(), geolocation=()"
        }
      ]
    }
  ]
}
```

### Backend (Express)

```typescript
// packages/backend/src/middleware/securityHeaders.ts

import helmet from 'helmet';

export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://www.google.com/recaptcha/"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", process.env.CORS_ORIGIN],
      frameSrc: ["https://www.google.com/recaptcha/"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: []
    }
  },
  crossOriginEmbedderPolicy: false,  // Needed for external resources
  crossOriginOpenerPolicy: { policy: "same-origin" },
  crossOriginResourcePolicy: { policy: "same-site" },
  dnsPrefetchControl: { allow: false },
  frameguard: { action: "deny" },
  hidePoweredBy: true,
  hsts: {
    maxAge: 31536000,  // 1 year
    includeSubDomains: true,
    preload: true
  },
  ieNoOpen: true,
  noSniff: true,
  originAgentCluster: true,
  permittedCrossDomainPolicies: { permittedPolicies: "none" },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  xssFilter: true
});
```

---

## Security Headers Reference

### X-Content-Type-Options

```
X-Content-Type-Options: nosniff
```

**Purpose:** Prevents MIME type sniffing
**Risk Mitigated:** Content type confusion attacks

| Value | Behavior |
|-------|----------|
| `nosniff` | Browser must use declared Content-Type |

### X-Frame-Options

```
X-Frame-Options: DENY
```

**Purpose:** Prevents clickjacking
**Risk Mitigated:** UI redressing attacks

| Value | Behavior |
|-------|----------|
| `DENY` | Cannot be framed by any site |
| `SAMEORIGIN` | Can only be framed by same origin |
| `ALLOW-FROM uri` | Can only be framed by specified URI |

### Content-Security-Policy

```
Content-Security-Policy: default-src 'self'; script-src 'self' https://www.google.com/recaptcha/; ...
```

**Purpose:** Controls resource loading
**Risk Mitigated:** XSS, data injection, clickjacking

| Directive | Purpose |
|-----------|---------|
| `default-src` | Fallback for other directives |
| `script-src` | JavaScript sources |
| `style-src` | CSS sources |
| `img-src` | Image sources |
| `connect-src` | XHR/fetch destinations |
| `frame-src` | iframe sources |
| `object-src` | Plugin sources |

### Strict-Transport-Security (HSTS)

```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
```

**Purpose:** Forces HTTPS
**Risk Mitigated:** Protocol downgrade, cookie hijacking

| Parameter | Purpose |
|-----------|---------|
| `max-age` | Duration to enforce HTTPS |
| `includeSubDomains` | Apply to all subdomains |
| `preload` | Eligible for browser preload list |

### Referrer-Policy

```
Referrer-Policy: strict-origin-when-cross-origin
```

**Purpose:** Controls Referer header
**Risk Mitigated:** Information leakage

| Value | Behavior |
|-------|----------|
| `strict-origin-when-cross-origin` | Full URL for same-origin, origin only for cross-origin |
| `no-referrer` | Never send Referer |
| `origin` | Send origin only |

### Permissions-Policy

```
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

**Purpose:** Controls browser features
**Risk Mitigated:** Unwanted feature access

| Feature | Value | Meaning |
|---------|-------|---------|
| `camera` | `()` | Disabled |
| `microphone` | `()` | Disabled |
| `geolocation` | `()` | Disabled |

---

## CORS Configuration

```typescript
// packages/backend/src/app.ts

app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-Admin-Secret'],
  credentials: false,  // No cookies
  maxAge: 86400  // Preflight cache: 24 hours
}));
```

### Response Headers

```
Access-Control-Allow-Origin: https://verifymyprovider.com
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, X-Admin-Secret
Access-Control-Max-Age: 86400
```

---

## Rate Limit Headers

```typescript
// Added by rate limiter middleware

res.setHeader('X-RateLimit-Limit', limit);
res.setHeader('X-RateLimit-Remaining', remaining);
res.setHeader('X-RateLimit-Reset', resetTime);

// On 429 response
res.setHeader('Retry-After', secondsUntilReset);
```

### Example Response

```
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 7
X-RateLimit-Reset: 1706745600
```

---

## Security Header Audit

### Current Status

| Header | Frontend | Backend | Status |
|--------|----------|---------|--------|
| X-Content-Type-Options | ✅ | ✅ | Configured |
| X-Frame-Options | ✅ | ✅ | Configured |
| X-XSS-Protection | ✅ | ✅ | Configured |
| Content-Security-Policy | ⚠️ | ✅ | Backend only |
| Strict-Transport-Security | Auto | ✅ | Configured |
| Referrer-Policy | ✅ | ✅ | Configured |
| Permissions-Policy | ✅ | ⚠️ | Frontend only |
| Cross-Origin-Opener-Policy | ❌ | ✅ | Backend only |
| Cross-Origin-Resource-Policy | ❌ | ✅ | Backend only |

### Recommendations

1. **Add CSP to frontend**
   ```typescript
   // next.config.js
   const securityHeaders = [
     {
       key: 'Content-Security-Policy',
       value: "default-src 'self'; script-src 'self' https://www.google.com/recaptcha/"
     }
   ];
   ```

2. **Add Permissions-Policy to backend**
   ```typescript
   res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
   ```

---

## Testing Security Headers

### Online Tools

- https://securityheaders.com/ - Grade A-F
- https://observatory.mozilla.org/ - Mozilla scanner
- https://csp-evaluator.withgoogle.com/ - CSP validator

### Manual Check

```bash
# Check response headers
curl -I https://api.verifymyprovider.com/health

# Expected output includes:
# x-content-type-options: nosniff
# x-frame-options: DENY
# strict-transport-security: max-age=31536000; includeSubDomains; preload
```

### Automated Testing

```typescript
// Example test
describe('Security Headers', () => {
  it('should include security headers', async () => {
    const response = await request(app).get('/health');

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['strict-transport-security']).toContain('max-age=');
  });
});
```

---

## Security Header Best Practices

### Do

- ✅ Use `helmet` for Express apps
- ✅ Enable HSTS with long max-age
- ✅ Set CSP with minimal permissions
- ✅ Disable unused browser features
- ✅ Test headers regularly

### Don't

- ❌ Use `unsafe-inline` in CSP unless necessary
- ❌ Set permissive CORS in production
- ❌ Disable security headers for "convenience"
- ❌ Ignore browser console warnings

---

## Conclusion

Security headers are **well-implemented**:

- ✅ Standard headers configured
- ✅ HTTPS enforced via HSTS
- ✅ XSS and clickjacking mitigated
- ✅ CORS properly restricted
- ✅ Rate limit headers for debugging

**Minor improvements needed:**
- Add full CSP to frontend
- Add Permissions-Policy to backend
- Regular security header audits
