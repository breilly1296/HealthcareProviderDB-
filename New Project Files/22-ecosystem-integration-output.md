# ECOSYSTEM.md — [Skeleton — requires user input to complete]

**Generated:** 2026-04-16
**Source prompt:** `prompts/22-ecosystem-integration.md`
**Status:** ⚠️ **Stub** — this prompt requires information about the sibling OwnMyHealth product, which is outside this repository. Run the source prompt in Claude.ai conversation mode with the project owner.

---

## What this prompt produces

`ECOSYSTEM.md` describing how VerifyMyProvider and OwnMyHealth fit together as a two-product portfolio:
- Why separate products (compliance risk isolation, exit optionality, dev speed)
- User journeys (casual vs power user)
- Conversion funnel (VMP → OMH and vice versa)
- Technical integration + API contract
- Data flow / PHI boundary
- Holding-company structure

## What's derivable from this repo

- **VMP's compliance stance:** No HIPAA / no PHI (see `02-no-hipaa-compliance-output.md`).
- **VMP's public API shape:** `/api/v1/providers/search`, `/plans/search`, etc. See `06-api-routes-output.md`.
- **No PHI at the API boundary:** provider data only (NPI, address, specialty, plan acceptance).

## What requires the user

- OwnMyHealth's architecture, scope, and HIPAA posture
- Business relationship (LLC structure, IP, revenue split)
- Target user journeys across both products
- Integration approach (embedded search, deep link, API-to-API)
- Cross-product conversion targets

## Recommendation

Run `prompts/22-ecosystem-integration.md` interactively. The Output Format template in the prompt is complete — it just needs business context that doesn't live in this codebase.
