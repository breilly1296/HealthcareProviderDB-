import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('='.repeat(60));
  console.log('Health System Analysis for NYC Providers');
  console.log('='.repeat(60));
  console.log();

  // Query 1: Locations with health systems
  console.log('1. Locations labeled with health systems:');
  console.log('-'.repeat(60));

  const locationsByHealthSystem = await prisma.$queryRaw<Array<{ health_system: string; location_count: bigint }>>`
    SELECT health_system, COUNT(*) as location_count
    FROM locations
    WHERE health_system IS NOT NULL
    GROUP BY health_system
    ORDER BY location_count DESC
  `;

  if (locationsByHealthSystem.length === 0) {
    console.log('  No locations have health_system labels yet.');
  } else {
    for (const row of locationsByHealthSystem) {
      console.log(`  ${row.health_system}: ${row.location_count} locations`);
    }
  }
  console.log();

  // Query 2: Providers at labeled locations
  console.log('2. Providers at health system locations:');
  console.log('-'.repeat(60));

  const providersByHealthSystem = await prisma.$queryRaw<Array<{ health_system: string; provider_count: bigint }>>`
    SELECT l.health_system, COUNT(DISTINCT p.npi) as provider_count
    FROM providers p
    JOIN locations l ON p.location_id = l.id
    WHERE l.health_system IS NOT NULL
    GROUP BY l.health_system
    ORDER BY provider_count DESC
  `;

  if (providersByHealthSystem.length === 0) {
    console.log('  No providers are at health system locations yet.');
  } else {
    let totalTagged = 0n;
    for (const row of providersByHealthSystem) {
      console.log(`  ${row.health_system}: ${row.provider_count} providers`);
      totalTagged += row.provider_count;
    }
    console.log('-'.repeat(60));
    console.log(`  TOTAL providers at labeled locations: ${totalTagged}`);
  }
  console.log();

  // Query 3: Total providers in NY
  console.log('3. Total providers in NY (for context):');
  console.log('-'.repeat(60));

  const [{ count: nyCount }] = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*) as count FROM providers WHERE state = 'NY'
  `;
  console.log(`  Total NY providers: ${nyCount}`);
  console.log();

  // Query 4: NYC specifically (5 boroughs)
  console.log('4. NYC providers (5 boroughs):');
  console.log('-'.repeat(60));

  const nycCities = ['NEW YORK', 'BROOKLYN', 'BRONX', 'QUEENS', 'STATEN ISLAND'];
  const [{ count: nycCount }] = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*) as count
    FROM providers
    WHERE state = 'NY'
    AND UPPER(city) IN ('NEW YORK', 'BROOKLYN', 'BRONX', 'QUEENS', 'STATEN ISLAND')
  `;
  console.log(`  Total NYC providers: ${nycCount}`);
  console.log();

  // Query 5: Top locations by provider count (to identify unlabeled health systems)
  console.log('5. Top 20 locations by provider count (for health system labeling):');
  console.log('-'.repeat(60));

  const topLocations = await prisma.$queryRaw<Array<{
    id: number;
    name: string | null;
    health_system: string | null;
    address_line1: string;
    city: string;
    state: string;
    provider_count: number;
  }>>`
    SELECT id, name, health_system, address_line1, city, state, provider_count
    FROM locations
    WHERE state = 'NY'
    ORDER BY provider_count DESC
    LIMIT 20
  `;

  for (const loc of topLocations) {
    const label = loc.health_system ? `[${loc.health_system}]` : '[UNLABELED]';
    const name = loc.name || loc.address_line1;
    console.log(`  ${label} ${name}, ${loc.city} - ${loc.provider_count} providers`);
  }
  console.log();

  // Calculate percentages
  if (providersByHealthSystem.length > 0) {
    console.log('='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));

    let totalTagged = 0n;
    for (const row of providersByHealthSystem) {
      totalTagged += row.provider_count;
    }

    const nyPercent = Number(totalTagged) / Number(nyCount) * 100;
    const nycPercent = Number(totalTagged) / Number(nycCount) * 100;

    console.log(`  Providers with health system labels: ${totalTagged}`);
    console.log(`  % of NY state providers: ${nyPercent.toFixed(1)}%`);
    console.log(`  % of NYC providers: ${nycPercent.toFixed(1)}%`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
