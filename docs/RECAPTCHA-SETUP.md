# reCAPTCHA v3 Setup Guide

## Current State

| Layer | Status | Details |
|-------|--------|---------|
| Backend middleware | Implemented | `packages/backend/src/middleware/captcha.ts` — full reCAPTCHA v3 verification with fail-open/closed modes |
| Backend routes | Wired | `verifyCaptcha` middleware on `POST /verify` and `POST /verify/:id/vote` |
| Backend schema | Ready | `captchaToken: z.string().optional()` in both submit and vote schemas |
| GCP Secret | Placeholder | `RECAPTCHA_SECRET_KEY` is set to `"your-recaptcha-secret-key-here"` in Secret Manager |
| Frontend script | **Missing** | No reCAPTCHA JS loaded, no `grecaptcha` calls anywhere |
| Frontend API calls | **Missing** | `verify.submit()` and `verify.vote()` do not send `captchaToken` |
| Frontend env var | **Missing** | `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` not configured |

**Why it "works" today:** The backend middleware is in fail-open mode. When it sends the placeholder secret to Google, Google returns an error. The catch block triggers fail-open logic which allows the request through with stricter fallback rate limiting (3 req/hour per IP instead of the normal 10). This is a security gap — bots can submit verifications without solving a CAPTCHA.

---

## Step 1: Create reCAPTCHA v3 Keys

1. Go to https://www.google.com/recaptcha/admin
2. Sign in with the Google account that owns `verifymyprovider-prod`
3. Click **+** (Create)
4. Fill in:
   - **Label:** `verifymyprovider.com`
   - **reCAPTCHA type:** Score based (v3)
   - **Domains:**
     - `verifymyprovider.com`
     - `www.verifymyprovider.com`
     - `localhost` (for local development)
   - **Google Cloud Platform:** link to `verifymyprovider-prod` project (optional but recommended)
5. Accept the reCAPTCHA Terms of Service
6. Click **Submit**
7. Copy the **Site Key** (public, goes in frontend) and **Secret Key** (private, goes in backend)

---

## Step 2: Update GCP Secret Manager

Replace the placeholder secret key with the real one:

```bash
echo -n "YOUR_REAL_SECRET_KEY" | gcloud secrets versions add RECAPTCHA_SECRET_KEY \
  --data-file=- \
  --project=verifymyprovider-prod
```

Verify it was updated:

```bash
gcloud secrets versions list RECAPTCHA_SECRET_KEY --project=verifymyprovider-prod
```

The old version will still exist but won't be accessed (Cloud Run uses `latest`).

---

## Step 3: Add Site Key to GitHub Secrets

1. Go to the GitHub repo → Settings → Secrets and variables → Actions
2. Add a new repository secret:
   - **Name:** `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`
   - **Value:** the site key from Step 1

---

## Step 4: Add Site Key to Deploy Workflows

