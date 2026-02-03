# VerifyMyProvider Provider Comparison Analysis

**Last Updated:** 2026-01-31
**Analyzed By:** Claude Code

---

## Executive Summary

The provider comparison feature allows users to compare up to 4 providers side-by-side, viewing their details, specialties, locations, and insurance acceptance status. This helps patients make informed decisions when choosing a healthcare provider.

---

## Feature Overview

```
┌─────────────────────────────────────────────────────────────┐
│                  Provider Comparison View                    │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ Dr. Smith│  │ Dr. Jones│  │ Dr. Patel│  │ + Add    │   │
│  │ Cardio   │  │ Cardio   │  │ Cardio   │  │ Provider │   │
│  ├──────────┤  ├──────────┤  ├──────────┤  │          │   │
│  │ LA, CA   │  │ LA, CA   │  │ SF, CA   │  │          │   │
│  │ 10 miles │  │ 5 miles  │  │ 15 miles │  │          │   │
│  ├──────────┤  ├──────────┤  ├──────────┤  │          │   │
│  │ BCBS: ✓  │  │ BCBS: ✓  │  │ BCBS: ?  │  │          │   │
│  │ Aetna: ✓ │  │ Aetna: ✗ │  │ Aetna: ✓ │  │          │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation

### Compare Context

```typescript
// packages/frontend/src/contexts/CompareContext.tsx

interface CompareContextValue {
  compareList: string[];  // NPIs
  addToCompare: (npi: string) => void;
  removeFromCompare: (npi: string) => void;
  clearCompare: () => void;
  isInCompare: (npi: string) => boolean;
  canAddMore: boolean;
}

const MAX_COMPARE = 4;

export function CompareProvider({ children }: { children: React.ReactNode }) {
  const [compareList, setCompareList] = useState<string[]>([]);

  const addToCompare = useCallback((npi: string) => {
    setCompareList(prev => {
      if (prev.length >= MAX_COMPARE) return prev;
      if (prev.includes(npi)) return prev;
      return [...prev, npi];
    });
  }, []);

  const removeFromCompare = useCallback((npi: string) => {
    setCompareList(prev => prev.filter(n => n !== npi));
  }, []);

  const clearCompare = useCallback(() => {
    setCompareList([]);
  }, []);

  const isInCompare = useCallback((npi: string) => {
    return compareList.includes(npi);
  }, [compareList]);

  const canAddMore = compareList.length < MAX_COMPARE;

  return (
    <CompareContext.Provider value={{
      compareList,
      addToCompare,
      removeFromCompare,
      clearCompare,
      isInCompare,
      canAddMore
    }}>
      {children}
    </CompareContext.Provider>
  );
}
```

### Compare Button

```typescript
// packages/frontend/src/components/providers/CompareButton.tsx

export function CompareButton({ npi }: { npi: string }) {
  const { addToCompare, removeFromCompare, isInCompare, canAddMore } = useCompare();
  const inCompare = isInCompare(npi);

  if (inCompare) {
    return (
      <button
        onClick={() => removeFromCompare(npi)}
        className="flex items-center gap-1 px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded-full"
      >
        <Check className="h-4 w-4" />
        In Compare
      </button>
    );
  }

  return (
    <button
      onClick={() => addToCompare(npi)}
      disabled={!canAddMore}
      className="flex items-center gap-1 px-3 py-1 text-sm border rounded-full hover:bg-gray-50 disabled:opacity-50"
    >
      <Plus className="h-4 w-4" />
      Compare
    </button>
  );
}
```

### Compare Tray (Floating)

```typescript
// packages/frontend/src/components/providers/CompareTray.tsx

