# Insurance Card Upload

**Last Updated:** 2026-04-16
**Status:** Active (Production)

## Configuration

| Setting | Value | Source |
|---------|-------|--------|
| Claude model | `claude-haiku-4-5-20251001` | `packages/frontend/src/app/api/insurance-card/extract/route.ts:23` |
| `ANTHROPIC_API_KEY` | Required (checked at runtime) | `route.ts:34-36`, `route.ts:316-322` |
| Max upload size | 10 MB | `route.ts:26` |
| Rate limit | 10 extractions/hr per IP | `route.ts:28` |
| Retry confidence threshold | 0.3 | `route.ts:31` |
| Min fields for success | 2 | `route.ts:32` |
| Retry prompt | `ALTERNATIVE_EXTRACTION_PROMPT` | `route.ts:13`, `route.ts:387` |
| Encryption key | `INSURANCE_ENCRYPTION_KEY` (backend) | cited by prompt; backend-side |

## Architecture

- Extraction endpoint: Next.js App Router route at `/api/insurance-card/extract`
  (`packages/frontend/src/app/api/insurance-card/extract/route.ts:222`) — calls Anthropic directly with the frontend server's API key.
- Upload component: `packages/frontend/src/components/InsuranceCardUploader.tsx` (anonymous upload, search-only flow).
- Webcam scanner: `packages/frontend/src/components/InsuranceCardScanner.tsx` (authenticated save flow, used in dashboard).
- Persistence hook: `packages/frontend/src/hooks/useInsuranceCard.ts:22` — React Query + backend `/api/v1/me/insurance-card` endpoints.
- Scan mutation first hits Next.js extract route, then pipes extracted data to backend save (`useInsuranceCard.ts:46-60`).
- Dashboard: `packages/frontend/src/app/dashboard/insurance/InsuranceCardDashboard.tsx` — shows saved card with masking, edit, delete.

## Pipeline Walkthrough (`route.ts:222-537`)

1. Rate limit check keyed by client IP (`route.ts:227-254`).
2. Payload validation: must be string, within `MAX_BASE64_LENGTH` (~13.7 MB of base64), matches base64 regex, length >= 100 (`route.ts:256-314`).
3. `ANTHROPIC_API_KEY` presence guard (`route.ts:316-322`).
4. Optional Sharp preprocessing via `shouldEnhanceImage` + `preprocessImage`/`preprocessImageEnhanced` (`route.ts:329-355`).
5. Primary call to Claude with `PRIMARY_EXTRACTION_PROMPT` (`route.ts:361-373`).
6. If parse fails or confidence < 0.3, retry with `ALTERNATIVE_EXTRACTION_PROMPT` (`route.ts:380-403`); best result wins.
7. Structured error paths: parse failure (422), insufficient fields (422), API error (503), unexpected (500) — all emit `userMessage` + `suggestions`.
8. Success response includes `metadata.confidence`, `confidenceScore`, `fieldsExtracted`, `totalFields`, `retryAttempted`, `preprocessing`, plus `rateLimit` headers.

## Extracted Fields (22 total; see `insuranceCardSchema.ts:8-48`)

Plan: `insurance_company`, `plan_name`, `plan_type`, `provider_network`, `network_notes`.
Subscriber: `subscriber_name`, `subscriber_id`, `group_number`, `effective_date`.
Pharmacy: `rxbin`, `rxpcn`, `rxgrp`.
Copay: `copay_pcp`, `copay_specialist`, `copay_urgent`, `copay_er`.
Deductible / OOP: `deductible_individual`, `deductible_family`, `oop_max_individual`, `oop_max_family`.
Contact: `customer_care_phone`, `website`.

## Confidence Scoring

Displayed by `ConfidenceIndicator` at `InsuranceCardUploader.tsx:13-56`. Levels map to green/yellow/red pill with % bar (a11y `role="progressbar"`, `aria-valuenow`). Thresholds come from AI response metadata parsed in `insuranceCardSchema.ts`.

## Issues Found

- CRITICAL / HIGH
  - No critical issues observed in frontend extract pipeline.
- MEDIUM
  - Rate limit is purely in-memory per serverless instance (`route.ts:229` -> `@/lib/rateLimit`) — horizontal scaling weakens the 10/hr cap. Consider moving to Redis/Upstash.
  - Extract endpoint is unauthenticated (`route.ts:222`). Prompt's "Authentication required" item applies only to backend `/save` route — anonymous users can still burn ANTHROPIC quota up to IP rate limit.
  - `InsuranceCardUploader` hard-codes `state = 'NY'` fallback when geolocation unavailable (`InsuranceCardUploader.tsx:118`). Users outside NY won't see matching provider results on first click.
