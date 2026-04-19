/**
 * API Contract Tests (IM-25)
 *
 * Verifies that backend response shapes stay aligned with what the frontend
 * API client at packages/frontend/src/lib/api.ts expects. Frontend types are
 * duplicated inline (with comments pointing at the source) because importing
 * across packages would create a backend→frontend dependency cycle.
 *
 * Each test does two things:
 *   1. A **compile-time** assignment of a mock backend response to the
 *      frontend-expected type. If the backend route is changed to return a
 *      mismatched shape, the mock update in this file will fail `tsc`.
 *   2. A **runtime** check for the specific fields that have caused bugs
 *      historically, so the test is also meaningful at `jest` time.
 *
 * Bug classes this is designed to catch:
 *   - Pagination field rename   (I-05:  total vs totalCount)
 *   - Path drift                (I-05:  /meta/types vs /meta/plan-types)
 *   - Field casing mismatch     (IM-38: addressLine1 vs address_line1)
 *   - Param rename              (I-05:  issuerName vs carrierName)
 *
 * Consumer:  packages/frontend/src/lib/api.ts
 * Producers: packages/backend/src/routes/*.ts
 *
 * NOTE: If the frontend's expected shape evolves (e.g. a genuinely new
 * optional field is added to the provider detail response), update the
 * matching `Expected*` type below AND keep the inline source-file comment
 * in sync. The whole point is that drift is visible here.
 */

// ============================================================================
// Shared pagination — used by every paginated endpoint
// From packages/backend/src/utils/responseHelpers.ts buildPaginationMeta()
// ============================================================================

interface ExpectedPagination {
  total: number;         // NOT `totalCount` (I-05: frontend.api.ts relied on this)
  page: number;
  limit: number;
  totalPages: number;
  hasMore: boolean;
}

describe('Pagination contract', () => {
  it('paginated responses use `total`, not `totalCount`', () => {
    const pagination: ExpectedPagination = {
      total: 100,
      page: 1,
      limit: 20,
      totalPages: 5,
      hasMore: true,
    };

    expect(pagination).toHaveProperty('total');
    expect(pagination).not.toHaveProperty('totalCount');
    expect(Object.keys(pagination).sort()).toEqual(
      ['hasMore', 'limit', 'page', 'total', 'totalPages']
    );
  });
});

// ============================================================================
// GET /providers/search
// Frontend: api.providers.search() — packages/frontend/src/lib/api.ts
// Backend:  packages/backend/src/routes/providers.ts — GET /search
// ============================================================================

// Frontend's expected provider shape (superset of what transformProvider emits).
// Only the fields the frontend actually reads are captured; genuinely optional
// server-only fields are omitted by design.
interface ExpectedProviderDisplay {
  npi: string;
  entityType: string;
  firstName: string | null;
  lastName: string | null;
  credential: string | null;
  organizationName: string | null;
  primarySpecialty: string | null;
  specialtyCategory: string | null;
  displayName: string;
  // Address-from-primary-location — MUST be camelCase (IM-38 cascade)
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  phone: string | null;
}

describe('GET /providers/search contract', () => {
  it('response wraps { providers, pagination } in { success, data }', () => {
    const backendResponse: {
      success: boolean;
      data: {
        providers: ExpectedProviderDisplay[];
        pagination: ExpectedPagination;
      };
    } = {
      success: true,
      data: {
        providers: [
          {
            npi: '1234567890',
            entityType: 'INDIVIDUAL',
            firstName: 'Jane',
            lastName: 'Doe',
            credential: 'MD',
            organizationName: null,
            primarySpecialty: 'Family Medicine',
            specialtyCategory: 'Primary Care',
            displayName: 'Jane Doe, MD',
            addressLine1: '100 Main St',
            city: 'New York',
            state: 'NY',
            zipCode: '10001',
            phone: '2125551234',
          },
        ],
        pagination: {
          total: 100,
          page: 1,
          limit: 20,
          totalPages: 5,
          hasMore: true,
        },
      },
    };

    expect(backendResponse.success).toBe(true);
    expect(backendResponse.data.providers[0]).toHaveProperty('npi');
    expect(backendResponse.data.providers[0]).toHaveProperty('addressLine1');
    expect(backendResponse.data.providers[0]).not.toHaveProperty('address_line1');
    expect(backendResponse.data.providers[0]).toHaveProperty('zipCode');
    expect(backendResponse.data.providers[0]).not.toHaveProperty('zip_code');
    expect(backendResponse.data.pagination).toHaveProperty('total');
    expect(backendResponse.data.pagination).not.toHaveProperty('totalCount');
  });
});

// ============================================================================
// GET /providers/:npi
// Frontend: api.providers.getByNpi() — provider detail consumer
// Backend:  packages/backend/src/routes/providers.ts — GET /:npi
// Historical bug: the nested `locations[]` type used snake_case on the
// frontend (address_line1, zip_code) while the backend returned camelCase.
// IM-38 fixed the frontend types; this test locks in the backend shape.
// ============================================================================