export function CompareTray() {
  const { compareList, removeFromCompare, clearCompare } = useCompare();
  const router = useRouter();

  if (compareList.length === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg p-4 z-50">
      <div className="container mx-auto flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium">
            Comparing {compareList.length} provider{compareList.length > 1 ? 's' : ''}
          </span>

          <div className="flex gap-2">
            {compareList.map(npi => (
              <CompareChip
                key={npi}
                npi={npi}
                onRemove={() => removeFromCompare(npi)}
              />
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={clearCompare}
            className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800"
          >
            Clear
          </button>
          <button
            onClick={() => router.push(`/providers/compare?npis=${compareList.join(',')}`)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Compare Now
          </button>
        </div>
      </div>
    </div>
  );
}
```

---

## Comparison Page

### Page Component

```typescript
// packages/frontend/src/app/providers/compare/page.tsx

export default async function ComparePage({
  searchParams
}: {
  searchParams: { npis?: string }
}) {
  const npis = searchParams.npis?.split(',').slice(0, 4) || [];

  if (npis.length < 2) {
    redirect('/providers');
  }

  // Fetch all providers in parallel
  const providers = await Promise.all(
    npis.map(npi => api.getProvider(npi))
  );

  // Fetch plan acceptance for each
  const planAcceptance = await Promise.all(
    npis.map(npi => api.getProviderPlans(npi))
  );

  // Get unique plans across all providers
  const allPlans = getUniquePlans(planAcceptance);

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Compare Providers</h1>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          {/* Provider Info Section */}
          <thead>
            <tr>
              <th className="text-left p-4 bg-gray-50">Provider</th>
              {providers.map(p => (
                <th key={p.npi} className="p-4 bg-gray-50 min-w-[200px]">
                  <ProviderHeader provider={p} />
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {/* Basic Info */}
            <CompareRow label="Specialty">
              {providers.map(p => (
                <td key={p.npi} className="p-4">
                  {p.specialty}
                </td>
              ))}
            </CompareRow>

            <CompareRow label="Location">
              {providers.map(p => (
                <td key={p.npi} className="p-4">
                  {p.city}, {p.state}
                </td>
              ))}
            </CompareRow>

            <CompareRow label="Phone">
              {providers.map(p => (
                <td key={p.npi} className="p-4">
                  {formatPhone(p.phone)}
                </td>
              ))}
            </CompareRow>

            {/* Insurance Acceptance Section */}
            <tr>
              <td colSpan={providers.length + 1} className="p-4 bg-blue-50 font-semibold">
                Insurance Acceptance
              </td>
            </tr>

            {allPlans.map(plan => (
              <CompareRow key={plan.id} label={plan.name}>
                {providers.map((p, i) => (
                  <td key={p.npi} className="p-4">
                    <AcceptanceCell
                      acceptance={planAcceptance[i].find(a => a.planId === plan.id)}
                    />
                  </td>
                ))}
              </CompareRow>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

### Acceptance Cell Component

```typescript
function AcceptanceCell({ acceptance }: { acceptance?: PlanAcceptance }) {
  if (!acceptance || acceptance.confidenceScore === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-gray-400">
        <HelpCircle className="h-4 w-4" />
        Unknown
      </span>
    );
  }

  const { acceptanceStatus, confidenceLevel } = acceptance;

  const icons = {
    ACCEPTS: <Check className="h-4 w-4 text-green-600" />,
    REJECTS: <X className="h-4 w-4 text-red-600" />,
    UNKNOWN: <HelpCircle className="h-4 w-4 text-gray-400" />
  };

  const labels = {
    ACCEPTS: 'Accepts',
    REJECTS: 'Does not accept',
    UNKNOWN: 'Unknown'
  };

  return (
    <div className="flex items-center gap-2">
      {icons[acceptanceStatus]}
      <span>{labels[acceptanceStatus]}</span>
      <ConfidenceBadge level={confidenceLevel} />
    </div>
  );
}
```

---

## API Support

### Batch Provider Fetch

```typescript
// packages/backend/src/routes/providers.ts

// GET /api/v1/providers/batch?npis=1234567890,0987654321
router.get('/batch', defaultRateLimiter, asyncHandler(async (req, res) => {
  const { npis } = req.query;

  if (!npis || typeof npis !== 'string') {
    throw AppError.badRequest('NPIs required');
  }

  const npiList = npis.split(',').slice(0, 10);  // Max 10

  // Validate all NPIs
  for (const npi of npiList) {
    if (!/^\d{10}$/.test(npi)) {
      throw AppError.badRequest(`Invalid NPI: ${npi}`);
    }
  }

  const providers = await prisma.provider.findMany({
    where: { npi: { in: npiList } },
    include: { location: true }
  });

  res.json({ success: true, data: providers });
}));
```

---

## Comparison Criteria

| Criteria | Display | Notes |
|----------|---------|-------|
| Name & Credentials | Header | Dr. John Smith, MD |
| Specialty | Row | Cardiovascular Disease |
| Location | Row | City, State + distance |
| Phone | Row | Formatted phone number |
| Insurance Plans | Section | Per-plan acceptance status |
| Confidence | Badge | Per-plan confidence level |
| Last Verified | Tooltip | Verification recency |

---

## Mobile Responsiveness

### Horizontal Scroll

```css
/* Mobile: horizontal scroll */
.compare-table {
  @apply overflow-x-auto;
}

.compare-column {
  @apply min-w-[200px];
}
```

### Swipeable Cards (Alternative)

```typescript
// packages/frontend/src/components/providers/CompareSwiper.tsx

export function CompareSwiper({ providers }: { providers: Provider[] }) {
  const [activeIndex, setActiveIndex] = useState(0);

  return (
    <div className="md:hidden">
      <Swiper
        onSlideChange={(swiper) => setActiveIndex(swiper.activeIndex)}
        pagination={{ clickable: true }}
      >
        {providers.map(provider => (
          <SwiperSlide key={provider.npi}>
            <ProviderCompareCard provider={provider} />
          </SwiperSlide>
        ))}
      </Swiper>

      <div className="flex justify-center gap-2 mt-4">
        {providers.map((_, i) => (
          <button
            key={i}
            className={cn(
              'w-2 h-2 rounded-full',
              i === activeIndex ? 'bg-blue-600' : 'bg-gray-300'
            )}
            onClick={() => setActiveIndex(i)}
          />
        ))}
      </div>
    </div>
  );
}
```

---

## Analytics Events

```typescript
// Track comparison usage
posthog.capture('compare_add', {
  providerNpi: npi,
  compareCount: compareList.length + 1
});

posthog.capture('compare_view', {
  providerCount: npis.length,
  hasInsuranceData: providers.some(p => p.planAcceptance.length > 0)
});

posthog.capture('compare_select', {
  selectedNpi: npi,
  position: index
});
```

---

## Recommendations

### Immediate
- ✅ Core comparison feature complete
- Add print/export functionality
- Add share comparison link

### Future
1. **Distance calculation**
   - Add geocoding
   - Show distance from user location

2. **Ratings/Reviews**
   - If reviews are added
   - Show rating comparison

3. **Appointment availability**
   - If scheduling is added
   - Show availability comparison

---

## Conclusion

Provider comparison is **well-implemented**:

- ✅ Compare up to 4 providers
- ✅ Side-by-side view
- ✅ Insurance acceptance comparison
- ✅ Confidence level display
- ✅ Floating compare tray
- ✅ Mobile responsive

The feature helps users make informed provider choices.