- LOW
  - Drop target is `<div role="button">` with keyboard handler (`InsuranceCardUploader.tsx:212-219`) but lacks drag-and-drop handlers (onDragOver/onDrop) despite "drag and drop" copy.
  - `detectMediaType` defaults to `image/jpeg` on unknown magic bytes (`route.ts:76`), which differs from upload-side validation (`InsuranceCardUploader.tsx:129`) that accepts any `image/*`. SVG etc. would be sent to Claude as JPEG.
  - Logging at `route.ts:346-351, 472-478` emits preprocessing/fields/confidence but not PII; matches "Extraction results not logged" guarantee.

## Checklist Verification

### Implementation
- [x] API route created — `route.ts:222`
- [x] Anthropic SDK integrated — `route.ts:2, 34-36, 182-205`
- [x] `InsuranceCardUploader` component — `InsuranceCardUploader.tsx:103`
- [x] Zod validation schema — `insuranceCardSchema.ts:8`
- [x] Sharp preprocessing — `imagePreprocess.ts:9-12` (dynamic import), `route.ts:329-355`
- [x] Error handling complete — `route.ts:499-536` plus typed `getUserFriendlyError` map (`route.ts:93-172`)
- [x] Retry logic — `route.ts:380-403`
- [x] Confidence scoring — `route.ts:382, 397-400`; UI at `InsuranceCardUploader.tsx:13`
- [x] Loading states — `InsuranceCardUploader.tsx:242-262` plus `aria-live` region (`:259`)

### Security
- [x] Rate limiting — `route.ts:229`, 429 response with `Retry-After`
- [x] File size validation — 10 MB in UI (`InsuranceCardUploader.tsx:135`) and `MAX_BASE64_LENGTH` server-side (`route.ts:279`)
- [x] File type validation — client accept `image/*`, server magic byte check (`route.ts:43-77`)
- [x] No sensitive data logged — success log only emits counts/confidence (`route.ts:472-478`)

### UX
- [x] Clear instructions — "Click to upload or drag and drop" (`InsuranceCardUploader.tsx:221-223`) plus tips on page (`app/insurance/page.tsx:63-81`)
- [x] Extraction confidence shown — `ConfidenceIndicator` (`InsuranceCardUploader.tsx:327-339`)
- [x] Manual correction allowed — CTA note at `InsuranceCardUploader.tsx:447-451`
- [x] Mobile camera support — `<input capture="environment">` (`:273`)
- [x] Suggestions for improvement — `ExtractionSuggestions` (`:61-82, :294-308, :342-346`)
- [x] Card side indicator — `CardSideIndicator` (`:87-101, :321`)

### Testing
- [x] Unit tests for `insuranceCardSchema` — present per prompt claim
- [x] Unit tests for `imagePreprocess` — present per prompt claim
- [ ] E2E tests for upload flow — not located; none under `packages/frontend/e2e`
- [ ] Various card formats tested — no automated evidence
- [ ] Mobile upload tested — no automated evidence

### Storage / Auth (backend — in prompt scope)
- [x] Scan flow wired from Next.js to backend save — `useInsuranceCard.ts:46-60`
- [x] Dashboard view/edit/delete — `app/dashboard/insurance/InsuranceCardDashboard.tsx`
- [x] Scanner variant (webcam) — `InsuranceCardScanner.tsx`
- [ ] Privacy policy mentions feature — not verified in `/app/privacy`

## Recommendations (ranked)

1. Move IP rate limit to a shared store (Redis/Upstash) so the 10/hr cap survives multi-instance scaling. Current `checkRateLimit` is per-process memory (`route.ts:229`).
2. Require authentication on `/api/insurance-card/extract` to match the backend `/scan` route posture; anonymous users can already use `InsuranceCardUploader` with free Claude quota. Add `requireAuth` or at minimum reCAPTCHA v3 token verification.
3. Derive the search state from actual user input (IP geo + dropdown) rather than the `'NY'` fallback in `handleFindProviders` (`InsuranceCardUploader.tsx:118`) to keep results relevant for non-NY users.
4. Wire real drag-and-drop handlers on the upload zone, or remove the "drag and drop" copy (`InsuranceCardUploader.tsx:221`).
5. Add E2E coverage for the full scan -> save path (Next.js extract -> backend `/scan`) since the two-hop flow is the only wired persistence route.
6. Update `/privacy` to enumerate PostHog + Insurance Card scanning + encryption (the only remaining unchecked privacy item).

## Open Questions

1. Should extraction require an authenticated session? The backend save route does; the frontend extract does not.
2. Should we enforce MIME type more strictly (reject SVG/GIF that isn't animated) or add a malware scan before sending to Claude?
3. Should preprocessing failures be fatal or fall back to original image? Today they silently use the original (`route.ts:352-355`).
4. Is 10 extractions/hr per IP adequate for corporate NAT or VPN users?
