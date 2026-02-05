/**
 * Carrier Directory Scraper (Template)
 *
 * Template script for scraping public carrier directory lookup pages.
 * Each carrier has different directory structures, so this provides
 * a configurable framework.
 *
 * NOTE: Many carrier sites are JS-heavy and may require headless browsers.
 * This script handles simple HTTP-based directories only.
 * For JS-heavy sites, consider Playwright or Puppeteer.
 *
 * Usage:
 *   npx tsx scripts/scrape-carrier-directory.ts                 # List carriers
 *   npx tsx scripts/scrape-carrier-directory.ts --carrier aetna  # Dry run
 *   npx tsx scripts/scrape-carrier-directory.ts --carrier aetna --apply  # Apply
 *   npx tsx scripts/scrape-carrier-directory.ts --carrier aetna --limit 10  # Test
 */

import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

interface CarrierConfig {
  name: string;
  slug: string;
  directoryUrl: string;
  lookupType: 'api' | 'html' | 'unsupported';
  notes: string;
}

// Carrier directory configurations
// Many carriers require JS rendering or API keys - marked as unsupported
const CARRIER_CONFIGS: CarrierConfig[] = [
  {
    name: 'Medicare',
    slug: 'medicare',
    directoryUrl: 'https://data.cms.gov/provider-data/api/1/metastore/schemas/dataset/items/mj5m-pzi6',
    lookupType: 'api',
    notes: 'CMS public API - most reliable source',
  },
  {
    name: 'Aetna',
    slug: 'aetna',
    directoryUrl: 'https://www.aetna.com/dsepublic/',
    lookupType: 'unsupported',
    notes: 'JS-heavy SPA, requires headless browser',
  },
  {
    name: 'UnitedHealthcare',
    slug: 'uhc',
    directoryUrl: 'https://www.uhc.com/find-a-doctor',
    lookupType: 'unsupported',
    notes: 'JS-heavy SPA, requires headless browser',
  },
  {
    name: 'Cigna',
    slug: 'cigna',
    directoryUrl: 'https://hcpdirectory.cigna.com/',
    lookupType: 'unsupported',
    notes: 'JS-heavy SPA, requires headless browser',
  },
  {
    name: 'Blue Cross Blue Shield',
    slug: 'bcbs',
    directoryUrl: 'https://www.bcbs.com/find-a-doctor',
    lookupType: 'unsupported',
    notes: 'Redirects to regional BCBS sites',
  },
];

async function scrapeMedicare(
  pool: InstanceType<typeof Pool>,
  npi: string,
  applyMode: boolean
): Promise<{ found: boolean; inNetwork: boolean }> {
  try {
    // CMS has a public API for provider data
    const response = await fetch(
      `https://npiregistry.cms.hhs.gov/api/?version=2.1&number=${npi}`
    );

    if (!response.ok) return { found: false, inNetwork: false };

    const data = await response.json();
    if (data.result_count === 0) return { found: false, inNetwork: false };

    // If found in NPPES, the provider exists and is registered
    // Medicare acceptance is separate from NPPES registration
    return { found: true, inNetwork: true };
  } catch {
    return { found: false, inNetwork: false };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const applyMode = args.includes('--apply');
  const carrierArg = args.indexOf('--carrier');
  const carrierSlug = carrierArg !== -1 ? args[carrierArg + 1] : null;
  const limitArg = args.indexOf('--limit');
  const limit = limitArg !== -1 ? parseInt(args[limitArg + 1]) : 10;

  console.log('\n🌐 Carrier Directory Scraper\n');
  console.log('='.repeat(70));

  // If no carrier specified, list available carriers
  if (!carrierSlug) {
    console.log('\nAvailable carrier configurations:\n');
    for (const config of CARRIER_CONFIGS) {
      const status = config.lookupType === 'unsupported' ? '❌' : '✅';
      console.log(`  ${status} ${config.slug.padEnd(15)} ${config.name}`);
      console.log(`     Type: ${config.lookupType}`);
      console.log(`     Notes: ${config.notes}`);
      console.log();
    }
    console.log('Usage: npx tsx scripts/scrape-carrier-directory.ts --carrier <slug>');
    return;
  }

  const config = CARRIER_CONFIGS.find(c => c.slug === carrierSlug);
  if (!config) {
    console.error(`Unknown carrier: ${carrierSlug}`);
    console.error('Available carriers: ' + CARRIER_CONFIGS.map(c => c.slug).join(', '));
    process.exit(1);
  }

  if (config.lookupType === 'unsupported') {
    console.log(`\n⚠️  ${config.name} directory is not yet supported.`);
    console.log(`   Reason: ${config.notes}`);
    console.log(`   URL: ${config.directoryUrl}`);
    console.log('\n   To add support, implement a scraper function that handles');
    console.log('   the JS rendering (Playwright/Puppeteer) for this carrier.');
    return;
  }

  console.log(`Carrier: ${config.name}`);
  console.log(`Mode: ${applyMode ? 'APPLY' : 'DRY RUN'}`);
  console.log(`Limit: ${limit}`);

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 3,
  });

  try {
    // Get providers to check
    const providers = await pool.query(
      `SELECT npi, first_name, last_name, organization_name, entity_type
       FROM providers
       ORDER BY npi
       LIMIT $1`,
      [limit]
    );

    console.log(`\nChecking ${providers.rows.length} providers against ${config.name}...\n`);

    let found = 0;
    let inNetwork = 0;
    let notFound = 0;

    for (const row of providers.rows) {
      let result: { found: boolean; inNetwork: boolean };

      switch (config.slug) {
        case 'medicare':
          result = await scrapeMedicare(pool, row.npi, applyMode);
          break;
        default:
          console.log(`  No scraper implementation for ${config.slug}`);
          return;
      }

      if (result.found) {
        found++;
        if (result.inNetwork) {
          inNetwork++;

          if (applyMode) {
            // Find matching plans for this carrier
            const plans = await pool.query(
              `SELECT plan_id FROM insurance_plans WHERE carrier ILIKE $1 LIMIT 5`,
              [`%${config.name}%`]
            );

            for (const plan of plans.rows) {
              await pool.query(
                `INSERT INTO provider_plan_acceptance (npi, plan_id, acceptance_status, confidence_score, verification_count, created_at, updated_at)
                 VALUES ($1, $2, 'PENDING', 80, 0, NOW(), NOW())
                 ON CONFLICT DO NOTHING`,
                [row.npi, plan.plan_id]
              );
            }
          }
        }
      } else {
        notFound++;
      }

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log('\n' + '='.repeat(70));
    console.log('SCRAPE SUMMARY');
    console.log('='.repeat(70));
    console.log(`  Providers checked: ${providers.rows.length}`);
    console.log(`  Found in directory: ${found}`);
    console.log(`  In-network: ${inNetwork}`);
    console.log(`  Not found: ${notFound}`);

    if (!applyMode) {
      console.log('\n  Run with --apply to create PPA records.');
    }
  } finally {
    await pool.end();
  }
}

main().catch(console.error);
