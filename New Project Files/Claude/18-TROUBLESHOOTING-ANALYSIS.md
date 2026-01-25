# VerifyMyProvider Troubleshooting Guide

**Last Updated:** January 25, 2026

---

## Common Issues

### 1. Database Connection Failed

**Symptoms:**
- 500 errors on all endpoints
- "Connection refused" in logs
- Backend won't start

**Causes:**
- Wrong DATABASE_URL
- Cloud SQL not running
- IP not whitelisted

**Solutions:**
```bash
# Test connection from Cloud Shell
gcloud sql connect verifymyprovider-db --user=postgres

# Check DATABASE_URL format
# postgresql://postgres:PASSWORD@IP:5432/providerdb

# Verify Cloud SQL status
gcloud sql instances describe verifymyprovider-db
```

---

### 2. Rate Limit Errors (429)

**Symptoms:**
- "Too many requests" error
- Retry-After header present

**Causes:**
- Exceeded rate limit
- Testing too aggressively
- Bot traffic

**Solutions:**
```bash
# Wait for rate limit reset
# Check X-RateLimit-Reset header for timestamp

# Limits:
# - Verification: 10/hour
# - Vote: 10/hour
# - Search: 100/hour
# - Other: 200/hour
```

---

### 3. CAPTCHA Verification Failed

**Symptoms:**
- 403 error on verification/vote
- "CAPTCHA verification failed" message

**Causes:**
- Invalid CAPTCHA token
- Bot detection triggered
- RECAPTCHA_SECRET_KEY not configured

**Solutions:**
```bash
# Check if secret is configured
echo $RECAPTCHA_SECRET_KEY

# In development, CAPTCHA is skipped
# Set NODE_ENV=development

# Check reCAPTCHA score (0.5 threshold)
```

---

### 4. CORS Errors

**Symptoms:**
- "Access-Control-Allow-Origin" errors
- Requests blocked in browser

**Causes:**
- Frontend URL not in allowed origins
- Custom headers not allowed

**Solutions:**
```typescript
// Add origin to allowed list in index.ts
const ALLOWED_ORIGINS = [
  'https://your-domain.com',
  // ...
];

// Or set FRONTEND_URL environment variable
```

---

### 5. Admin Endpoint Returns 503

**Symptoms:**
- Admin endpoints return 503
- "Admin not configured" message

**Causes:**
- ADMIN_SECRET not set

**Solutions:**
```bash
# Generate admin secret
openssl rand -hex 32

# Set environment variable
export ADMIN_SECRET="your-generated-secret"

# Use header in requests
curl -H "X-Admin-Secret: your-secret" ...
```

---

### 6. Provider Search Returns No Results

**Symptoms:**
- Empty results for searches
- Wrong data displayed

**Causes:**
- State not imported yet
- Filters too restrictive
- Data not indexed

**Solutions:**
```bash
# Check which states are imported
psql -c "SELECT state, COUNT(*) FROM providers GROUP BY state"

# Check total provider count
psql -c "SELECT COUNT(*) FROM providers"

# Verify indexes exist
psql -c "\di providers*"
```

---

### 7. Deployment Failed

**Symptoms:**
- GitHub Action fails
- Cloud Run deployment error

**Causes:**
- Build errors
- Missing environment variables
- Docker issues

**Solutions:**
```bash
# Check build logs
gcloud builds list --limit=5

# Check deployment logs
gcloud run services describe verifymyprovider-backend --region us-central1

# Redeploy manually
gcloud run deploy verifymyprovider-backend \
  --image gcr.io/PROJECT/verifymyprovider-backend \
  --region us-central1
```

---

### 8. Prisma Migration Failed

**Symptoms:**
- "Migration failed" error
- Schema out of sync

**Causes:**
- Database locked
- Conflicting migrations
- Missing permissions

**Solutions:**
```bash
# Check migration status
npx prisma migrate status

# Reset if stuck (CAUTION: data loss)
npx prisma migrate reset

# Deploy pending migrations
npx prisma migrate deploy
```

---

### 9. Frontend Not Loading

**Symptoms:**
- Blank page
- JavaScript errors

**Causes:**
- Build failure
- API URL wrong
- Environment variable missing

**Solutions:**
```bash
# Check NEXT_PUBLIC_API_URL
echo $NEXT_PUBLIC_API_URL

# Verify API is accessible
curl https://your-backend-url/health

# Check browser console for errors
```

---

### 10. Verification Score Not Updating

**Symptoms:**
- Score stays same after verification
- Confidence not recalculating

**Causes:**
- Duplicate verification blocked
- Score calculation error
- TTL expired

**Solutions:**
```bash
# Check verification was created
psql -c "SELECT * FROM verification_logs WHERE provider_npi='...' ORDER BY created_at DESC LIMIT 5"

# Check acceptance record
psql -c "SELECT * FROM provider_plan_acceptance WHERE provider_npi='...' AND plan_id='...'"

# Manually recalculate (via admin endpoint)
```

---

## Log Analysis

### View Recent Errors
```bash
gcloud logging read "resource.type=cloud_run_revision AND severity>=ERROR" --limit 20
```

### View Specific Service Logs
```bash
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=verifymyprovider-backend" --limit 50
```

### Filter by Time
```bash
gcloud logging read "timestamp >= \"2026-01-25T00:00:00Z\"" --limit 100
```

### Search for Request ID
```bash
gcloud logging read "jsonPayload.requestId=\"uuid-here\"" --limit 10
```

---

## Database Queries

### Check Provider Count by State
```sql
SELECT state, COUNT(*) as count
FROM providers
GROUP BY state
ORDER BY count DESC;
```

### Find Orphaned Records
```sql
SELECT COUNT(*)
FROM provider_plan_acceptance
WHERE provider_npi IS NULL AND plan_id IS NULL;
```

### Check Verification Activity
```sql
SELECT DATE(created_at), COUNT(*)
FROM verification_logs
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY DATE(created_at);
```

### Check Expired Records
```sql
SELECT
  (SELECT COUNT(*) FROM verification_logs WHERE expires_at < NOW()) as expired_verifications,
  (SELECT COUNT(*) FROM provider_plan_acceptance WHERE expires_at < NOW()) as expired_acceptances;
```

---

## Emergency Procedures

### Rollback Deployment
```bash
# List revisions
gcloud run revisions list --service verifymyprovider-backend --region us-central1

# Route to previous
gcloud run services update-traffic verifymyprovider-backend \
  --to-revisions=REVISION_NAME=100 \
  --region us-central1
```

### Database Backup
```bash
gcloud sql backups create --instance=verifymyprovider-db
```

### Stop All Traffic
```bash
# Set min instances to 0
gcloud run services update verifymyprovider-backend \
  --min-instances=0 \
  --max-instances=0 \
  --region us-central1
```

---

## Getting Help

1. Check this guide
2. Review logs in GCP Console
3. Check GitHub issues
4. Contact team

---

*Keep this guide updated with new issues*
