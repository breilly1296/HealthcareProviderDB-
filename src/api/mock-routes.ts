/**
 * Mock API Routes - For demo without database
 */

import { Router, Request, Response } from 'express';

const router = Router();

// Mock provider data
const MOCK_PROVIDERS = [
  {
    id: '1',
    npi: '1234567890',
    entityType: 'INDIVIDUAL',
    firstName: 'Sarah',
    lastName: 'Johnson',
    credential: 'MD',
    organizationName: null,
    addressLine1: '123 Medical Center Dr',
    city: 'Miami',
    state: 'FL',
    zip: '33101',
    phone: '3055551234',
    specialty: 'endocrinology',
    specialtyCategory: 'ENDOCRINOLOGY',
    verificationCount: 5,
  },
  {
    id: '2',
    npi: '1234567891',
    entityType: 'INDIVIDUAL',
    firstName: 'Michael',
    lastName: 'Chen',
    credential: 'DO',
    organizationName: null,
    addressLine1: '456 Healthcare Blvd',
    city: 'Orlando',
    state: 'FL',
    zip: '32801',
    phone: '4075552345',
    specialty: 'rheumatology',
    specialtyCategory: 'RHEUMATOLOGY',
    verificationCount: 12,
  },
  {
    id: '3',
    npi: '1234567892',
    entityType: 'ORGANIZATION',
    firstName: null,
    lastName: null,
    credential: null,
    organizationName: 'Tampa Orthopedic Associates',
    addressLine1: '789 Bone & Joint Way',
    city: 'Tampa',
    state: 'FL',
    zip: '33602',
    phone: '8135553456',
    specialty: 'orthopedics',
    specialtyCategory: 'ORTHOPEDICS',
    verificationCount: 0,
  },
  {
    id: '4',
    npi: '1234567893',
    entityType: 'INDIVIDUAL',
    firstName: 'Emily',
    lastName: 'Rodriguez',
    credential: 'MD, FACP',
    organizationName: null,
    addressLine1: '321 Internal Medicine Pl',
    city: 'Jacksonville',
    state: 'FL',
    zip: '32202',
    phone: '9045554567',
    specialty: 'internal_medicine',
    specialtyCategory: 'INTERNAL_MEDICINE',
    verificationCount: 8,
  },
  {
    id: '5',
    npi: '1234567894',
    entityType: 'INDIVIDUAL',
    firstName: 'Robert',
    lastName: 'Williams',
    credential: 'MD',
    organizationName: null,
    addressLine1: '555 Family Care Ave',
    city: 'Fort Lauderdale',
    state: 'FL',
    zip: '33301',
    phone: '9545555678',
    specialty: 'family_medicine',
    specialtyCategory: 'FAMILY_MEDICINE',
    verificationCount: 3,
  },
  {
    id: '6',
    npi: '1234567895',
    entityType: 'INDIVIDUAL',
    firstName: 'Patricia',
    lastName: 'Martinez',
    credential: 'MD',
    organizationName: null,
    addressLine1: '777 Senior Health Dr',
    city: 'Boca Raton',
    state: 'FL',
    zip: '33431',
    phone: '5615556789',
    specialty: 'geriatrics',
    specialtyCategory: 'GERIATRICS',
    verificationCount: 15,
  },
  {
    id: '7',
    npi: '1234567896',
    entityType: 'INDIVIDUAL',
    firstName: 'David',
    lastName: 'Thompson',
    credential: 'MD, PhD',
    organizationName: null,
    addressLine1: '888 Endocrine Center',
    city: 'Miami Beach',
    state: 'FL',
    zip: '33139',
    phone: '3055557890',
    specialty: 'endocrinology',
    specialtyCategory: 'ENDOCRINOLOGY',
    verificationCount: 22,
  },
  {
    id: '8',
    npi: '1234567897',
    entityType: 'ORGANIZATION',
    firstName: null,
    lastName: null,
    credential: null,
    organizationName: 'Palm Beach Rheumatology Group',
    addressLine1: '999 Arthritis Care Ln',
    city: 'West Palm Beach',
    state: 'FL',
    zip: '33401',
    phone: '5615558901',
    specialty: 'rheumatology',
    specialtyCategory: 'RHEUMATOLOGY',
    verificationCount: 7,
  },
];

/**
 * GET /providers
 */
router.get('/providers', (req: Request, res: Response) => {
  const { specialty, zip, state, name } = req.query;
  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

  let filtered = [...MOCK_PROVIDERS];

  // Filter by specialty
  if (specialty) {
    filtered = filtered.filter(p =>
      p.specialty === specialty ||
      p.specialtyCategory === (specialty as string).toUpperCase()
    );
  }

  // Filter by zip (prefix match)
  if (zip) {
    const zipPrefix = (zip as string).substring(0, 3);
    filtered = filtered.filter(p => p.zip.startsWith(zipPrefix));
  }

  // Filter by state
  if (state) {
    filtered = filtered.filter(p => p.state === (state as string).toUpperCase());
  }

  // Filter by name
  if (name) {
    const searchName = (name as string).toLowerCase();
    filtered = filtered.filter(p =>
      (p.firstName?.toLowerCase().includes(searchName)) ||
      (p.lastName?.toLowerCase().includes(searchName)) ||
      (p.organizationName?.toLowerCase().includes(searchName))
    );
  }

  const skip = (page - 1) * limit;
  const paginated = filtered.slice(skip, skip + limit);

  res.json({
    providers: paginated,
    pagination: {
      page,
      limit,
      total: filtered.length,
      totalPages: Math.ceil(filtered.length / limit),
    },
  });
});

/**
 * GET /providers/:npi
 */
router.get('/providers/:npi', (req: Request, res: Response) => {
  const { npi } = req.params;
  const provider = MOCK_PROVIDERS.find(p => p.npi === npi);

  if (!provider) {
    res.status(404).json({ error: 'Provider not found' });
    return;
  }

  res.json(provider);
});

/**
 * POST /providers/:npi/verify
 */
router.post('/providers/:npi/verify', (req: Request, res: Response) => {
  const { npi } = req.params;
  const { acceptsInsurance } = req.body;

  const provider = MOCK_PROVIDERS.find(p => p.npi === npi);

  if (!provider) {
    res.status(404).json({ error: 'Provider not found' });
    return;
  }

  // In mock mode, just acknowledge the verification
  provider.verificationCount += 1;

  res.status(201).json({
    message: 'Verification submitted successfully',
    verification: {
      id: `mock-${Date.now()}`,
      status: acceptsInsurance ? 'ACCEPTED' : 'NOT_ACCEPTED',
      verificationCount: provider.verificationCount,
      submittedAt: new Date().toISOString(),
    },
  });
});

/**
 * GET /health
 */
router.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    database: 'mock-mode',
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /stats
 */
router.get('/stats', (_req: Request, res: Response) => {
  res.json({
    providers: MOCK_PROVIDERS.length,
    insurancePlans: 0,
    planAcceptances: 0,
    verifications: MOCK_PROVIDERS.reduce((sum, p) => sum + p.verificationCount, 0),
    bySpecialty: {
      ENDOCRINOLOGY: 2,
      RHEUMATOLOGY: 2,
      ORTHOPEDICS: 1,
      INTERNAL_MEDICINE: 1,
      FAMILY_MEDICINE: 1,
      GERIATRICS: 1,
    },
    mode: 'DEMO - Using mock data',
  });
});

export default router;
