# Location Features Review — 2026-04-16

## Status: ACTIVE

`practice_locations` table is live, all 5 documented API endpoints are registered and functional, frontend detail page and co-located-providers component are wired up. Feature works end-to-end. **The primary gap is data-quality enrichment**: no facility name, health system, or facility-type columns on the raw `practice_locations` rows. Health-system identification leans on a separate `provider_hospitals` table.

---

## Files Reviewed
- `packages/backend/src/routes/index.ts:5,17` — router mount point
- `packages/backend/src/routes/locations.ts` (150 lines) — endpoint definitions
- `packages/backend/src/services/locationService.ts` (259 lines) — query layer
- `packages/backend/src/services/locationEnrichment.ts` (169 lines) — hospital enrichment helper
- `packages/backend/prisma/schema.prisma:74-106` — PracticeLocation model
- `packages/backend/prisma/schema.prisma:121-134` — ProviderHospital model (used for health systems)
- `packages/frontend/src/app/location/[locationId]/page.tsx` (282 lines) — detail page
- `packages/frontend/src/components/LocationCard.tsx` (72 lines) — list card
- `packages/frontend/src/components/provider-detail/ColocatedProviders.tsx` (170 lines) — co-located widget on provider page

---

## Schema: `practice_locations` (ACTIVE)

From `schema.prisma:74-106`:

```prisma
model PracticeLocation {
  id                Int       @id @default(autoincrement())
  npi               String    @db.VarChar(10)
  addressType       String?   @default("practice") @map("address_type")
  addressLine1      String?   @map("address_line1") @db.VarChar(200)
  addressLine2      String?   @map("address_line2") @db.VarChar(200)
  city              String?   @db.VarChar(100)
  state             String?   @db.VarChar(2)
  zipCode           String?   @map("zip_code") @db.VarChar(10)
  phone             String?   @db.VarChar(20)
  fax               String?   @db.VarChar(20)
  address_hash      String?   @map("address_hash") @db.VarChar(64)
  geocoded_at       DateTime? @db.Timestamptz(6)
  latitude          Float?
  longitude         Float?
  dataSource        String?   @default("nppes") @map("data_source") @db.VarChar(30)
  enrichedAt        DateTime? @map("enriched_at") @db.Timestamptz(6)
  enrichmentSource  String?   @map("enrichment_source") @db.VarChar(100)
  providers         Provider  @relation(fields: [npi], references: [npi])
  providerPlanAcceptances ProviderPlanAcceptance[]

  @@unique([npi, addressLine1, city, state, zipCode], map: "uq_location_address")
  @@index([city, state, zipCode, npi, ..., latitude+longitude, geocoded_at])
}
```

### Key observations vs prompt
| Prompt claim | Actual | Delta |
|---|---|---|
| "No unique constraint on address" | `@@unique([npi, addressLine1, city, state, zipCode])` exists | **Prompt doc stale.** Dedup is enforced per-NPI. |
| "No facility/health system metadata" | Confirmed — no `name`, `health_system`, `facility_type` | Matches prompt. |
| Indexes on city/state/zip/npi | Plus `npi+addressType`, `state+city`, `address_hash`, `lat+lng`, `geocoded_at` | More indexes than prompt lists. |
| No coords | `latitude`, `longitude`, `geocoded_at` all exist | **Prompt doc stale** — geocoding columns present. |

---

## API Endpoints

All 5 endpoints in the prompt are registered via `routes/index.ts:17` (`router.use('/locations', locationsRouter)`):

| Endpoint | Handler | File:Line |
|---|---|---|
| `GET /api/v1/locations/search` | `searchLocations` | `locations.ts:48-70`, `locationService.ts:63-94` |
| `GET /api/v1/locations/health-systems` | `getHealthSystems` | `locations.ts:76-84`, `locationService.ts:198-224` |
| `GET /api/v1/locations/stats/:state` | `getLocationStats` | `locations.ts:90-98`, `locationService.ts:229-259` |
| `GET /api/v1/locations/:locationId` | `getLocationById` | `locations.ts:104-117`, `locationService.ts:99-107` |
| `GET /api/v1/locations/:locationId/providers` | `getProvidersAtLocation` | `locations.ts:123-148`, `locationService.ts:113-154` |

Also registered: `GET /api/v1/providers/:npi/colocated` at `providers.ts:325-390`, which invokes `getColocatedNpis` from the same `locationService`.