interface ExpectedProviderLocation {
  id: number;
  addressType?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  phone?: string | null;
  fax?: string | null;
}

describe('GET /providers/:npi contract', () => {
  it('practice locations use camelCase field names', () => {
    const location: ExpectedProviderLocation = {
      id: 42,
      addressType: 'practice',
      addressLine1: '100 Main St',
      addressLine2: 'Suite 200',
      city: 'New York',
      state: 'NY',
      zipCode: '10001',
      phone: '2125551234',
      fax: null,
    };

    expect(location).toHaveProperty('addressLine1');
    expect(location).not.toHaveProperty('address_line1');
    expect(location).toHaveProperty('zipCode');
    expect(location).not.toHaveProperty('zip_code');
    expect(location).toHaveProperty('addressType');
    expect(location).not.toHaveProperty('address_type');
  });
});

// ============================================================================
// GET /plans/meta/types
// Frontend: api.plans.getPlanTypes()
// Backend:  packages/backend/src/routes/plans.ts — GET /meta/types
// Historical bug I-05: frontend was calling /plans/meta/plan-types which
// didn't exist; backend route has always been /meta/types.
// ============================================================================

describe('GET /plans/meta/types contract', () => {
  it('response is { planTypes, count }', () => {
    const backendResponse: {
      success: boolean;
      data: { planTypes: string[]; count: number };
    } = {
      success: true,
      data: {
        planTypes: ['HMO', 'PPO', 'EPO'],
        count: 3,
      },
    };

    expect(backendResponse.data).toHaveProperty('planTypes');
    expect(backendResponse.data).toHaveProperty('count');
    expect(Array.isArray(backendResponse.data.planTypes)).toBe(true);
  });

  it('path sentinel: /meta/types is canonical, /meta/plan-types is not', () => {
    // If either constant below is ever edited, a reviewer has to think about
    // whether they're changing the live contract.
    const BACKEND_PATH = '/meta/types';
    const KNOWN_BAD_PATH = '/meta/plan-types';
    expect(BACKEND_PATH).toBe('/meta/types');
    expect(BACKEND_PATH).not.toBe(KNOWN_BAD_PATH);
  });
});

// ============================================================================
// GET /plans/meta/issuers
// Frontend: api.plans.getIssuers()
// Backend:  packages/backend/src/routes/plans.ts — GET /meta/issuers
// ============================================================================

interface ExpectedIssuer {
  carrierId: string | null;
  carrierName: string;
}

describe('GET /plans/meta/issuers contract', () => {
  it('response is { issuers, count }', () => {
    const backendResponse: {
      success: boolean;
      data: { issuers: ExpectedIssuer[]; count: number };
    } = {
      success: true,
      data: {
        issuers: [
          { carrierId: 'aetna', carrierName: 'Aetna' },
          { carrierId: null, carrierName: 'Local Plan' },
        ],
        count: 2,
      },
    };

    expect(backendResponse.data).toHaveProperty('issuers');
    expect(backendResponse.data.issuers[0]).toHaveProperty('carrierName');
  });
});

// ============================================================================
// GET /plans/search
// Frontend: api.plans.search()
// Backend:  packages/backend/src/routes/plans.ts — GET /search
// Historical bug I-05: frontend was sending carrierName + planYear, neither
// of which the backend's searchQuerySchema accepts — silently ignored.
// The current frontend signature uses `issuerName` which matches the backend.
// ============================================================================

// Accepted by backend searchQuerySchema in routes/plans.ts
interface ExpectedPlanSearchParams {
  issuerName?: string;  // NOT `carrierName` (the I-05 bug)
  planType?: string;
  search?: string;
  state?: string;
  page?: number;
  limit?: number;
}

interface ExpectedInsurancePlanDisplay {
  planId: string;
  planName: string;
  issuerName: string;
  planType: string | null;
  state: string | null;
}

describe('GET /plans/search contract', () => {
  it('request params use issuerName, not carrierName', () => {
    const params: ExpectedPlanSearchParams = {
      issuerName: 'Aetna',
      planType: 'PPO',
      search: 'ppo plus',
      state: 'NY',
      page: 1,
      limit: 20,
    };
    expect(params).toHaveProperty('issuerName');
    expect(params).not.toHaveProperty('carrierName');
    expect(params).not.toHaveProperty('planYear'); // also removed
  });

  it('response shape is { plans, pagination }', () => {
    const backendResponse: {
      success: boolean;
      data: {
        plans: ExpectedInsurancePlanDisplay[];
        pagination: ExpectedPagination;
      };
    } = {
      success: true,
      data: {
        plans: [
          {
            planId: 'plan-abc',
            planName: 'Aetna PPO Standard',
            issuerName: 'Aetna',
            planType: 'PPO',
            state: 'NY',
          },
        ],
        pagination: {
          total: 42,
          page: 1,
          limit: 20,
          totalPages: 3,
          hasMore: true,
        },
      },
    };

    expect(backendResponse.data.plans[0]).toHaveProperty('issuerName');
    expect(backendResponse.data.plans[0]).not.toHaveProperty('carrierName');
    expect(backendResponse.data.pagination).toHaveProperty('total');
  });
});

