/**
 * Lightweight mock API server for E2E tests.
 *
 * Serves canned responses on port 3001 so that Playwright tests
 * don't require the real backend.  Handles:
 *
 *   GET  /api/v1/providers/search   — returns mock NY providers
 *   GET  /api/v1/providers/cities   — returns mock city list
 *   GET  /api/v1/providers/:npi     — returns a single provider
 *   GET  /health                    — health check
 *
 * Started automatically by playwright.config.ts as a second webServer.
 */

import { createServer } from 'node:http';

const PORT = 3001;

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockProviders = [
  {
    id: '1234567890',
    npi: '1234567890',
    entityType: 'INDIVIDUAL',
    firstName: 'Alice',
    lastName: 'Smith',
    middleName: null,
    namePrefix: 'Dr.',
    nameSuffix: null,
    credential: 'MD',
    organizationName: null,
    gender: 'F',
    addressLine1: '123 Main St',
    addressLine2: null,
    city: 'New York',
    state: 'NY',
    zip: '10001',
    phone: '2125551234',
    fax: null,
    taxonomyCode: '207R00000X',
    taxonomyDescription: 'Internal Medicine',
    specialtyCategory: 'Primary Care',
    npiStatus: 'ACTIVE',
    displayName: 'Alice Smith',
    cmsDetails: null,
    hospitals: [],
    insuranceNetworks: [],
    medicareIds: [],
    taxonomies: [],
    locations: [
      {
        id: 1,
        address_type: 'DOM',
        address_line1: '123 Main St',
        address_line2: null,
        city: 'New York',
        state: 'NY',
        zip_code: '10001',
        phone: '2125551234',
        fax: null,
      },
    ],
    nppesLastSynced: new Date().toISOString(),
    planAcceptances: [],
    confidenceScore: 85,
  },
  {
    id: '9876543210',
    npi: '9876543210',
    entityType: 'INDIVIDUAL',
    firstName: 'Bob',
    lastName: 'Jones',
    middleName: null,
    namePrefix: 'Dr.',
    nameSuffix: null,
    credential: 'DO',
    organizationName: null,
    gender: 'M',
    addressLine1: '456 Oak Ave',
    addressLine2: 'Suite 200',
    city: 'Brooklyn',
    state: 'NY',
    zip: '11201',
    phone: '7185559876',
    fax: null,
    taxonomyCode: '208D00000X',
    taxonomyDescription: 'Family Medicine',
    specialtyCategory: 'Primary Care',
    npiStatus: 'ACTIVE',
    displayName: 'Bob Jones',
    cmsDetails: null,
    hospitals: [],
    insuranceNetworks: [],
    medicareIds: [],
    taxonomies: [],
    locations: [
      {
        id: 2,
        address_type: 'DOM',
        address_line1: '456 Oak Ave',
        address_line2: 'Suite 200',
        city: 'Brooklyn',
        state: 'NY',
        zip_code: '11201',
        phone: '7185559876',
        fax: null,
      },
    ],
    nppesLastSynced: new Date().toISOString(),
    planAcceptances: [],
    confidenceScore: 72,
  },
];

const mockCities = ['New York', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Secret');
}

function json(res, status, body) {
  cors(res);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  // Strip /api/v1 prefix so routes work whether the client sends it or not
  const rawPath = url.pathname;
  const path = rawPath.replace(/^\/api\/v1/, '') || '/';

  // CORS preflight
  if (req.method === 'OPTIONS') {
    cors(res);
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check (matches /health and /api/v1/health)
  if (rawPath === '/health' || path === '/health') {
    json(res, 200, { status: 'ok' });
    return;
  }

  // Provider search
  if (path === '/providers/search' && req.method === 'GET') {
    const state = url.searchParams.get('state');
    const specialty = url.searchParams.get('specialty');
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const limit = parseInt(url.searchParams.get('limit') || '20', 10);

    let filtered = mockProviders;
    if (state) {
      filtered = filtered.filter((p) => p.state === state);
    }
    if (specialty) {
      filtered = filtered.filter(
        (p) =>
          p.taxonomyDescription?.toLowerCase().includes(specialty.toLowerCase()) ||
          p.specialtyCategory?.toLowerCase().includes(specialty.toLowerCase()),
      );
    }

    json(res, 200, {
      success: true,
      data: {
        providers: filtered,
        pagination: {
          total: filtered.length,
          page,
          limit,
          totalPages: Math.ceil(filtered.length / limit) || 1,
          hasMore: false,
        },
      },
    });
    return;
  }

  // Cities
  if (path === '/providers/cities' && req.method === 'GET') {
    const state = url.searchParams.get('state') || 'NY';
    json(res, 200, {
      success: true,
      data: { state, cities: mockCities, count: mockCities.length },
    });
    return;
  }

  // Provider detail
  const npiMatch = path.match(/^\/providers\/(\d{10})$/);
  if (npiMatch && req.method === 'GET') {
    const npi = npiMatch[1];
    const provider = mockProviders.find((p) => p.npi === npi);

    if (provider) {
      json(res, 200, {
        success: true,
        data: { provider },
      });
    } else {
      json(res, 404, {
        success: false,
        error: { message: `Provider with NPI ${npi} not found`, code: 'NOT_FOUND', statusCode: 404 },
      });
    }
    return;
  }

  // Provider plans
  const plansMatch = path.match(/^\/providers\/(\d{10})\/plans$/);
  if (plansMatch && req.method === 'GET') {
    json(res, 200, {
      success: true,
      data: {
        npi: plansMatch[1],
        acceptances: [],
        pagination: { total: 0, page: 1, limit: 20, totalPages: 0, hasMore: false },
      },
    });
    return;
  }

  // Fallback 404
  json(res, 404, { success: false, error: { message: 'Not found', code: 'NOT_FOUND', statusCode: 404 } });
});

server.listen(PORT, () => {
  console.log(`Mock API server listening on http://localhost:${PORT}`);
});
