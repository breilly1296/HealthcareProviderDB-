# PROGRESS.md — [Skeleton — requires user input to complete]

**Generated:** 2026-04-16
**Source prompt:** `prompts/25-progress-status.md`
**Status:** ⚠️ **Stub** — this prompt tracks what's in-flight, blocked, and next. That state lives in the user's head (and in `git log` / PR tracker), not statically in the code. Run interactively.

---

## What this prompt produces

`PROGRESS.md` — a living status document:
- Current phase & completion %
- Recently completed (last 7 / 30 days)
- In-progress work
- Next up (immediate / short / medium / long)
- Blockers
- NPI import status
- Test coverage / deployment status
- Security status
- Decisions needed
- Success metrics vs targets
- Timeline

## What's derivable from this repo (as of 2026-04-16)

From memory / code state:
- **NPI Phase 5A (URL validation):** Mount Sinai and NYP replacement searches pending (~7K practices).
- **NPI Phase 5B (practice re-verification):** COMPLETE — 2,552 practices re-verified across 15 specialties.
- **Phase 6 (enrichment protection):** COMPLETE — `data_source` columns, `import_conflicts` table, hardened import scripts.
- **Auth system:** Implemented Feb 2026 — magic link + JWT sessions + saved providers.
- **Insurance card upload:** Implemented — AES-encrypted storage with Claude OCR extraction.

From the prompt collection (2026-04-16 cleanup):
- Prompts reorganized: shared references added, audit report archived, 3 new gap prompts created (observability, migrations, testing).

## What requires the user

- What's in flight THIS WEEK
- Current blockers
- Target dates for beta / public launch
- User counts / verification counts vs targets
- Known bugs (vs static "Known Issues" doc)
- Decisions pending

## Recommendation

Run `prompts/25-progress-status.md` at the start of each week / sprint. The Output Format template is comprehensive — treat this prompt as a weekly check-in, not a one-time run.
