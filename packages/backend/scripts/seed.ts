import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Sample Florida providers with realistic data
const floridaProviders = [
  // Endocrinology
  {
    npi: '1234567890',
    entityType: 'INDIVIDUAL' as const,
    firstName: 'Maria',
    lastName: 'Rodriguez',
    credential: 'MD',
    addressLine1: '1234 Brickell Ave',
    addressLine2: 'Suite 500',
    city: 'Miami',
    state: 'FL',
    zip: '33131',
    phone: '305-555-0101',
    taxonomyCode: '207RE0101X',
    taxonomyDescription: 'Endocrinology, Diabetes & Metabolism',
    specialtyCategory: 'ENDOCRINOLOGY' as const,
  },
  {
    npi: '1234567891',
    entityType: 'INDIVIDUAL' as const,
    firstName: 'James',
    lastName: 'Chen',
    credential: 'DO',
    addressLine1: '5600 PGA Blvd',
    addressLine2: null,
    city: 'Palm Beach Gardens',
    state: 'FL',
    zip: '33418',
    phone: '561-555-0102',
    taxonomyCode: '207RE0101X',
    taxonomyDescription: 'Endocrinology, Diabetes & Metabolism',
    specialtyCategory: 'ENDOCRINOLOGY' as const,
  },
  {
    npi: '1234567892',
    entityType: 'INDIVIDUAL' as const,
    firstName: 'Sarah',
    lastName: 'Thompson',
    credential: 'MD, FACE',
    addressLine1: '4500 San Pablo Rd',
    city: 'Jacksonville',
    state: 'FL',
    zip: '32224',
    phone: '904-555-0103',
    taxonomyCode: '207RE0101X',
    taxonomyDescription: 'Endocrinology, Diabetes & Metabolism',
    specialtyCategory: 'ENDOCRINOLOGY' as const,
  },
  // Rheumatology
  {
    npi: '1234567893',
    entityType: 'INDIVIDUAL' as const,
    firstName: 'Robert',
    lastName: 'Martinez',
    credential: 'MD, FACP',
    addressLine1: '601 E Rollins St',
    city: 'Orlando',
    state: 'FL',
    zip: '32803',
    phone: '407-555-0104',
    taxonomyCode: '207RR0500X',
    taxonomyDescription: 'Rheumatology',
    specialtyCategory: 'RHEUMATOLOGY' as const,
  },
  {
    npi: '1234567894',
    entityType: 'INDIVIDUAL' as const,
    firstName: 'Jennifer',
    lastName: 'Williams',
    credential: 'MD',
    addressLine1: '2901 N Military Trail',
    addressLine2: 'Building 200',
    city: 'Boca Raton',
    state: 'FL',
    zip: '33431',
    phone: '561-555-0105',
    taxonomyCode: '207RR0500X',
    taxonomyDescription: 'Rheumatology',
    specialtyCategory: 'RHEUMATOLOGY' as const,
  },
  {
    npi: '1234567895',
    entityType: 'INDIVIDUAL' as const,
    firstName: 'Michael',
    lastName: 'Davis',
    credential: 'DO',
    addressLine1: '1 Tampa General Circle',
    city: 'Tampa',
    state: 'FL',
    zip: '33606',
    phone: '813-555-0106',
    taxonomyCode: '207RR0500X',
    taxonomyDescription: 'Rheumatology',
    specialtyCategory: 'RHEUMATOLOGY' as const,
  },
  // Orthopedics
  {
    npi: '1234567896',
    entityType: 'INDIVIDUAL' as const,
    firstName: 'David',
    lastName: 'Anderson',
    credential: 'MD, FAAOS',
    addressLine1: '3650 NW 82nd Ave',
    city: 'Doral',
    state: 'FL',
    zip: '33166',
    phone: '305-555-0107',
    taxonomyCode: '207X00000X',
    taxonomyDescription: 'Orthopaedic Surgery',
    specialtyCategory: 'ORTHOPEDICS' as const,
  },
  {
    npi: '1234567897',
    entityType: 'INDIVIDUAL' as const,
    firstName: 'Lisa',
    lastName: 'Brown',
    credential: 'MD',
    addressLine1: '800 N Magnolia Ave',
    city: 'Orlando',
    state: 'FL',
    zip: '32803',
    phone: '407-555-0108',
    taxonomyCode: '207XS0114X',
    taxonomyDescription: 'Orthopaedic Surgery - Adult Reconstructive',
    specialtyCategory: 'ORTHOPEDICS' as const,
  },
  {
    npi: '1234567898',
    entityType: 'INDIVIDUAL' as const,
    firstName: 'Christopher',
    lastName: 'Garcia',
    credential: 'MD',
    addressLine1: '500 University Blvd',
    city: 'Pensacola',
    state: 'FL',
    zip: '32504',
    phone: '850-555-0109',
    taxonomyCode: '207XX0004X',
    taxonomyDescription: 'Orthopaedic Surgery - Foot and Ankle',
    specialtyCategory: 'ORTHOPEDICS' as const,
  },
  // Internal Medicine
  {
    npi: '1234567899',
    entityType: 'INDIVIDUAL' as const,
    firstName: 'Patricia',
    lastName: 'Miller',
    credential: 'MD, FACP',
    addressLine1: '6550 N Federal Hwy',
    city: 'Fort Lauderdale',
    state: 'FL',
    zip: '33308',
    phone: '954-555-0110',
    taxonomyCode: '207R00000X',
    taxonomyDescription: 'Internal Medicine',
    specialtyCategory: 'INTERNAL_MEDICINE' as const,
  },
  {
    npi: '1234567900',
    entityType: 'INDIVIDUAL' as const,
    firstName: 'William',
    lastName: 'Wilson',
    credential: 'DO',
    addressLine1: '2800 S Seacrest Blvd',
    city: 'Boynton Beach',
    state: 'FL',
    zip: '33435',
    phone: '561-555-0111',
    taxonomyCode: '207R00000X',
    taxonomyDescription: 'Internal Medicine',
    specialtyCategory: 'INTERNAL_MEDICINE' as const,
  },
  {
    npi: '1234567901',
    entityType: 'INDIVIDUAL' as const,
    firstName: 'Elizabeth',
    lastName: 'Taylor',
    credential: 'MD',
    addressLine1: '1800 E Las Olas Blvd',
    city: 'Fort Lauderdale',
    state: 'FL',
    zip: '33301',
    phone: '954-555-0112',
    taxonomyCode: '207RI0200X',
    taxonomyDescription: 'Internal Medicine - Geriatric Medicine',
    specialtyCategory: 'INTERNAL_MEDICINE' as const,
  },
  // Family Medicine
  {
    npi: '1234567902',
    entityType: 'INDIVIDUAL' as const,
    firstName: 'Daniel',
    lastName: 'Moore',
    credential: 'MD',
    addressLine1: '3100 SW 62nd Ave',
    city: 'Miami',
    state: 'FL',
    zip: '33155',
    phone: '305-555-0113',
    taxonomyCode: '207Q00000X',
    taxonomyDescription: 'Family Medicine',
    specialtyCategory: 'FAMILY_MEDICINE' as const,
  },
  {
    npi: '1234567903',
    entityType: 'INDIVIDUAL' as const,
    firstName: 'Nancy',
    lastName: 'Jackson',
    credential: 'DO',
    addressLine1: '9000 Southside Blvd',
    city: 'Jacksonville',
    state: 'FL',
    zip: '32256',
    phone: '904-555-0114',
    taxonomyCode: '207Q00000X',
    taxonomyDescription: 'Family Medicine',
    specialtyCategory: 'FAMILY_MEDICINE' as const,
  },
  {
    npi: '1234567904',
    entityType: 'INDIVIDUAL' as const,
    firstName: 'Thomas',
    lastName: 'White',
    credential: 'MD',
    addressLine1: '1350 E Venice Ave',
    city: 'Venice',
    state: 'FL',
    zip: '34292',
    phone: '941-555-0115',
    taxonomyCode: '207QA0505X',
    taxonomyDescription: 'Family Medicine - Adult Medicine',
    specialtyCategory: 'FAMILY_MEDICINE' as const,
  },
  // Geriatrics
  {
    npi: '1234567905',
    entityType: 'INDIVIDUAL' as const,
    firstName: 'Karen',
    lastName: 'Harris',
    credential: 'MD, CMD',
    addressLine1: '4770 Biscayne Blvd',
    city: 'Miami',
    state: 'FL',
    zip: '33137',
    phone: '305-555-0116',
    taxonomyCode: '207QG0300X',
    taxonomyDescription: 'Family Medicine - Geriatric Medicine',
    specialtyCategory: 'GERIATRICS' as const,
  },
  {
    npi: '1234567906',
    entityType: 'INDIVIDUAL' as const,
    firstName: 'Steven',
    lastName: 'Martin',
    credential: 'DO',
    addressLine1: '12901 Bruce B Downs Blvd',
    city: 'Tampa',
    state: 'FL',
    zip: '33612',
    phone: '813-555-0117',
    taxonomyCode: '207RG0300X',
    taxonomyDescription: 'Internal Medicine - Geriatric Medicine',
    specialtyCategory: 'GERIATRICS' as const,
  },
  // Organizations
  {
    npi: '1234567907',
    entityType: 'ORGANIZATION' as const,
    organizationName: 'Florida Bone & Joint Specialists',
    addressLine1: '7800 SW 87th Ave',
    addressLine2: 'Suite 200',
    city: 'Miami',
    state: 'FL',
    zip: '33173',
    phone: '305-555-0118',
    taxonomyCode: '207X00000X',
    taxonomyDescription: 'Orthopaedic Surgery',
    specialtyCategory: 'ORTHOPEDICS' as const,
  },
  {
    npi: '1234567908',
    entityType: 'ORGANIZATION' as const,
    organizationName: 'Tampa Bay Rheumatology Center',
    addressLine1: '3000 Medical Park Dr',
    city: 'Tampa',
    state: 'FL',
    zip: '33613',
    phone: '813-555-0119',
    taxonomyCode: '207RR0500X',
    taxonomyDescription: 'Rheumatology',
    specialtyCategory: 'RHEUMATOLOGY' as const,
  },
  {
    npi: '1234567909',
    entityType: 'ORGANIZATION' as const,
    organizationName: 'Jacksonville Endocrine Associates',
    addressLine1: '836 Prudential Dr',
    addressLine2: 'Suite 1500',
    city: 'Jacksonville',
    state: 'FL',
    zip: '32207',
    phone: '904-555-0120',
    taxonomyCode: '207RE0101X',
    taxonomyDescription: 'Endocrinology, Diabetes & Metabolism',
    specialtyCategory: 'ENDOCRINOLOGY' as const,
  },
];