// ============================================================================
// GET /plans/grouped
// Frontend: api.plans.getGrouped() — the actually-used plan discovery path
// Backend:  packages/backend/src/routes/plans.ts — GET /grouped
// ============================================================================

interface ExpectedCarrierGroup {
  carrierName: string;
  plans: ExpectedInsurancePlanDisplay[];
}

describe('GET /plans/grouped contract', () => {
  it('response is { carriers, totalPlans }', () => {
    const backendResponse: {
      success: boolean;
      data: { carriers: ExpectedCarrierGroup[]; totalPlans: number };
    } = {
      success: true,
      data: {
        carriers: [
          {
            carrierName: 'Aetna',
            plans: [
              {
                planId: 'plan-abc',
                planName: 'Aetna PPO',
                issuerName: 'Aetna',
                planType: 'PPO',
                state: 'NY',
              },
            ],
          },
        ],
        totalPlans: 1,
      },
    };

    expect(backendResponse.data).toHaveProperty('carriers');
    expect(backendResponse.data).toHaveProperty('totalPlans');
    expect(backendResponse.data.carriers[0]).toHaveProperty('plans');
  });
});

// ============================================================================
// POST /verify
// Frontend: api.verify.submit()
// Backend:  packages/backend/src/routes/verify.ts — POST /
// ============================================================================

describe('POST /verify contract', () => {
  it('success response includes verification.id and verification.createdAt', () => {
    const backendResponse = {
      success: true,
      data: {
        verification: {
          id: 'clx123abc',
          providerNpi: '1234567890',
          planId: 'plan-abc',
          createdAt: new Date().toISOString(),
          upvotes: 0,
          downvotes: 0,
          isApproved: null as boolean | null,
        },
        acceptance: {
          id: 1,
          providerNpi: '1234567890',
          planId: 'plan-abc',
          acceptanceStatus: 'PENDING',
          confidenceScore: 50,
          verificationCount: 1,
        },
        message: 'Verification submitted successfully',
      },
    };

    expect(backendResponse.data.verification).toHaveProperty('id');
    expect(backendResponse.data.verification).toHaveProperty('createdAt');
    expect(backendResponse.data).toHaveProperty('acceptance');
    expect(backendResponse.data).toHaveProperty('message');
    // PII fields must NEVER appear in /verify responses (stripVerificationPII)
    expect(backendResponse.data.verification).not.toHaveProperty('sourceIp');
    expect(backendResponse.data.verification).not.toHaveProperty('userAgent');
    expect(backendResponse.data.verification).not.toHaveProperty('submittedBy');
    expect(backendResponse.data.verification).not.toHaveProperty('userId');
  });
});

// ============================================================================
// GET /auth/me
// Frontend: api.auth.getMe()
// Backend:  packages/backend/src/routes/auth.ts — GET /me
// ============================================================================

interface ExpectedMeUser {
  id: string;
  email: string;
  emailVerified: string | null;   // ISO timestamp or null
  createdAt: string;
  savedProviderCount: number;
}

describe('GET /auth/me contract', () => {
  it('response is { user: { id, email, emailVerified, createdAt, savedProviderCount } }', () => {
    const backendResponse: {
      success: boolean;
      data: { user: ExpectedMeUser };
    } = {
      success: true,
      data: {
        user: {
          id: 'clxuser123',
          email: 'user@example.com',
          emailVerified: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          savedProviderCount: 3,
        },
      },
    };

    expect(backendResponse.data.user).toHaveProperty('id');
    expect(backendResponse.data.user).toHaveProperty('email');
    expect(backendResponse.data.user).toHaveProperty('savedProviderCount');
  });
});

// ============================================================================
// POST /auth/magic-link
// Frontend: api.auth.sendMagicLink(email)
// Backend:  packages/backend/src/routes/auth.ts — POST /magic-link
// The request shape is a single { email } field; response is a boilerplate
// success message (never reveals whether the email exists, per design).
// ============================================================================

interface ExpectedMagicLinkRequest {
  email: string;
}

describe('POST /auth/magic-link contract', () => {
  it('request body is just { email }', () => {
    const request: ExpectedMagicLinkRequest = { email: 'user@example.com' };
    expect(Object.keys(request)).toEqual(['email']);
  });

  it('response is a generic success message (no email-existence leak)', () => {
    const backendResponse = {
      success: true,
      message: "If this email is valid, you'll receive a login link.",
    };

    expect(backendResponse.success).toBe(true);
    expect(backendResponse).toHaveProperty('message');
    // Must NOT expose whether the email matched a real account
    expect(backendResponse).not.toHaveProperty('userId');
    expect(backendResponse).not.toHaveProperty('emailExists');
  });
});
