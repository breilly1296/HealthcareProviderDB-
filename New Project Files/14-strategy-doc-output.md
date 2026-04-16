# STRATEGY.md — [Skeleton — requires user input to complete]

**Generated:** 2026-04-16
**Source prompt:** `prompts/14-strategy-doc.md`
**Status:** ⚠️ **Stub** — this prompt is a Q&A template. Most sections require business judgment from the project owner (mission, pricing, competitive positioning, risk register). Run the source prompt in Claude.ai conversation mode to complete this document.

---

## What this prompt produces

`STRATEGY.md` — a strategic direction document covering:
- Mission, vision, differentiator
- Product strategy (NYC Phase 1 → tri-state → national)
- Business model / pricing tiers
- Competitive landscape (Ribbon Health reference)
- Decision log (on-demand FHIR, separate from OwnMyHealth, no-HIPAA)
- Milestones & risk register
- Crowdsource strategy (cold-start, incentives, anti-spam)

## What can be pre-filled from the codebase

The following facts are derivable from the repo and would be repeated in any run:

- **No HIPAA position:** confirmed — no PHI collected; insurance card PII is user-submitted and AES-encrypted. See `02-no-hipaa-compliance-output.md`.
- **Launch geography:** NYC 5 boroughs, Q2 2026 (from `00-index.md` and `10-frontend-structure.md`).
- **Confidence-scoring moat:** 4-factor algorithm (Source 25%, Recency 30%, Volume 25%, Consistency 20%) with specialty-aware freshness thresholds. See `12-confidence-scoring-output.md`.
- **Anti-spam stack:** 6 layers (rate limit / honeypot / reCAPTCHA v3 / vote dedup / 30-day Sybil window / magic-link auth). See `36-sybil-attack-prevention-output.md`.
- **External dependencies:** Anthropic (card OCR), Resend (magic link), reCAPTCHA, PostHog, NPI Registry, Redis (optional).

## What requires the user

- Pricing tiers and unit economics
- Target conversion rates
- Exit scenarios / holding-company structure
- Specific customer-acquisition channels
- Success metrics (users / verifications per phase)

## Recommendation

Run `prompts/14-strategy-doc.md` interactively with the project owner. The Output Format template at the bottom of the prompt gives the complete document structure.
