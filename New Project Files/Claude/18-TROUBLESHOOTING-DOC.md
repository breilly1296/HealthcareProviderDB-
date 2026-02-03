# VerifyMyProvider Troubleshooting Guide

**Last Updated:** 2026-01-31
**Analyzed By:** Claude Code

---

## Common Issues

### 1. Rate Limit Exceeded (429)

**Symptoms:**
```json
{
  "success": false,
  "error": {
    "message": "Too many requests",
    "code": "TOO_MANY_REQUESTS"
  }
}
```

**Headers:**
```
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1706745600
Retry-After: 3600
```

**Causes:**
- Exceeded verification limit (10/hour)
- Exceeded search limit (100/hour)
- Using shared IP (VPN, corporate network)

**Solutions:**
1. Wait for rate limit reset (check `Retry-After` header)
2. If using shared IP, contact support for allowlisting
3. Implement exponential backoff in your client

---

### 2. CAPTCHA Verification Failed (403)

**Symptoms:**
```json
{
  "success": false,
  "error": {
    "message": "Suspicious activity blocked",
    "code": "CAPTCHA_FAILED"
  }
}
```

**Causes:**
- Invalid CAPTCHA token
- CAPTCHA token expired (2 minutes lifetime)
- Low CAPTCHA score (bot-like behavior)
- Headless browser detected

**Solutions:**
1. Ensure CAPTCHA token is fresh (generate immediately before request)
2. Use visible reCAPTCHA if score is consistently low
3. Check browser for bot-detection issues
4. Verify site key matches environment

---

### 3. CAPTCHA Not Configured (Degraded Mode)

**Symptoms:**
- Requests succeed but with header:
```
X-Security-Degraded: captcha-unavailable
```

**Causes:**
- `RECAPTCHA_SECRET_KEY` not set
- Google API temporarily unavailable

**Solutions:**
1. Set `RECAPTCHA_SECRET_KEY` environment variable
2. If Google API is down, system uses fallback rate limiting (3/hr)

---

### 4. Database Connection Failed

**Symptoms:**
```json
{
  "success": false,
  "error": {
    "message": "Database connection failed",
    "code": "INTERNAL_ERROR"
  }
}
```

**Causes:**
- Invalid `DATABASE_URL`
- Cloud SQL instance down
- Connection pool exhausted
- Network connectivity issues

**Solutions:**

**Local Development:**
```bash
# Check PostgreSQL is running
pg_isready -h localhost -p 5432

# Verify connection string
psql $DATABASE_URL -c "SELECT 1"
```

**Production (Cloud Run):**
```bash
# Check Cloud SQL instance status
gcloud sql instances describe verifymyprovider-db

# Check Cloud Run logs
gcloud logging read "resource.type=cloud_run_revision AND severity>=ERROR"

# Verify secret is mounted
gcloud run services describe verifymyprovider-backend --format="yaml" | grep DATABASE_URL
```

---

### 5. Provider Not Found (404)

**Symptoms:**
```json
{
  "success": false,
  "error": {
    "message": "Provider not found",
    "code": "NOT_FOUND"
  }
}
```

**Causes:**
- Invalid NPI number
- NPI deactivated in NPPES
- Data not yet imported

**Solutions:**
1. Verify NPI format (exactly 10 digits)
2. Check NPI on NPPES website: https://npiregistry.cms.hhs.gov/
3. Check if NPI import has completed:
```sql
SELECT * FROM sync_logs ORDER BY started_at DESC LIMIT 1;
```

---

### 6. Validation Error (400)

**Symptoms:**
```json
{
  "success": false,
  "error": {
    "message": "Validation failed",
    "code": "VALIDATION_ERROR",
    "details": [
      {"field": "npi", "message": "NPI must be exactly 10 digits"}
    ]
  }
}
```

**Common Validation Issues:**

| Field | Error | Fix |
|-------|-------|-----|
| npi | "Must be 10 digits" | Remove dashes/spaces |
| state | "Must be 2-letter code" | Use "CA" not "California" |
| limit | "Maximum 100" | Reduce pagination limit |
| vote | "Must be 'up' or 'down'" | Use exact values |

---

### 7. Admin Endpoint Unauthorized (401)

**Symptoms:**
```json
{
  "success": false,
  "error": {
    "message": "Invalid admin secret",
    "code": "UNAUTHORIZED"
  }
}
```

**Causes:**
- Missing `X-Admin-Secret` header
- Incorrect secret value
- Secret not configured on server

**Solutions:**
```bash
# Include header in request
curl -H "X-Admin-Secret: YOUR_SECRET" \
  https://api.verifymyprovider.com/api/v1/admin/health

# Verify secret in Secret Manager
gcloud secrets versions access latest --secret=ADMIN_SECRET
```

---

### 8. Admin Endpoints Not Configured (503)

