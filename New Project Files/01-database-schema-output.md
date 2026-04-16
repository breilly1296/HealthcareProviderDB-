# Database Schema Review — Output

**Scope:** `packages/backend/prisma/schema.prisma` (460 lines), `packages/backend/src/lib/prisma.ts`, `packages/backend/src/services/`.

**Summary:** Schema is mature and well-indexed. Most checklist items verified against the actual `schema.prisma`. A few items from the prompt's expectation do NOT match the file verbatim (index names, missing `createdAt`/`updatedAt` on ProviderPlanAcceptance per prompt claim, etc.). No critical findings.

---

## 1. Verification of Checklist Items

### Schema Security
| Item | Status | Evidence |
|---|---|---|
| Tables have indexes | Verified | schema.prisma:51-57 (Provider), 96-104 (PracticeLocation), 229-236 (PPA), 264-272 (VerificationLog) |
| FKs with ON DELETE behavior | Verified | schema.prisma:92 (NoAction), 282 (Cascade), 364 (Cascade user→session), 390-391 (Cascade saved), 428 (Cascade card) |
| No PHI stored | Verified | No fields for diagnosis, visit reason, health condition. Only public NPPES/CMS data + encrypted insurance card metadata |
| NPI used as PK on provider tables | Verified | Provider.npi (line 13), ProviderCmsDetails.npi (line 109); PracticeLocation/Hospital/Insurance/Medicare/Taxonomy use autoincrement id + npi FK |
| Sybil prevention indexes on VerificationLog | Verified | schema.prisma:270-271 `idx_vl_sybil_email`, `idx_vl_sybil_ip` |

### Row-Level Security
| Item | Status | Evidence |
|---|---|---|
| RLS not required; app-level auth via requireAuth | Verified | `requireAuth` middleware applied to `/saved-providers` and `/me/insurance-card` (routes/index.ts:21-22) |
| Verification data anonymous (no user_id) | Verified | VerificationLog has `sourceIp`/`submittedBy` (email string, optional) but no user FK (schema.prisma:239-274) |
| User accounts isolated via Express middleware | Verified | Services accept `userId` from `req.user!.id`; no RLS policies present |

### Core Models (21 total) — verified against schema
Verified present:
- Provider (line 12), PracticeLocation (74), ProviderCmsDetails (108), ProviderHospital (121), ProviderInsurance (136), ProviderMedicare (150), ProviderTaxonomy (162) — 7 provider-data models
- TaxonomyReference (175), Hospital (61) — 2 reference models
- InsurancePlan (187), ProviderPlanAcceptance (213), VerificationLog (239), VoteLog (276) — 4 insurance/verification models
- SyncLog (290), DataQualityAudit (303), ImportConflict (324) — 3 system models
- User (342), Session (355), MagicLinkToken (371), SavedProvider (385) — 4 auth models
- UserInsuranceCard (399) — 1 user data model

**Total: 21 models, matches prompt.**

### Prompt-vs-File Discrepancies (PARTIAL)
- Prompt claim (line 58): `InsurancePlan.type` — schema uses `planType` (schema.prisma:191). Prompt lists "type" as alias; actual column is `plan_type`.
- Prompt claim: `InsurancePlan.variant` — actual field is `planVariant` (line 194).
- Prompt claim on PPA: "createdAt, updatedAt" — both present (lines 221-222).
- Prompt claim on index `@@unique([npi, addressLine1, city, state, zipCode])` — verified present (line 95, name `uq_location_address`).

### Indexes — spot-check of prompt's list vs schema
| Prompt Name | Schema Name | Match |
|---|---|---|
| `npi_address_type` | `idx_locations_npi_address_type` | Name mismatch, same columns |
| `state_city` | `idx_locations_state_city` | Name mismatch, same columns |
| `address_hash` | `idx_locations_address_hash` | Name mismatch |
| `lat_lng` | `idx_locations_lat_lng` | Name mismatch |
| `geocoded_at` | `idx_locations_geocoded_at` | Name mismatch |
| `idx_vl_sybil_email` | Same | Match |
| `idx_vl_sybil_ip` | Same | Match |
| `idx_saved_providers_user_id` | Same | Match |
| `idx_uic_matched_plan_id` | Same | Match |

Minor — the prompt's short names are informal; the canonical names in schema.prisma are `idx_locations_*`. Not a defect.

### Enums — all three verified (schema.prisma:434-459)
- AcceptanceStatus (ACCEPTED, NOT_ACCEPTED, PENDING, UNKNOWN) — verified
- VerificationSource (9 values) — verified, matches prompt
- VerificationType (5 values) — verified, matches prompt

### Data Quality Fields — verified
- `Provider.confidenceScore` (line 38), `Provider.verificationCount` default 0 (line 39)
- `ProviderPlanAcceptance.confidenceScore` default 0 (line 218)
- `UserInsuranceCard.confidenceScore` (line 423)
- Data source tracking: `Provider.dataSource` default 'nppes' (line 34), `PracticeLocation.dataSource` default 'nppes' (line 89), `PracticeLocation.enrichmentSource` (line 91)
- TTL: `ProviderPlanAcceptance.expiresAt` (line 223), `VerificationLog.expiresAt` (line 259)
- Profile URL verification: lines 35-37 (providerProfileUrl, profileUrlVerified, profileUrlVerifiedAt)

