---
tags:
  - feature
  - location
  - implemented
type: prompt
priority: 2
---

# Location Features Review

## Files to Review
- `prisma/schema.prisma` (Location model)
- `packages/backend/src/routes/locations.ts` (location endpoints)
- `packages/backend/src/routes/providers.ts` (colocated endpoint)
- `packages/backend/src/services/locationService.ts` (location logic)
- `packages/frontend/src/app/location/[locationId]/page.tsx` (location page)
- `packages/frontend/src/components/LocationCard.tsx` (location display)

## Feature Overview

The Location feature groups healthcare providers by their physical address, allowing users to:
- See all providers at a hospital or clinic
- Identify health systems
- Find co-located specialists

## Database Schema

### Location Model
```prisma
model Location {
  id            Int       @id @default(autoincrement())
  addressLine1  String    @map("address_line1")
  addressLine2  String?   @map("address_line2")
  city          String
  state         String
  zipCode       String    @map("zip_code")
  name          String?   // e.g., "Memorial Hospital"
  healthSystem  String?   @map("health_system") // e.g., "HCA Healthcare"
  facilityType  String?   @map("facility_type") // e.g., "Hospital", "Clinic"
  providerCount Int?      @default(0)
  createdAt     DateTime? @default(now())
  updatedAt     DateTime? @updatedAt

  providers     Provider[]

  @@unique([addressLine1, city, state, zipCode])
  @@index([state])
  @@index([city, state])
  @@index([zipCode])
}
```

### Provider-Location Relationship
```prisma
model Provider {
  // ... other fields
  locationId Int?      @map("location_id")
  location   Location? @relation(fields: [locationId], references: [id])
}
```

## API Endpoints

### Location Routes (`/api/v1/locations`)

#### `GET /api/v1/locations/health-systems`
Get list of health systems.

**Response:**
```json
{
  "success": true,
  "data": {
    "healthSystems": ["HCA Healthcare", "Ascension", ...]
  }
}
```

#### `GET /api/v1/locations/:locationId`
Get location details.

**Response:**
```json
{
  "success": true,
  "data": {
    "location": {
      "id": 123,
      "name": "Memorial Hospital",
      "healthSystem": "HCA Healthcare",
      "facilityType": "Hospital",
      "addressLine1": "123 Main St",
      "city": "Miami",
      "state": "FL",
      "zipCode": "33101",
      "providerCount": 45
    }
  }
}
```

#### `GET /api/v1/locations/:locationId/providers`
Get providers at a location.

**Query Parameters:**
- `page` - Page number
- `limit` - Results per page

### Provider Routes

#### `GET /api/v1/providers/:npi/colocated`
Get other providers at the same location as this provider.

**Response:**
```json
{
  "success": true,
  "data": {
    "location": { ... },
    "providers": [...],
    "pagination": { ... }
  }
}
```

## Location Assignment Logic

During NPI import:
1. Extract address from provider record
2. Check if location exists with same (addressLine1, city, state, zipCode)
3. If exists, link provider to existing location
4. If not, create new location and link

```typescript
// Simplified logic
const location = await prisma.location.upsert({
  where: {
    addressLine1_city_state_zipCode: {
      addressLine1: provider.addressLine1,
      city: provider.city,
      state: provider.state,
      zipCode: provider.zipCode,
    }
  },
  update: { providerCount: { increment: 1 } },
  create: { ...addressFields, providerCount: 1 }
});

await prisma.provider.update({
  where: { npi },
  data: { locationId: location.id }
});
```

## Frontend Components

### LocationCard
Displays location information:
- Address
- Provider count
- Health system (if known)
- Facility type (if known)

### Location Detail Page
Route: `/location/[locationId]`

Shows:
- Location header with address
- Provider count
- List of providers at this location
- Filter by specialty

## Health System Identification

Currently, health system names are:
- Manually tagged (optional)
- Inferred from organization names (planned)
- Not automatically populated

**Future Enhancement:** Use organization name patterns to auto-detect health systems.

## Checklist

### Database
- [x] Location model created
- [x] Unique constraint on address
- [x] Provider-Location relationship
- [x] Indexes on state, city, zipCode
- [x] Provider count denormalized

### API
- [x] GET location by ID
- [x] GET providers by location
- [x] GET colocated providers for NPI
- [x] GET health systems list
- [ ] Search locations by name
- [ ] Filter by health system

### Frontend
- [x] Location detail page
- [x] LocationCard component
- [ ] Link from provider detail to location
- [ ] Location search/filter

### Data Quality
- [ ] Location names populated
- [ ] Health systems tagged
- [ ] Facility types categorized
- [ ] Duplicate locations merged

## Questions to Ask

1. **How are locations being populated?**
   - During NPI import?
   - Separately?

2. **Are location names being set?**
   - Manual tagging?
   - Auto-detection?

3. **What percentage of providers have locations?**

4. **Are there duplicate locations?**
   - Same address, different IDs?

5. **Should we show locations on search results?**
   - Group providers by location?

## Output Format

```markdown
# Location Features

**Last Updated:** [Date]
**Status:** ✅ Implemented

## Coverage
- Total locations: X
- Providers with locations: X%
- Locations with names: X%
- Health systems identified: X

## Endpoints
- GET /api/v1/locations/:id ✅
- GET /api/v1/locations/:id/providers ✅
- GET /api/v1/providers/:npi/colocated ✅

## Data Quality
| Metric | Value | Target |
|--------|-------|--------|
| Named locations | X% | 50% |
| Health systems | X | 100+ |
| Avg providers/location | X | N/A |

## Issues
[List any issues]

## Recommendations
[List recommendations]
```