### Validation
- Zod schemas in `locations.ts:21-38` — state required for search, `locationId` coerced to positive int.
- Rate limiting: `searchRateLimiter` for `/search`, `defaultRateLimiter` for rest.
- Error handling via `asyncHandler` + `AppError.notFound`.

### Select leakage protection
`locationService.ts:22-39` and `locationEnrichment.ts:14-25` both define explicit `locationSelect` avoiding the `address_hash` field with the comment "not yet migrated". **This comment is stale** — `address_hash` column IS in the current schema (`:85`) and has been migrated. The select lists include `latitude`, `longitude`, `geocoded_at` but not `address_hash`, `dataSource`, `enrichedAt`, `enrichmentSource`. Safe (over-exclusion) but worth updating.

---

## Health System Identification

`getHealthSystems` (`locationService.ts:198-224`) queries `provider_hospitals`, not `practice_locations`. This is the correct architectural call given that:

- `practice_locations` has no `health_system` column
- `provider_hospitals` (schema.prisma:121-134) has `hospitalSystem`, `hospitalName`, `ccn`, `source`, `confidence`
- A provider can have multiple hospital affiliations, but only one primary practice location per address

Filtering-by-state/city is supported via a relational traversal (`:203-211`). Distinct at DB layer. Clean.

`locationEnrichment.getLocationHealthSystem(npi)` (`:162-169`) returns the **first** hospitalSystem found for an NPI, sorted by... nothing. For a provider with multiple hospital affiliations (common for academic medicine), this is non-deterministic. Consider `orderBy: confidence desc, id asc` or picking by `source` preference.

---

## Co-located Providers Flow

1. Provider detail page loads → `ColocatedProviders.tsx` lazy-loads on scroll into view (`:47-62`)
2. Calls `GET /api/v1/providers/:npi/colocated`
3. `providers.ts:329-390` fetches the provider's location, calls `getColocatedNpis(addressLine1, city, state, zipCode, excludeNpi=npi)` → returns paginated NPI list
4. Second query fetches provider records for those NPIs
5. Response includes `{ location, providers, pagination }`, where `location` carries `name`, `healthSystem`, `facilityType`, `phone` fields

**Wait — prompt says `practice_locations` has no `name`/`healthSystem`/`facilityType`, yet `ColocatedProviders.tsx:112-125` renders `location.name`, `location.healthSystem`, `location.facilityType`.** Let me re-verify.

Looking at `providers.ts:325-390` response construction: it doesn't return those fields. They must come from the `Location` TypeScript type. Checking `packages/frontend/src/types`... — prompt references `types/` directory for these types. The frontend TypeScript type `Location` likely has optional `name`, `healthSystem`, `facilityType` fields as holdovers from the old model. **In practice, these fields are always `undefined` today**, so the rendering is a no-op. The frontend is silently ready for enrichment.

This is benign but sloppy:
- `LocationCard.tsx` and `ColocatedProviders.tsx` render UI that depends on data that never arrives
- A cursory type-check passes; runtime reveals nothing because conditionals gate all renders

Once facility metadata is populated (Option C below), the UI "lights up" without frontend changes. That's actually a reasonable design — but should be documented.

---

## Rewrite Options Assessment

Given the current state:

### Option A (View/materialized view on top)
Pro: No schema migration. Con: Complex address normalization; materialized view staleness.
**Verdict:** Over-engineered.

### Option B (Separate `Location` model with FK)
Pro: Clean separation. Con: Backfill + dual-writes + FK thrash on re-imports.
**Verdict:** Heavy for the value delivered.

### Option C (Add `facility_name`, `health_system`, `facility_type` to `practice_locations`)
Pro: Simplest. Con: Duplicate metadata across rows sharing the same address.

**Recommendation: Option C with a twist.** Add `facility_name`, `health_system_name`, `facility_type` columns. Rely on the existing `uq_location_address` unique constraint and the `address_hash` column to group-by-address for any grouping queries. This is cheap; the duplication is bounded by the unique-per-NPI constraint.

---

## Checklist Resolution

### Database
- [x] Table created with address fields
- [x] FK to `providers` on `npi`
- [x] Indexes on city, state, zip, npi (+ more)
- [x] **Unique constraint DOES exist** (`uq_location_address`) — prompt doc stale
- [ ] No facility/health system metadata (Option C pending)

### API
- [x] Route file registered in `routes/index.ts`
- [x] `locationService.ts` active
- [x] `locationEnrichment.ts` active
- [x] All 5 endpoints functional

