# VerifyMyProvider Environment & Secrets Analysis

**Last Updated:** 2026-01-31
**Analyzed By:** Claude Code

---

## Executive Summary

Secrets are properly managed through environment variables and GCP Secret Manager. No hardcoded secrets found in the codebase.

---

## Environment Variables Inventory

### Backend Configuration

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `DATABASE_URL` | ✅ Yes | - | PostgreSQL connection string |
| `PORT` | No | 3001 | Server port |
| `NODE_ENV` | No | development | Environment mode |
| `CORS_ORIGIN` | No | localhost:3000 | Allowed CORS origins |

### Frontend Configuration

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `NEXT_PUBLIC_API_URL` | ✅ Yes | - | Backend API URL |
| `NEXT_PUBLIC_POSTHOG_KEY` | No | - | PostHog analytics |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | No | - | reCAPTCHA site key |

### Security Secrets

| Variable | Required | Storage | Purpose |
|----------|----------|---------|---------|
| `RECAPTCHA_SECRET_KEY` | Prod only | Secret Manager | CAPTCHA verification |
| `ADMIN_SECRET` | Prod only | Secret Manager | Admin endpoint auth |
| `ANTHROPIC_API_KEY` | No | Secret Manager | Insurance card OCR |

### Optional Services

| Variable | Required | Purpose |
|----------|----------|---------|
| `REDIS_URL` | No | Distributed rate limiting |

### GCP / Cloud Run

| Variable | Required | Purpose |
|----------|----------|---------|
| `GCP_PROJECT_ID` | Prod | GCP project ID |
| `GCP_REGION` | Prod | Deployment region |
| `CLOUD_SQL_CONNECTION_NAME` | Prod | Cloud SQL proxy |

### CAPTCHA Configuration

| Variable | Default | Purpose |
|----------|---------|---------|
| `CAPTCHA_FAIL_MODE` | open | open or closed |
| `CAPTCHA_MIN_SCORE` | 0.5 | Minimum score (0-1) |
| `CAPTCHA_API_TIMEOUT_MS` | 5000 | API timeout |
| `CAPTCHA_FALLBACK_MAX_REQUESTS` | 3 | Fallback limit |

---

## .env.example Contents

```bash
# Root .env.example

# Backend Configuration
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/healthcare_providers"
PORT=3001
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000

# Frontend Configuration
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1

# NPI Data Source
NPI_DATA_URL="https://download.cms.gov/nppes/NPI_Files.html"

# Security
# RECAPTCHA_SECRET_KEY=your-recaptcha-secret-key

# Docker / Cloud Run (Production)
# GCP_PROJECT_ID=your-project-id
# GCP_REGION=us-central1
# CLOUD_SQL_CONNECTION_NAME=project:region:instance
```

---

## Secret Manager Inventory (Production)

| Secret Name | Purpose | Rotation |
|-------------|---------|----------|
| `DATABASE_URL` | PostgreSQL connection | Manual |
| `ADMIN_SECRET` | Admin endpoint auth | Manual |
| `RECAPTCHA_SECRET_KEY` | CAPTCHA verification | Manual |
| `ANTHROPIC_API_KEY` | Insurance OCR (optional) | Manual |

---

## Security Scan Results

### Hardcoded Secrets Check

```bash
grep -r "sk-ant\|password.*=.*['\"]" packages/backend/src/ --include="*.ts"
# Result: No matches found ✅
```

### API Keys Check

```bash
grep -r "api[_-]?key.*=.*['\"]" packages/ --include="*.ts" --include="*.tsx"
# Result: No hardcoded keys ✅
```

### Connection Strings Check

```bash
grep -r "postgresql://\|redis://" packages/ --include="*.ts"
# Result: Only references to process.env ✅
```

### Git Check

```bash
git ls-files | grep -E "^\.env$|/\.env$"
# Result: No .env files committed ✅
```

---

## Code References

### Database URL Usage

```typescript
// prisma/schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")  // ✅ From environment
}
```

### CAPTCHA Secret Usage

```typescript
// packages/backend/src/middleware/captcha.ts
const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET_KEY;  // ✅ From environment

if (!RECAPTCHA_SECRET) {
  console.warn('[CAPTCHA] Not configured');
  return next();  // ✅ Graceful degradation
}
```

### Admin Secret Usage

```typescript
// packages/backend/src/routes/admin.ts
const adminSecret = process.env.ADMIN_SECRET;

if (!adminSecret) {
  return res.status(503).json({
    error: 'Admin endpoints not configured'  // ✅ Graceful degradation
  });
}
```

---

## Checklist

### Secret Storage
- [x] No secrets hardcoded in source code
- [x] `.env` files in `.gitignore`
- [x] `.env.example` documents required variables
- [x] Production secrets in GCP Secret Manager
- [ ] Secret rotation procedure documented
- [ ] Access audit for Secret Manager

### Environment Separation
- [x] Development uses local `.env`
- [x] Production uses Secret Manager
- [x] Test environment separate from production
- [ ] Staging environment configured

### Validation
- [x] Backend validates required env vars
- [x] Graceful degradation for optional vars
- [x] Clear error messages for missing vars

---

## Cloud Run Secret Mounting

```yaml
# Cloud Run service configuration
spec:
  template:
    spec:
      containers:
        - env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: DATABASE_URL
                  key: latest
            - name: ADMIN_SECRET
              valueFrom:
                secretKeyRef:
                  name: ADMIN_SECRET
                  key: latest
            - name: RECAPTCHA_SECRET_KEY
              valueFrom:
                secretKeyRef:
                  name: RECAPTCHA_SECRET_KEY
                  key: latest
```

---

## GCP Secret Manager Commands

```bash
# List all secrets
gcloud secrets list --project=verifymyprovider

# View secret (careful!)
gcloud secrets versions access latest --secret=ADMIN_SECRET

# Create new secret
gcloud secrets create NEW_SECRET --replication-policy="automatic"
echo -n "secret-value" | gcloud secrets versions add NEW_SECRET --data-file=-

# Grant access to Cloud Run service account
gcloud secrets add-iam-policy-binding SECRET_NAME \
  --member="serviceAccount:SERVICE_ACCOUNT@PROJECT.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

---

## Common Issues

### Missing Required Variable

```
Error: DATABASE_URL environment variable is not set
Fix: Add to .env or mount from Secret Manager
```

### Wrong Format

```
Error: Invalid DATABASE_URL format
Fix: postgresql://user:password@host:port/database
```

### Secret Not Mounted

```
Error: ADMIN_SECRET not configured
Fix: Mount secret in Cloud Run service configuration
```

---

## Recommendations

### Immediate
- [x] All production secrets in Secret Manager
- [ ] Document secret rotation procedure
- [ ] Set up access audit logging

### Security
- [ ] Enable Secret Manager audit logs
- [ ] Review IAM permissions for secrets
- [ ] Set up break-glass procedure

### Monitoring
- [ ] Alert on secret access failures
- [ ] Monitor for exposed credentials

---

## Conclusion

Secret management is **properly implemented**:

- ✅ No hardcoded secrets in code
- ✅ Environment variables for all secrets
- ✅ .env files excluded from git
- ✅ Secret Manager for production
- ✅ Graceful degradation when secrets missing

**Action items:**
1. Document secret rotation procedure
2. Set up access audit for Secret Manager
3. Create break-glass procedure for emergencies