**Symptoms:**
```json
{
  "success": false,
  "error": {
    "message": "Admin endpoints not configured",
    "code": "SERVICE_UNAVAILABLE"
  }
}
```

**Cause:**
- `ADMIN_SECRET` environment variable not set

**Solution:**
```bash
# Create secret
echo -n "your-secure-secret" | gcloud secrets create ADMIN_SECRET --data-file=-

# Mount in Cloud Run
gcloud run services update verifymyprovider-backend \
  --set-secrets=ADMIN_SECRET=ADMIN_SECRET:latest
```

---

### 9. CORS Errors

**Symptoms:**
```
Access to fetch at 'https://api...' from origin 'https://...' has been blocked by CORS policy
```

**Causes:**
- Frontend domain not in CORS allowlist
- Missing CORS headers

**Solutions:**
```bash
# Update CORS_ORIGIN environment variable
gcloud run services update verifymyprovider-backend \
  --set-env-vars=CORS_ORIGIN=https://verifymyprovider.com
```

For multiple origins:
```typescript
// Backend configuration
app.use(cors({
  origin: ['https://verifymyprovider.com', 'https://www.verifymyprovider.com']
}));
```

---

### 10. Slow Queries

**Symptoms:**
- Search requests taking > 1 second
- Timeout errors

**Diagnosis:**
```sql
-- Check slow queries in PostgreSQL
SELECT query, calls, mean_time, total_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;
```

**Common Causes:**
1. Missing index on search field
2. Large result sets without pagination
3. Complex multi-table joins

**Solutions:**
1. Verify indexes exist:
```sql
SELECT indexname, tablename FROM pg_indexes WHERE tablename = 'providers';
```

2. Add missing indexes:
```sql
CREATE INDEX idx_provider_specialty ON providers(specialty);
```

3. Enable pagination:
```
GET /providers/search?limit=20&page=1
```

---

## Development Issues

### Local Environment Setup

```bash
# 1. Install dependencies
npm install

# 2. Set up environment
cp .env.example .env
# Edit .env with local values

# 3. Start PostgreSQL (Docker)
docker run -d -p 5432:5432 \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=healthcare_providers \
  postgres:15

# 4. Run migrations
cd packages/backend
npx prisma migrate dev

# 5. Start development servers
npm run dev  # Root directory - starts both frontend and backend
```

### TypeScript Errors

```bash
# Rebuild shared package
npm run build --workspace=packages/shared

# Clear TypeScript cache
rm -rf packages/*/dist packages/*/.tsbuildinfo

# Rebuild all
npm run build
```

### Prisma Client Issues

```bash
# Regenerate Prisma client
cd packages/backend
npx prisma generate

# Reset database (development only!)
npx prisma migrate reset
```

---

## Production Issues

### Cloud Run Deployment Failed

```bash
# Check build logs
gcloud builds list --limit=5

# View specific build
gcloud builds log BUILD_ID

# Common issues:
# - Dockerfile path incorrect
# - Missing dependencies
# - Build timeout (increase in cloudbuild.yaml)
```

### Cloud SQL Connection Issues

```bash
# Test connection from local
cloud_sql_proxy -instances=PROJECT:REGION:INSTANCE=tcp:5432

# Check IAM permissions
gcloud projects get-iam-policy PROJECT_ID \
  --flatten="bindings[].members" \
  --filter="bindings.role:cloudsql"
```

### Secret Manager Access

```bash
# List secrets
gcloud secrets list

# Check IAM for Cloud Run service account
gcloud secrets get-iam-policy SECRET_NAME
```

---

## Monitoring Commands

### Check Service Health

```bash
# Backend health
curl https://api.verifymyprovider.com/health

# Admin health (with auth)
curl -H "X-Admin-Secret: $SECRET" \
  https://api.verifymyprovider.com/api/v1/admin/health
```

### View Recent Logs

```bash
# Cloud Run logs
gcloud logging read "resource.type=cloud_run_revision" \
  --limit=50 \
  --format="table(timestamp, severity, textPayload)"

# Error logs only
gcloud logging read "resource.type=cloud_run_revision AND severity>=ERROR" \
  --limit=20
```

### Check Database Status

```sql
-- Connection count
SELECT count(*) FROM pg_stat_activity;

-- Table sizes
SELECT relname, pg_size_pretty(pg_relation_size(relid))
FROM pg_stat_user_tables
ORDER BY pg_relation_size(relid) DESC;

-- Recent sync status
SELECT * FROM sync_logs ORDER BY started_at DESC LIMIT 5;
```

---

## Getting Help

1. **Check logs** - Most issues have clear error messages
2. **Verify configuration** - Environment variables, secrets
3. **Test locally** - Reproduce before debugging production
4. **Open issue** - https://github.com/verifymyprovider/issues
