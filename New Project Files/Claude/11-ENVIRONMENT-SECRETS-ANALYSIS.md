# VerifyMyProvider Environment & Secrets Review

**Last Updated:** January 25, 2026
**Priority:** CRITICAL
**Status:** SECURITY ISSUE - Secrets exposed in repository

---

## CRITICAL SECURITY ALERT

### Exposed Credentials Found

**File:** `.env` (root level)
```
DATABASE_URL="postgresql://postgres:[PASSWORD]@35.223.46.51:5432/providerdb"
```

**File:** `packages/frontend/.env.local`
```
ANTHROPIC_API_KEY=sk-ant-api03-[EXPOSED]
```

**IMMEDIATE ACTION REQUIRED:**
1. Rotate the Anthropic API key
2. Change the database password
3. Remove .env files from repository
4. Implement Secret Manager

---

## Environment Variables Expected

### Root Level (`.env.example`)

| Variable | Purpose | Required |
|----------|---------|----------|
| DATABASE_URL | PostgreSQL connection | Yes |
| PORT | Server port (default: 3001) | No |
| NODE_ENV | Environment type | Yes |
| CORS_ORIGIN | Frontend CORS origin | Yes |
| NEXT_PUBLIC_API_URL | Frontend API endpoint | Yes |
| NPI_DATA_URL | NPI data source URL | No |
| RECAPTCHA_SECRET_KEY | reCAPTCHA v3 secret | Yes |
| GCP_PROJECT_ID | GCP project ID | Production |
| GCP_REGION | GCP region | Production |
| CLOUD_SQL_CONNECTION_NAME | Cloud SQL connection | Production |

### Backend Specific

| Variable | Purpose | Required |
|----------|---------|----------|
| DATABASE_URL | PostgreSQL connection | Yes |
| PORT | Server port | No |
| NODE_ENV | Environment mode | Yes |
| FRONTEND_URL | Cloud Run frontend URL | Production |
| RATE_LIMIT_WINDOW_MS | Rate limit window | No |
| RATE_LIMIT_MAX_REQUESTS | Max requests | No |
| ADMIN_SECRET | Admin API secret | Yes |
| RECAPTCHA_SECRET_KEY | reCAPTCHA secret | Yes |

### Frontend Specific

| Variable | Purpose | Required |
|----------|---------|----------|
| NEXT_PUBLIC_API_URL | Backend API URL | Yes |
| NEXT_PUBLIC_POSTHOG_KEY | Analytics key | No |
| NEXT_PUBLIC_ENABLE_ANALYTICS | Feature flag | No |
| ANTHROPIC_API_KEY | Claude API for OCR | Yes (if using) |

---

## Secrets Inventory

| Secret | Type | Current Location | Recommended |
|--------|------|------------------|-------------|
| DATABASE_URL | Connection string | .env (exposed) | Secret Manager |
| ADMIN_SECRET | API key | Environment | Secret Manager |
| RECAPTCHA_SECRET_KEY | API key | Environment | Secret Manager |
| ANTHROPIC_API_KEY | API key | .env.local (exposed) | Secret Manager |
| NEXT_PUBLIC_POSTHOG_KEY | Analytics | Environment | OK as-is |

---

## How Secrets Are Used

### Backend (`packages/backend/src/index.ts`)

```typescript
import dotenv from 'dotenv';
dotenv.config();

// Secrets accessed via process.env
const adminSecret = process.env.ADMIN_SECRET;
const recaptchaKey = process.env.RECAPTCHA_SECRET_KEY;
```

### Admin Authentication (`admin.ts`)

```typescript
const adminSecret = process.env.ADMIN_SECRET;
if (!adminSecret) {
  return res.status(503).json({ error: 'Admin not configured' });
}
if (req.headers['x-admin-secret'] !== adminSecret) {
  return res.status(401).json({ error: 'Unauthorized' });
}
```

### CAPTCHA Middleware (`captcha.ts`)

```typescript
const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET_KEY;
// Skips in development if not configured
// Logs warning but continues
```

### Insurance Card API (`route.ts`)