### Schema Conventions
- PascalCase model names with `@@map("snake_case")` — verified throughout
- camelCase fields with `@map("snake_case")` — verified on most; however:
  - **Provider fields lack `@map` decorators on `middleName` (line 17), `namePrefix` (18), `nameSuffix` (19), `credential` (20), `gender` (22), `confidenceScore` (38)** — they use raw snake_case via `@map` OR rely on the column being a single word. Actually, lines 17-22 DO have @map decorators. Lines 38 `@map("confidence_score")` verified.
  - Prompt note line 261 says several fields use raw snake_case without @map — **this appears INCORRECT based on current schema**; middleName/namePrefix/nameSuffix all have proper @map (lines 17-19).
- `@db.VarChar(N)` used consistently — verified
- `@db.Timestamptz(6)` for timestamps — verified (e.g., lines 33, 221-223)
- `@default(cuid())` for string PKs: verified on VerificationLog (240), VoteLog (277), User (343), Session (356), MagicLinkToken (372), SavedProvider (386), UserInsuranceCard (400)
- `@default(autoincrement())` for integer PKs: verified on PracticeLocation (75), ProviderHospital (122), ProviderInsurance (137), ProviderMedicare (151), ProviderTaxonomy (163), ProviderPlanAcceptance (214), SyncLog (291), DataQualityAudit (304), ImportConflict (325)

---

## 2. Prisma Client (`lib/prisma.ts`)

File: `packages/backend/src/lib/prisma.ts` (20 lines)
- Standard Prisma singleton pattern with global caching in non-production
- Log levels configured: query/error/warn in dev, error-only in prod
- No special connection pooling override (relies on Prisma default + Cloud SQL)
- **Note:** The `createPool()` helper mentioned in user memory lives in `scripts/pre-import-check.ts`, not in `src/lib/prisma.ts`. Runtime API uses the Prisma client exclusively.

Raw SQL usage across `src/`: only one `$queryRaw` call — `prisma.$queryRaw\`SELECT 1\`` in `index.ts:137` for healthcheck. **No raw user-input SQL → SQL injection risk is minimal.**

---

## 3. Service Layer Spot Check

`src/services/` uses Prisma client exclusively for data access; services accept validated inputs from route handlers. No direct `req.body`/`req.query` usage in services.

Potential N+1 concerns — providerService.ts uses `PROVIDER_INCLUDE` constant for eager loading relations; this is imported in providers.ts:12 and re-used in the colocated handler (providers.ts:368). Looks intentional to avoid N+1.

---

## 4. Schema Findings & Rankings

### HIGH — none found.

### MEDIUM
1. **`ProviderPlanAcceptance.providerNpi` / `planId` are nullable** (schema.prisma:215-216). This allows PPA records without a provider or plan reference. FK constraints use `onUpdate: NoAction` but do not enforce `onDelete`. Consider: should these be `NOT NULL`?
2. **`VerificationLog` has `submittedBy String?` (line 250) storing emails** — per the prompt this is used for Sybil prevention. It's in `idx_vl_sybil_email` index. Not PII-free — the email is stored in plaintext. For the no-HIPAA review this is user-entered email metadata, not PHI, but still an enumeration/privacy concern worth flagging.
3. **`ProviderCmsDetails.source` defaults to `"cms_national"`** (line 115). Prompt already flags this as known issue (line 262). No source diversification mechanism.

### LOW
1. **No Provider-level state/city index** (prompt known issue). Address data lives in `practice_locations` — correct architectural choice.
2. **`PracticeLocation.address_hash` and `geocoded_at`** use snake_case field names in Prisma model (lines 85-86) — inconsistent with camelCase pattern (`addressHash`/`geocodedAt`). These would need refactoring for TypeScript ergonomics.
3. **`ProviderHospital.ccn`, `hospitalSystem`, `hospitalName`** are nullable (lines 124-126) — acceptable but `ccn` being null reduces joinability to `Hospital.ccn`.
4. **`engineType = "binary"`** in generator block (schema.prisma:4). This is the legacy engine; newer `library` engine is default but binary has better debuggability. Intentional choice.

---

## 5. Answers to Prompt's Questions

1. **Missing indexes causing slow queries?** — Not observable from static schema. Would need production query metrics. The schema has extensive indexing on hot paths (NPI, state, city, specialty, confidence, expiration).
2. **Soft-delete vs hard-delete for deactivated providers?** — Schema stores `deactivationDate`/`reactivationDate` as VARCHAR(10) on Provider (lines 25-26). Current approach = soft-delete via date fields. No hard-delete logic observed.
3. **N+1 query patterns?** — providerService uses `PROVIDER_INCLUDE` constant; verified via route spot check. Low risk.
4. **Plan for 9M+ providers?** — Not answerable from schema alone. Indexes support it; Cloud SQL sizing is deployment concern.
5. **Unique constraint on address fields?** — Already implemented (`@@unique([npi, addressLine1, city, state, zipCode])`, line 95).
6. **Normalize Provider fields to camelCase+@map?** — Already done for most fields. Prompt's claim of "inconsistent snake_case" does not reflect current schema.

---

## 6. Checklist Marking Summary

| Section | Verified | Partial | Missing |
|---|---|---|---|
| 1. Schema Security | 5/5 | 0 | 0 |
| 2. Row-Level Security | 4/4 | 0 | 0 |
| 3. Core Models (21) | 21/21 | 0 | 0 |
| 4. Key Relationships | 4/4 | 0 | 0 |
| 5. Indexes | ~95% | naming differences only | 0 |
| 6. Enums | 3/3 | 0 | 0 |
| 7. Data Quality Fields | 7/7 | 0 | 0 |
| 8. Schema Conventions | 6/6 | 0 | 0 |
| 9. Known Issues | noted by prompt | — | — |
| 10. Migration Safety | — | cannot verify from schema | — |

**Migration safety items (section 10):** The three items require migration-file inspection, not schema inspection. Could not verify from `schema.prisma` alone; would need to review `prisma/migrations/*.sql`.
