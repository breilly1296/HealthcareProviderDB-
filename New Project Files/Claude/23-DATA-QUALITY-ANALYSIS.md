# VerifyMyProvider Data Quality Tracker

**Last Updated:** January 25, 2026

---

## Data Quality Summary

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| Total Providers | ~2.1M | 9.2M | 23% |
| States Imported | 6 | 50+ | 12% |
| Specialty Coverage | 57 categories | Complete | Good |
| City Normalization | NYC only | All major | Partial |
| Deactivated Cleanup | Pending | Clean | Needed |

---

## Provider Data Quality

### Import Statistics

| State | Providers | Status | Date |
|-------|-----------|--------|------|
| Florida (FL) | 613,875 | Complete | Jan 2026 |
| Alabama (AL) | 90,572 | Complete | Jan 2026 |
| Alaska (AK) | 34,701 | Complete | Jan 2026 |
| Arkansas (AR) | 82,527 | Complete | Jan 2026 |
| Arizona (AZ) | 167,899 | Complete | Jan 2026 |
| California (CA) | 1,113,464 | Complete | Jan 2026 |
| **Total** | **~2.1M** | | |

### States Remaining
- 44 states + DC + territories
- Estimated: ~7M additional providers

---

## Data Quality Issues

### Issue 1: City Name Variations

**Problem:** Inconsistent city names from NPI data

**Examples:**
```
"Birmingam" vs "Birmingham"
"Birmingham,al" vs "Birmingham"
"Birmingham," vs "Birmingham"
```

**Current Status:**
- NYC neighborhoods normalized (100+ variations)
- Other cities not normalized

**Impact:**
- Search may miss providers
- UI looks inconsistent

**Recommendation:**
- Expand normalization beyond NYC
- Or accept inconsistency for now

---

### Issue 2: Deactivated Providers

**Problem:** ~0.2% of providers have deactivation dates

**Current Status:**
- Import script skips deactivated (with bug)
- Some may have slipped through

**Impact:**
- Users may find deactivated providers
- Wasted search results

**Recommendation:**
- Run cleanup script after imports
- Fix import script date parsing

---

### Issue 3: Address Reliability

**Problem:** NPI addresses are self-reported, rarely updated

**Example:**
- Provider moves office
- NPI still shows old address

**Impact:**
- Location searches may be inaccurate
- Organization linking unreliable

**Recommendation:**
- Don't rely on addresses for org linking (current approach)
- Use for display only

---

### Issue 4: Specialty Mapping Gaps

**Problem:** Some taxonomy codes may not map correctly

**Current Coverage:**
- 876 explicit taxonomy codes
- 116 prefix-based rules
- 57 specialty categories

**Impact:**
- Some providers may be categorized as "Other"
- Specialty search may miss providers

**Recommendation:**
- Monitor unmapped taxonomies
- Add mappings as needed

---

## Verification Data Quality

### Confidence Score Distribution

| Score Range | Meaning | Target % |
|-------------|---------|----------|
| 90-100 | Very High | 10% |
| 70-89 | High | 30% |
| 50-69 | Medium | 40% |
| 30-49 | Low | 15% |
| 0-29 | Very Low | 5% |

**Current Status:** Most data is Low/Very Low (new system)

### Verification Activity

| Metric | Current | Target |
|--------|---------|--------|
| Total Verifications | ~0 (beta) | 2,000 |
| Verifications/Day | ~0 | 50 |
| Active Users | ~0 | 50 |

---

## Data Freshness

### TTL Configuration
- Verification expiration: 6 months
- Acceptance expiration: 6 months
- Rationale: 12% annual provider turnover

### Freshness Monitoring
```sql
-- Check stale verifications
SELECT COUNT(*)
FROM verification_logs
WHERE created_at < NOW() - INTERVAL '90 days';

-- Check expired records
SELECT COUNT(*)
FROM verification_logs
WHERE expires_at < NOW();
```

---

## Data Completeness

### Provider Fields

| Field | Populated | Notes |
|-------|-----------|-------|
| NPI | 100% | Required |
| Name | 100% | First/Last or Org |
| Specialty | ~95% | Some unmapped |
| Address | 100% | Required |
| Phone | ~80% | Optional |
| Credential | ~90% | For individuals |

### Plan Acceptance Data

| Status | Count | Notes |
|--------|-------|-------|
| UNKNOWN | ~100% | Starting state |
| ACCEPTED | <1% | Needs verifications |
| NOT_ACCEPTED | <1% | Needs verifications |
| PENDING | <1% | In verification |

---

## Data Quality Actions

### Immediate
- [ ] Fix import deactivation logic
- [ ] Run cleanup on imported states

### Before Beta
- [ ] Complete state imports
- [ ] Regenerate cities.json
- [ ] Run VACUUM ANALYZE

### Ongoing
- [ ] Monitor verification activity
- [ ] Track confidence score distribution
- [ ] Alert on high conflict rates

---

## Data Quality Queries

### Check Provider Counts by State
```sql
SELECT state, COUNT(*) as count
FROM providers
GROUP BY state
ORDER BY count DESC;
```

### Find Duplicate Locations
```sql
SELECT address_line1, city, state, COUNT(*)
FROM locations
GROUP BY address_line1, city, state
HAVING COUNT(*) > 1;
```

### Check Verification Conflicts
```sql
SELECT provider_npi, plan_id,
  COUNT(CASE WHEN new_value->>'accepted' = 'true' THEN 1 END) as accepts,
  COUNT(CASE WHEN new_value->>'accepted' = 'false' THEN 1 END) as rejects
FROM verification_logs
GROUP BY provider_npi, plan_id
HAVING COUNT(*) > 1 AND
  COUNT(CASE WHEN new_value->>'accepted' = 'true' THEN 1 END) > 0 AND
  COUNT(CASE WHEN new_value->>'accepted' = 'false' THEN 1 END) > 0;
```

---

## Data Quality Metrics Dashboard

### Key Metrics to Track

1. **Import Progress**
   - States completed
   - Providers imported
   - Import errors

2. **Data Freshness**
   - Average verification age
   - Expired records
   - Stale provider data

3. **Verification Quality**
   - Verification rate
   - Conflict rate
   - Average confidence

4. **Search Quality**
   - Zero-result searches
   - Search abandonment
   - Click-through rate

---

*Data quality improves with user verifications over time*