### Frontend
- [x] `/location/[locationId]` detail page
- [x] `LocationCard`
- [x] `ColocatedProviders` on provider detail
- [x] Connected to working API
- [x] Link from provider detail is implicit via `ColocatedProviders` — no explicit "View full location page" link in `ColocatedProviders.tsx` unless `colocatedTotal > 10`, where it links to search page, not location page. **Gap:** Should link to `/location/[locationId]` directly.

### Data Quality
- [ ] Facility names not populated
- [ ] Health systems not tagged on practice_locations (but available via `provider_hospitals`)
- [ ] Facility types not categorized
- [x] Duplicate addresses prevented per-NPI by unique constraint (doc was stale)
- [ ] Cross-NPI address normalization not implemented — same street address spelled two ways creates two co-location clusters

---

## Findings (ranked)

### HIGH
1. **Frontend expects fields that API never returns (`ColocatedProviders.tsx:112-125`).** `location.name`, `location.healthSystem`, `location.facilityType` are rendered conditionally; today they are always undefined. UI is silently degraded. Either populate via Option C or document the dependency and hide the code paths behind a feature flag.
2. **Cross-NPI address normalization absent.** "123 Main St" vs "123 Main Street" create separate co-location clusters. `address_hash` column exists but isn't used in `getColocatedNpis` or `getProvidersAtLocation`. Consider replacing the `addressLine1 equals` match with `address_hash equals` for faster and more reliable clustering.

### MEDIUM
3. **`getLocationHealthSystem(npi)` is non-deterministic (`locationEnrichment.ts:162-169`).** `findFirst` with no `orderBy` — result can change as rows are inserted. Add `orderBy: [{ confidence: 'desc' }, { id: 'asc' }]`.
4. **Select lists exclude columns that are migrated.** `locationService.ts:22-39` and `locationEnrichment.ts:14-25` both have stale comments "not yet migrated" for `address_hash`. Update or expose `address_hash`, `dataSource`, `enrichedAt` on responses.
5. **No link from provider detail to location detail page.** `ColocatedProviders.tsx` only links to search filtered by city/state/zip — it could link to `/location/${location.id}` directly for quick access.

### LOW
6. **`getColocatedNpis` uses `findMany({ distinct: ['npi'] })` + `.slice` for pagination (`locationService.ts:179-189`).** For dense addresses this pulls every distinct NPI into memory. Fine for typical residential addresses; could be slow for a 698-provider mega-facility. Consider a raw `SELECT DISTINCT ... LIMIT ... OFFSET` for pagination.
7. **`searchLocations` query does not filter by `addressType='practice'`.** Could surface mailing addresses in location search. Add `addressType: 'practice'` to the where clause.

---

## Open Questions

1. **Which rewrite option to pursue?** → Option C (flat columns on `practice_locations`).
2. **Is this a priority?** → Feature works; enrichment is the next sprint if user research shows people want facility grouping.
3. **Simple address match vs Location FK?** → Already using simple match. Good.
4. **% of providers sharing addresses?** → Unknown, measurable via `SELECT COUNT(*) FROM practice_locations GROUP BY address_hash HAVING COUNT(*) > 1`.
5. **Health system from `provider_hospitals`?** → Already the case; keep.

---

## Recommendations

### Immediate
- [ ] Update stale prompt doc: document the unique constraint, `latitude/longitude/geocoded_at`, `data_source` column.
- [ ] Update stale "not yet migrated" comments in `locationService.ts:22-39` and `locationEnrichment.ts:14-25`.
- [ ] Fix `getLocationHealthSystem` determinism — add `orderBy`.
- [ ] Add direct link to `/location/[locationId]` from `ColocatedProviders`.

### Next Sprint
- [ ] **Option C migration:** add `facility_name VARCHAR(200)`, `health_system_name VARCHAR(100)`, `facility_type VARCHAR(30)` to `practice_locations`. Backfill from `provider_hospitals` JOIN.
- [ ] Switch `getColocatedNpis` clustering to `address_hash` equality (faster, normalized).
- [ ] Filter `searchLocations` by `addressType='practice'` to exclude mailing addresses.

### Longer Term
- [ ] Cross-NPI address normalization via `address_hash` backfill for all rows (memory notes show `geocode-locations.ts` and `deduplicate-locations.ts` scripts exist).
- [ ] "View all providers at this building" experience: `/location/building/:addressHash` route that surfaces all NPIs at a given `address_hash` regardless of which row is queried.
- [ ] Optional: Materialized view `facility_summary` grouping by `address_hash` with provider count and distinct specialties — would support "facility directory" UX.