// Sample insurance plans
const insurancePlans = [
  {
    planId: 'FLBCBS-PPO-2024',
    planName: 'Florida Blue PPO',
    carrierId: 'FLBCBS',
    carrierName: 'Florida Blue',
    planType: 'PPO' as const,
    metalLevel: 'GOLD' as const,
    marketType: 'INDIVIDUAL' as const,
    statesCovered: ['FL'],
    planYear: 2024,
    dataSource: 'CMS_PLAN_FINDER' as const,
  },
  {
    planId: 'FLBCBS-HMO-2024',
    planName: 'Florida Blue HMO',
    carrierId: 'FLBCBS',
    carrierName: 'Florida Blue',
    planType: 'HMO' as const,
    metalLevel: 'SILVER' as const,
    marketType: 'INDIVIDUAL' as const,
    statesCovered: ['FL'],
    planYear: 2024,
    dataSource: 'CMS_PLAN_FINDER' as const,
  },
  {
    planId: 'UHC-PPO-FL-2024',
    planName: 'UnitedHealthcare Choice Plus',
    carrierId: 'UHC',
    carrierName: 'UnitedHealthcare',
    planType: 'PPO' as const,
    metalLevel: 'GOLD' as const,
    marketType: 'INDIVIDUAL' as const,
    statesCovered: ['FL'],
    planYear: 2024,
    dataSource: 'CMS_PLAN_FINDER' as const,
  },
  {
    planId: 'AETNA-PPO-FL-2024',
    planName: 'Aetna Open Access',
    carrierId: 'AETNA',
    carrierName: 'Aetna',
    planType: 'PPO' as const,
    metalLevel: 'SILVER' as const,
    marketType: 'INDIVIDUAL' as const,
    statesCovered: ['FL'],
    planYear: 2024,
    dataSource: 'CMS_PLAN_FINDER' as const,
  },
  {
    planId: 'CIGNA-HMO-FL-2024',
    planName: 'Cigna Connect',
    carrierId: 'CIGNA',
    carrierName: 'Cigna',
    planType: 'HMO' as const,
    metalLevel: 'BRONZE' as const,
    marketType: 'INDIVIDUAL' as const,
    statesCovered: ['FL'],
    planYear: 2024,
    dataSource: 'CMS_PLAN_FINDER' as const,
  },
];