```typescript
if (!process.env.ANTHROPIC_API_KEY) {
  return NextResponse.json(
    { success: false, error: 'Anthropic API key not configured' },
    { status: 500 }
  );
}
```

---

## .gitignore Configuration

**Current `.gitignore`:**
```
.env
.env.local
.env.*.local
```

**Problem:** Files were committed before being added to .gitignore, or gitignore is being bypassed.

---

## CORS Security

### Allowed Origins (Hardcoded)
```typescript
const ALLOWED_ORIGINS = [
  'https://verifymyprovider.com',
  'https://www.verifymyprovider.com',
  'https://verifymyprovider-frontend-741434145252.us-central1.run.app',
  process.env.FRONTEND_URL,
];
```

### Development Origins
```typescript
if (process.env.NODE_ENV === 'development') {
  ALLOWED_ORIGINS.push('http://localhost:3000', 'http://localhost:3001');
}
```

---

## Secret Generation

### ADMIN_SECRET
```bash
# Generate 64-character hex string
openssl rand -hex 32
```

### DATABASE_URL Format
```
postgresql://[USER]:[PASSWORD]@[HOST]:[PORT]/[DATABASE]
```

### URL Encoding
Password special characters must be URL-encoded:
- `$` → `%24`
- `!` → `%21`

---

## GCP Secret Manager Migration

### Recommended Implementation

```typescript
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

async function getSecret(secretName: string): Promise<string> {
  const client = new SecretManagerServiceClient();
  const [version] = await client.accessSecretVersion({
    name: `projects/${process.env.GCP_PROJECT_ID}/secrets/${secretName}/versions/latest`,
  });
  return version.payload.data.toString();
}

// Usage
const databaseUrl = await getSecret('DATABASE_URL');
const adminSecret = await getSecret('ADMIN_SECRET');
```

### Secrets to Migrate

1. `DATABASE_URL`
2. `ADMIN_SECRET`
3. `RECAPTCHA_SECRET_KEY`
4. `ANTHROPIC_API_KEY`

---

## Remediation Steps

### Immediate (Today)

1. **Rotate Anthropic API Key**
   - Go to console.anthropic.com
   - Revoke exposed key
   - Generate new key
   - Update environment

2. **Change Database Password**
   - Access Cloud SQL console
   - Change postgres password
   - Update connection strings

3. **Remove .env Files from Git**
   ```bash
   git rm --cached .env
   git rm --cached packages/frontend/.env.local
   git rm --cached packages/backend/.env
   git commit -m "Remove exposed secrets"
   ```

4. **Add Pre-commit Hook**
   ```bash
   # .git/hooks/pre-commit
   if git diff --cached --name-only | grep -E '\.env$|\.env\.local$'; then
     echo "ERROR: Attempting to commit .env file"
     exit 1
   fi
   ```

### Short-term (This Week)

5. **Implement Secret Manager**
   - Create secrets in GCP
   - Update application code
   - Test in staging

6. **Audit Git History**
   - Use BFG Repo Cleaner if needed
   - Force push to remove history

### Long-term

7. **Secret Rotation Policy**
   - Quarterly rotation
   - Automated alerts

---

## Security Summary

| Item | Status | Risk |
|------|--------|------|
| .env.example documented | Good | None |
| Secrets in environment | Partial | Medium |
| **Secrets committed** | **CRITICAL** | **High** |
| .gitignore configured | Good | None |
| Admin protection | Good | Low |
| CORS configuration | Good | Low |
| Security headers | Excellent | None |

---

## Checklist

### Immediate Actions
- [ ] Rotate Anthropic API key
- [ ] Change database password
- [ ] Remove .env files from git
- [ ] Add pre-commit hook

### Migration
- [ ] Create GCP Secret Manager secrets
- [ ] Update application to use Secret Manager
- [ ] Test in staging
- [ ] Deploy to production

### Documentation
- [ ] Document secret rotation process
- [ ] Document Secret Manager access
- [ ] Update onboarding docs

---

*CRITICAL: Rotate exposed credentials immediately*
