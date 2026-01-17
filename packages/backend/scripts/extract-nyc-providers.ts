import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

// NYC ZIP code prefixes
const NYC_ZIP_PREFIXES = [
  '100', '101', '102', '103', '104', // Manhattan, Bronx
  '110', '111', '112', '113', '114', '116', // Queens, Brooklyn, Staten Island
];

function isNycZip(zipCode: string): boolean {
  const zip5 = zipCode.slice(0, 5);
  return NYC_ZIP_PREFIXES.some(prefix => zip5.startsWith(prefix));
}

function getProviderName(provider: {
  entityType: string;
  firstName: string | null;
  lastName: string | null;
  credential: string | null;
  organizationName: string | null;
}): string {
  if (provider.entityType === 'ORGANIZATION') {
    return provider.organizationName || 'Unknown Organization';
  }
  const parts = [provider.firstName, provider.lastName].filter(Boolean);
  const name = parts.join(' ') || 'Unknown Provider';
  return provider.credential ? `${name}, ${provider.credential}` : name;
}

function sanitizeCsvField(value: string | null | undefined): string {
  if (!value) return '';
  // Escape quotes and wrap in quotes if contains comma, quote, or newline
  const escaped = value.replace(/"/g, '""');
  if (escaped.includes(',') || escaped.includes('"') || escaped.includes('\n')) {
    return `"${escaped}"`;
  }
  return escaped;
}

function sanitizeFilename(specialty: string): string {
  return specialty
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100);
}

async function main() {
  console.log('='.repeat(70));
  console.log('NYC Provider Extraction by Specialty');
  console.log('='.repeat(70));
  console.log();

  // Create output directory
  const outputDir = path.join(__dirname, '..', '..', '..', 'scripts', 'nyc-providers');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    console.log(`Created output directory: ${outputDir}`);
  }

  // Build ZIP code filter using OR conditions for each prefix
  const zipConditions = NYC_ZIP_PREFIXES.map(prefix => ({
    zipCode: { startsWith: prefix },
  }));

  console.log('Querying NYC providers...');
  const providers = await prisma.provider.findMany({
    where: {
      OR: zipConditions,
    },
    select: {
      npi: true,
      entityType: true,
      firstName: true,
      lastName: true,
      credential: true,
      organizationName: true,
      specialty: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      state: true,
      zipCode: true,
    },
    orderBy: [
      { specialty: 'asc' },
      { lastName: 'asc' },
    ],
  });

  console.log(`Found ${providers.length.toLocaleString()} NYC providers`);
  console.log();

  // Group by specialty
  const bySpecialty = new Map<string, typeof providers>();
  for (const provider of providers) {
    const specialty = provider.specialty || 'Unknown';
    if (!bySpecialty.has(specialty)) {
      bySpecialty.set(specialty, []);
    }
    bySpecialty.get(specialty)!.push(provider);
  }

  console.log(`Found ${bySpecialty.size} unique specialties`);
  console.log();

  // Write CSV files
  const header = 'NPI,Provider Name,Specialty,Address,City,State,ZIP';
  let totalWritten = 0;

  const specialties = Array.from(bySpecialty.keys()).sort();

  console.log('Writing CSV files...');
  console.log('-'.repeat(70));

  for (const specialty of specialties) {
    const specProviders = bySpecialty.get(specialty)!;
    const filename = `${sanitizeFilename(specialty)}.csv`;
    const filepath = path.join(outputDir, filename);

    const lines = [header];
    for (const p of specProviders) {
      const name = getProviderName(p);
      const address = [p.addressLine1, p.addressLine2].filter(Boolean).join(' ');

      lines.push([
        sanitizeCsvField(p.npi),
        sanitizeCsvField(name),
        sanitizeCsvField(p.specialty),
        sanitizeCsvField(address),
        sanitizeCsvField(p.city),
        sanitizeCsvField(p.state),
        sanitizeCsvField(p.zipCode),
      ].join(','));
    }

    fs.writeFileSync(filepath, lines.join('\n'), 'utf-8');
    totalWritten += specProviders.length;

    if (specProviders.length >= 100) {
      console.log(`  ${filename}: ${specProviders.length.toLocaleString()} providers`);
    }
  }

  console.log();
  console.log('='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));
  console.log(`  Total providers exported: ${totalWritten.toLocaleString()}`);
  console.log(`  CSV files created: ${specialties.length}`);
  console.log(`  Output directory: ${outputDir}`);
  console.log();

  // Show top 20 specialties by count
  console.log('Top 20 specialties by provider count:');
  console.log('-'.repeat(70));
  const sortedByCount = Array.from(bySpecialty.entries())
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 20);

  for (const [specialty, specProviders] of sortedByCount) {
    console.log(`  ${specProviders.length.toLocaleString().padStart(6)} - ${specialty}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