The site key must be passed as a Docker build arg for the frontend (it's baked into the JS bundle at build time).

### `deploy.yml` — Production

In the `deploy-frontend` job, add the build arg to the `docker build` command:

```yaml
      - name: Build Frontend Docker image
        run: |
          docker build \
            -f packages/frontend/Dockerfile \
            --build-arg NEXT_PUBLIC_API_URL=${{ needs.deploy-backend.outputs.backend_url }}/api/v1 \
            --build-arg NEXT_PUBLIC_POSTHOG_KEY=${{ secrets.NEXT_PUBLIC_POSTHOG_KEY }} \
            --build-arg NEXT_PUBLIC_RECAPTCHA_SITE_KEY=${{ secrets.NEXT_PUBLIC_RECAPTCHA_SITE_KEY }} \
            ...
```

### `deploy-staging.yml` — Staging

Same change in the staging workflow's frontend build step.

### Frontend Dockerfile

Ensure the Dockerfile accepts the build arg:

```dockerfile
ARG NEXT_PUBLIC_RECAPTCHA_SITE_KEY
ENV NEXT_PUBLIC_RECAPTCHA_SITE_KEY=$NEXT_PUBLIC_RECAPTCHA_SITE_KEY
```

---

## Step 5: Frontend Code Changes Required

### 5a. Install `react-google-recaptcha-v3`

```bash
cd packages/frontend
npm install react-google-recaptcha-v3
```

### 5b. Add reCAPTCHA Provider to Layout

In `packages/frontend/src/app/layout.tsx`, wrap the app in the reCAPTCHA provider:

```tsx
import { GoogleReCaptchaProvider } from 'react-google-recaptcha-v3';

// Inside the layout, wrap children:
<GoogleReCaptchaProvider
  reCaptchaKey={process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY ?? ''}
  scriptProps={{ async: true, defer: true }}
>
  {/* existing providers and content */}
</GoogleReCaptchaProvider>
```

**Note:** This is a client component, so it should go inside the existing `<Suspense>` wrapper or a client boundary. The provider only loads the script when the site key is present.

### 5c. Add Token to Verification Submissions

In the component that calls `verify.submit()` (the InsuranceList verification modal), generate a token before submitting:

```tsx
import { useGoogleReCaptcha } from 'react-google-recaptcha-v3';

// Inside the component:
const { executeRecaptcha } = useGoogleReCaptcha();

// Before calling the API:
const captchaToken = executeRecaptcha ? await executeRecaptcha('verify_insurance') : undefined;

// Include in the API call:
verify.submit({ ...data, captchaToken });
```

### 5d. Update `VerificationSubmission` Type

In `packages/frontend/src/lib/api.ts`, add `captchaToken` to the type:

```typescript
export interface VerificationSubmission {
  npi: string;
  planId: string;
  locationId?: number;
  acceptsInsurance: boolean;
  acceptsNewPatients?: boolean;
  notes?: string;
  submittedBy?: string;
  captchaToken?: string;  // <-- add this
}
```

### 5e. Add Token to Vote Calls

In `packages/frontend/src/lib/api.ts`, update the vote function:

```typescript
vote: (verificationId: string, vote: 'up' | 'down', captchaToken?: string) =>
  apiFetch<{...}>(`/verify/${verificationId}/vote`, {
    method: 'POST',
    body: JSON.stringify({ vote, captchaToken }),
  }),
```

### 5f. Hide reCAPTCHA Badge (Optional but Recommended)

Google requires either the badge or a text attribution. Since the badge overlaps our UI, add to `globals.css`:

```css
.grecaptcha-badge {
  visibility: hidden !important;
}
```

And add the required text attribution near the verification form:

```
This site is protected by reCAPTCHA and the Google Privacy Policy and Terms of Service apply.
```

---

## Step 6: Backend Changes (None Required)

The backend is fully implemented:

- **Middleware:** `packages/backend/src/middleware/captcha.ts`
  - Reads token from `req.body.captchaToken` or `x-captcha-token` header
  - Verifies against `https://www.google.com/recaptcha/api/siteverify`
  - Requires score >= 0.5 (configurable via `CAPTCHA_MIN_SCORE`)
  - Fail-open by default with fallback rate limiting (3 req/hour)
  - Skipped in development/test environments
- **Routes:** Applied to `POST /verify` and `POST /verify/:id/vote`
- **Schema:** `captchaToken: z.string().optional()` — won't break existing clients

---

## Step 7: Verification Steps

### 7a. Test Locally

1. Set `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` in `packages/frontend/.env.local`
2. Set `RECAPTCHA_SECRET_KEY` in `packages/backend/.env` (use test keys for local dev)
3. Start both services
4. Open browser DevTools → Network tab
5. Submit a verification
6. Confirm the POST to `/api/v1/verify` includes `captchaToken` in the body
7. Confirm the response is 200 (not 400 "CAPTCHA token required")

### 7b. Test in Production

1. Deploy the updated frontend and ensure the build arg is passed
2. Open the site and inspect the page source — confirm `recaptcha/api.js` script is loaded
3. Submit a test verification
4. Check Cloud Run logs for the backend:
   ```bash
   gcloud run services logs read verifymyprovider-backend \
     --region=us-central1 --project=verifymyprovider-prod --limit=20
   ```
5. Look for CAPTCHA-related log entries — should see successful verifications, not warnings

### 7c. Verify Bot Protection

Test that bots are blocked:

```bash
# This should return 400 "CAPTCHA token required" (no token sent)
curl -X POST https://verifymyprovider.com/api/v1/verify \
  -H "Content-Type: application/json" \
  -d '{"npi":"1234567890","planId":"test","acceptsInsurance":true}'

# This should return 400 "CAPTCHA verification failed" (invalid token)
curl -X POST https://verifymyprovider.com/api/v1/verify \
  -H "Content-Type: application/json" \
  -d '{"npi":"1234567890","planId":"test","acceptsInsurance":true,"captchaToken":"invalid"}'
```

### 7d. Monitor reCAPTCHA Dashboard

After deployment, monitor the reCAPTCHA admin console at:
https://www.google.com/recaptcha/admin

Check:
- Request volume matches expected traffic
- Average score is high (legitimate users typically score 0.7-0.9)
- No suspicious spikes in low-score requests

---

## Environment Variable Summary

| Variable | Where | Type | Value |
|----------|-------|------|-------|
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | GitHub Secrets → Frontend build arg | Public | Site key from reCAPTCHA admin |
| `RECAPTCHA_SECRET_KEY` | GCP Secret Manager → Backend runtime | Secret | Secret key from reCAPTCHA admin |
| `CAPTCHA_MIN_SCORE` | Backend env (optional) | Config | `0.5` (default) |
| `CAPTCHA_FAIL_MODE` | Backend env (optional) | Config | `open` (default) or `closed` |

---

## Rollback Plan

If reCAPTCHA causes issues (e.g., blocking legitimate users):

1. **Quick fix:** Set `CAPTCHA_MIN_SCORE=0.1` to effectively disable score filtering
2. **Disable entirely:** Delete the `RECAPTCHA_SECRET_KEY` secret version — the middleware will log a warning and skip verification
3. **Frontend only:** Remove the `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` build arg — the frontend won't send tokens, and the backend's fail-open mode will allow requests through with fallback rate limiting