async function seed() {
  console.log('🌱 Starting database seed...\n');

  // Clear existing data
  console.log('Clearing existing data...');
  await prisma.verificationLog.deleteMany();
  await prisma.providerPlanAcceptance.deleteMany();
  await prisma.insurancePlan.deleteMany();
  await prisma.provider.deleteMany();
  await prisma.syncLog.deleteMany();
  console.log('✓ Existing data cleared\n');

  // Insert providers
  console.log('Inserting providers...');
  const createdProviders = await Promise.all(
    floridaProviders.map((provider) =>
      prisma.provider.create({
        data: {
          ...provider,
          npiStatus: 'ACTIVE',
          enumerationDate: new Date('2015-01-15'),
          lastUpdateDate: new Date('2024-01-01'),
        },
      })
    )
  );
  console.log(`✓ Created ${createdProviders.length} providers\n`);

  // Insert plans
  console.log('Inserting insurance plans...');
  const createdPlans = await Promise.all(
    insurancePlans.map((plan) =>
      prisma.insurancePlan.create({
        data: {
          ...plan,
          isActive: true,
          effectiveDate: new Date('2024-01-01'),
        },
      })
    )
  );
  console.log(`✓ Created ${createdPlans.length} insurance plans\n`);

  // Create provider-plan acceptances with varying confidence scores
  console.log('Creating provider-plan acceptance records...');
  const acceptances = [];

  for (const provider of createdProviders) {
    // Each provider accepts 2-4 random plans
    const numPlans = Math.floor(Math.random() * 3) + 2;
    const shuffledPlans = [...createdPlans].sort(() => Math.random() - 0.5);
    const selectedPlans = shuffledPlans.slice(0, numPlans);

    for (const plan of selectedPlans) {
      // Generate realistic confidence scores
      const verificationCount = Math.floor(Math.random() * 5);
      const dataSourceScore = 25 + Math.random() * 5; // 25-30
      const recencyScore = 15 + Math.random() * 10; // 15-25
      const verificationScore = verificationCount * 5; // 0-25
      const agreementScore = verificationCount > 0 ? 10 + Math.random() * 10 : 0; // 0-20

      const confidenceScore = Math.min(
        100,
        dataSourceScore + recencyScore + verificationScore + agreementScore
      );

      acceptances.push(
        prisma.providerPlanAcceptance.create({
          data: {
            providerId: provider.id,
            planId: plan.id,
            acceptanceStatus: 'ACCEPTED',
            acceptsNewPatients: Math.random() > 0.2, // 80% accepting new patients
            confidenceScore: Math.round(confidenceScore * 100) / 100,
            confidenceFactors: {
              dataSourceScore: Math.round(dataSourceScore * 100) / 100,
              recencyScore: Math.round(recencyScore * 100) / 100,
              verificationScore: Math.round(verificationScore * 100) / 100,
              agreementScore: Math.round(agreementScore * 100) / 100,
            },
            verificationCount,
            lastVerifiedAt: new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000), // 0-90 days ago
            verificationSource: 'CMS_DATA',
          },
        })
      );
    }
  }

  const createdAcceptances = await Promise.all(acceptances);
  console.log(`✓ Created ${createdAcceptances.length} provider-plan acceptances\n`);

  // Create sample verifications
  console.log('Creating sample verifications...');
  const sampleVerifications = [
    {
      providerId: createdProviders[0].id,
      planId: createdPlans[0].id,
      verificationType: 'PLAN_ACCEPTANCE' as const,
      verificationSource: 'CROWDSOURCE' as const,
      newValue: { acceptanceStatus: 'ACCEPTED', acceptsNewPatients: true },
      notes: 'Called office and confirmed they accept Florida Blue PPO',
      upvotes: 5,
      downvotes: 0,
      isApproved: true,
      submittedBy: 'user@example.com',
    },
    {
      providerId: createdProviders[3].id,
      planId: createdPlans[2].id,
      verificationType: 'PLAN_ACCEPTANCE' as const,
      verificationSource: 'PHONE_CALL' as const,
      newValue: { acceptanceStatus: 'ACCEPTED', acceptsNewPatients: true },
      notes: 'Verified via phone call on 12/15/2024',
      upvotes: 3,
      downvotes: 1,
      isApproved: true,
      submittedBy: 'another@example.com',
    },
    {
      providerId: createdProviders[5].id,
      planId: createdPlans[1].id,
      verificationType: 'PLAN_ACCEPTANCE' as const,
      verificationSource: 'CROWDSOURCE' as const,
      newValue: { acceptanceStatus: 'NOT_ACCEPTED' },
      notes: 'No longer accepting this plan as of January 2024',
      upvotes: 2,
      downvotes: 0,
      isApproved: null, // Pending review
      submittedBy: 'patient@example.com',
    },
    {
      providerId: createdProviders[10].id,
      planId: createdPlans[3].id,
      verificationType: 'PLAN_ACCEPTANCE' as const,
      verificationSource: 'PROVIDER_PORTAL' as const,
      newValue: { acceptanceStatus: 'ACCEPTED', acceptsNewPatients: false },
      notes: 'Accepts insurance but currently not accepting new patients',
      upvotes: 4,
      downvotes: 0,
      isApproved: true,
    },
  ];

  const createdVerifications = await Promise.all(
    sampleVerifications.map((v) =>
      prisma.verificationLog.create({
        data: {
          ...v,
          newValue: v.newValue as any,
        },
      })
    )
  );
  console.log(`✓ Created ${createdVerifications.length} sample verifications\n`);

  // Create sync log entry
  await prisma.syncLog.create({
    data: {
      syncType: 'NPI_FULL',
      dataSource: 'CMS_NPPES',
      status: 'COMPLETED',
      totalRecords: floridaProviders.length,
      processedRecords: floridaProviders.length,
      insertedRecords: floridaProviders.length,
      updatedRecords: 0,
      skippedRecords: 0,
      errorRecords: 0,
      filterCriteria: { states: ['FL'] },
      completedAt: new Date(),
      triggeredBy: 'seed-script',
      notes: 'Initial seed data',
    },
  });
  console.log('✓ Created sync log entry\n');

  console.log('🎉 Database seed completed successfully!');
  console.log('\nSummary:');
  console.log(`  - ${createdProviders.length} providers`);
  console.log(`  - ${createdPlans.length} insurance plans`);
  console.log(`  - ${createdAcceptances.length} provider-plan acceptances`);
  console.log(`  - ${createdVerifications.length} verifications`);
}

seed()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
