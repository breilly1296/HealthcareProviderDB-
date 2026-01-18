/**
 * NYC City Name Normalization Script
 *
 * Normalizes inconsistent city names in the providers table for NYC data.
 * Handles variations in borough names, neighborhoods, and common typos.
 *
 * Usage:
 *   npx tsx scripts/normalize-city-names.ts          # DRY RUN (preview changes)
 *   npx tsx scripts/normalize-city-names.ts --apply  # Apply changes
 */

import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

// ============================================================================
// NYC CITY NAME MAPPINGS (100+ variations)
// ============================================================================

// Normalized borough names
const BOROUGHS = {
  MANHATTAN: 'New York',
  BROOKLYN: 'Brooklyn',
  QUEENS: 'Queens',
  BRONX: 'Bronx',
  STATEN_ISLAND: 'Staten Island',
} as const;

// City name mappings: variation -> normalized name
// Keys are UPPERCASE for case-insensitive matching
const NYC_CITY_MAPPINGS: Record<string, string> = {
  // -------------------------------------------------------------------------
  // MANHATTAN VARIATIONS (normalize to "New York")
  // -------------------------------------------------------------------------
  'NEW YORK': BOROUGHS.MANHATTAN,
  'NEW YORK CITY': BOROUGHS.MANHATTAN,
  'NEWYORK': BOROUGHS.MANHATTAN,
  'NEW  YORK': BOROUGHS.MANHATTAN,
  'NEW-YORK': BOROUGHS.MANHATTAN,
  'N.Y.': BOROUGHS.MANHATTAN,
  'N.Y.C.': BOROUGHS.MANHATTAN,
  'N Y C': BOROUGHS.MANHATTAN,
  'NYC': BOROUGHS.MANHATTAN,
  'NY': BOROUGHS.MANHATTAN,
  'MANHATTAN': BOROUGHS.MANHATTAN,
  'MANHATTEN': BOROUGHS.MANHATTAN,
  'MANHATAN': BOROUGHS.MANHATTAN,
  'MANAHTTAN': BOROUGHS.MANHATTAN,
  'MANHTTAN': BOROUGHS.MANHATTAN,
  'NEW YORK NY': BOROUGHS.MANHATTAN,
  'NEW YORK, NY': BOROUGHS.MANHATTAN,
  'NEWYORK NY': BOROUGHS.MANHATTAN,
  'NY NY': BOROUGHS.MANHATTAN,
  'NEW YORK CITY NY': BOROUGHS.MANHATTAN,

  // Manhattan neighborhoods (map to New York)
  'HARLEM': BOROUGHS.MANHATTAN,
  'EAST HARLEM': BOROUGHS.MANHATTAN,
  'WEST HARLEM': BOROUGHS.MANHATTAN,
  'UPPER EAST SIDE': BOROUGHS.MANHATTAN,
  'UPPER WEST SIDE': BOROUGHS.MANHATTAN,
  'MIDTOWN': BOROUGHS.MANHATTAN,
  'DOWNTOWN': BOROUGHS.MANHATTAN,
  'LOWER EAST SIDE': BOROUGHS.MANHATTAN,
  'LOWER MANHATTAN': BOROUGHS.MANHATTAN,
  'TRIBECA': BOROUGHS.MANHATTAN,
  'SOHO': BOROUGHS.MANHATTAN,
  'CHELSEA': BOROUGHS.MANHATTAN,
  'GREENWICH VILLAGE': BOROUGHS.MANHATTAN,
  'GRAMERCY': BOROUGHS.MANHATTAN,
  'FINANCIAL DISTRICT': BOROUGHS.MANHATTAN,
  'WASHINGTON HEIGHTS': BOROUGHS.MANHATTAN,
  'INWOOD': BOROUGHS.MANHATTAN,
  'MORNINGSIDE HEIGHTS': BOROUGHS.MANHATTAN,
  'MURRAY HILL': BOROUGHS.MANHATTAN,
  'KIPS BAY': BOROUGHS.MANHATTAN,
  'STUYVESANT TOWN': BOROUGHS.MANHATTAN,
  'ALPHABET CITY': BOROUGHS.MANHATTAN,
  'EAST VILLAGE': BOROUGHS.MANHATTAN,
  'WEST VILLAGE': BOROUGHS.MANHATTAN,
  'NOLITA': BOROUGHS.MANHATTAN,
  'NOHO': BOROUGHS.MANHATTAN,
  'CHINATOWN': BOROUGHS.MANHATTAN,
  'LITTLE ITALY': BOROUGHS.MANHATTAN,
  'BATTERY PARK CITY': BOROUGHS.MANHATTAN,
  'HELL\'S KITCHEN': BOROUGHS.MANHATTAN,
  'HELLS KITCHEN': BOROUGHS.MANHATTAN,
  'CLINTON': BOROUGHS.MANHATTAN,
  'TUDOR CITY': BOROUGHS.MANHATTAN,
  'SUTTON PLACE': BOROUGHS.MANHATTAN,
  'YORKVILLE': BOROUGHS.MANHATTAN,
  'SPANISH HARLEM': BOROUGHS.MANHATTAN,
  'MARBLE HILL': BOROUGHS.MANHATTAN,
  'HAMILTON HEIGHTS': BOROUGHS.MANHATTAN,
  'SUGAR HILL': BOROUGHS.MANHATTAN,
  'MEATPACKING DISTRICT': BOROUGHS.MANHATTAN,
  'TWO BRIDGES': BOROUGHS.MANHATTAN,

  // -------------------------------------------------------------------------
  // BROOKLYN VARIATIONS (normalize to "Brooklyn")
  // -------------------------------------------------------------------------
  'BROOKLYN': BOROUGHS.BROOKLYN,
  'BROOKYN': BOROUGHS.BROOKLYN,
  'BKLYN': BOROUGHS.BROOKLYN,
  'BKLN': BOROUGHS.BROOKLYN,
  'BK': BOROUGHS.BROOKLYN,
  'BRKLYN': BOROUGHS.BROOKLYN,
  'BROOOKLYN': BOROUGHS.BROOKLYN,
  'BROOKLIN': BOROUGHS.BROOKLYN,
  'BROOKLYN NY': BOROUGHS.BROOKLYN,
  'BROOKLYN, NY': BOROUGHS.BROOKLYN,

  // Brooklyn neighborhoods
  'WILLIAMSBURG': BOROUGHS.BROOKLYN,
  'BUSHWICK': BOROUGHS.BROOKLYN,
  'GREENPOINT': BOROUGHS.BROOKLYN,
  'BEDFORD-STUYVESANT': BOROUGHS.BROOKLYN,
  'BEDFORD STUYVESANT': BOROUGHS.BROOKLYN,
  'BED-STUY': BOROUGHS.BROOKLYN,
  'BED STUY': BOROUGHS.BROOKLYN,
  'CROWN HEIGHTS': BOROUGHS.BROOKLYN,
  'FLATBUSH': BOROUGHS.BROOKLYN,
  'EAST FLATBUSH': BOROUGHS.BROOKLYN,
  'PARK SLOPE': BOROUGHS.BROOKLYN,
  'PROSPECT HEIGHTS': BOROUGHS.BROOKLYN,
  'PROSPECT PARK': BOROUGHS.BROOKLYN,
  'COBBLE HILL': BOROUGHS.BROOKLYN,
  'CARROLL GARDENS': BOROUGHS.BROOKLYN,
  'RED HOOK': BOROUGHS.BROOKLYN,
  'GOWANUS': BOROUGHS.BROOKLYN,
  'SUNSET PARK': BOROUGHS.BROOKLYN,
  'BAY RIDGE': BOROUGHS.BROOKLYN,
  'BENSONHURST': BOROUGHS.BROOKLYN,
  'BOROUGH PARK': BOROUGHS.BROOKLYN,
  'BORO PARK': BOROUGHS.BROOKLYN,
  'MIDWOOD': BOROUGHS.BROOKLYN,
  'SHEEPSHEAD BAY': BOROUGHS.BROOKLYN,
  'BRIGHTON BEACH': BOROUGHS.BROOKLYN,
  'CONEY ISLAND': BOROUGHS.BROOKLYN,
  'GRAVESEND': BOROUGHS.BROOKLYN,
  'MARINE PARK': BOROUGHS.BROOKLYN,
  'MILL BASIN': BOROUGHS.BROOKLYN,
  'CANARSIE': BOROUGHS.BROOKLYN,
  'EAST NEW YORK': BOROUGHS.BROOKLYN,
  'BROWNSVILLE': BOROUGHS.BROOKLYN,
  'OCEAN HILL': BOROUGHS.BROOKLYN,
  'FORT GREENE': BOROUGHS.BROOKLYN,
  'CLINTON HILL': BOROUGHS.BROOKLYN,
  'DUMBO': BOROUGHS.BROOKLYN,
  'BROOKLYN HEIGHTS': BOROUGHS.BROOKLYN,
  'DOWNTOWN BROOKLYN': BOROUGHS.BROOKLYN,
  'DYKER HEIGHTS': BOROUGHS.BROOKLYN,
  'KENSINGTON': BOROUGHS.BROOKLYN,
  'WINDSOR TERRACE': BOROUGHS.BROOKLYN,
  'FLATLANDS': BOROUGHS.BROOKLYN,
  'GERRITSEN BEACH': BOROUGHS.BROOKLYN,
  'MANHATTAN BEACH': BOROUGHS.BROOKLYN,
  'BERGEN BEACH': BOROUGHS.BROOKLYN,
  'CYPRESS HILLS': BOROUGHS.BROOKLYN,
  'CITY LINE': BOROUGHS.BROOKLYN,
  'NEW LOTS': BOROUGHS.BROOKLYN,
  'SPRING CREEK': BOROUGHS.BROOKLYN,
  'STARRETT CITY': BOROUGHS.BROOKLYN,
  'VINEGAR HILL': BOROUGHS.BROOKLYN,
  'NAVY YARD': BOROUGHS.BROOKLYN,
  'BOERUM HILL': BOROUGHS.BROOKLYN,
  'PROSPECT LEFFERTS GARDENS': BOROUGHS.BROOKLYN,
  'PLG': BOROUGHS.BROOKLYN,
  'DITMAS PARK': BOROUGHS.BROOKLYN,
  'VICTORIAN FLATBUSH': BOROUGHS.BROOKLYN,
  'SEA GATE': BOROUGHS.BROOKLYN,

  // -------------------------------------------------------------------------
  // QUEENS VARIATIONS (normalize to "Queens")
  // -------------------------------------------------------------------------
  'QUEENS': BOROUGHS.QUEENS,
  'QUEENS NY': BOROUGHS.QUEENS,
  'QUEENS, NY': BOROUGHS.QUEENS,
  'QNS': BOROUGHS.QUEENS,
  'QUENS': BOROUGHS.QUEENS,
  'QUEESN': BOROUGHS.QUEENS,

  // Queens neighborhoods - these are commonly used as city names
  'FLUSHING': BOROUGHS.QUEENS,
  'JAMAICA': BOROUGHS.QUEENS,
  'ASTORIA': BOROUGHS.QUEENS,
  'LONG ISLAND CITY': BOROUGHS.QUEENS,
  'LIC': BOROUGHS.QUEENS,
  'L.I.C.': BOROUGHS.QUEENS,
  'JACKSON HEIGHTS': BOROUGHS.QUEENS,
  'ELMHURST': BOROUGHS.QUEENS,
  'CORONA': BOROUGHS.QUEENS,
  'EAST ELMHURST': BOROUGHS.QUEENS,
  'WOODSIDE': BOROUGHS.QUEENS,
  'SUNNYSIDE': BOROUGHS.QUEENS,
  'MASPETH': BOROUGHS.QUEENS,
  'MIDDLE VILLAGE': BOROUGHS.QUEENS,
  'RIDGEWOOD': BOROUGHS.QUEENS,
  'GLENDALE': BOROUGHS.QUEENS,
  'FOREST HILLS': BOROUGHS.QUEENS,
  'REGO PARK': BOROUGHS.QUEENS,
  'KEW GARDENS': BOROUGHS.QUEENS,
  'KEW GARDENS HILLS': BOROUGHS.QUEENS,
  'RICHMOND HILL': BOROUGHS.QUEENS,
  'SOUTH RICHMOND HILL': BOROUGHS.QUEENS,
  'OZONE PARK': BOROUGHS.QUEENS,
  'SOUTH OZONE PARK': BOROUGHS.QUEENS,
  'WOODHAVEN': BOROUGHS.QUEENS,
  'HOWARD BEACH': BOROUGHS.QUEENS,
  'BROAD CHANNEL': BOROUGHS.QUEENS,
  'ROCKAWAY': BOROUGHS.QUEENS,
  'ROCKAWAY BEACH': BOROUGHS.QUEENS,
  'ROCKAWAY PARK': BOROUGHS.QUEENS,
  'FAR ROCKAWAY': BOROUGHS.QUEENS,
  'ARVERNE': BOROUGHS.QUEENS,
  'BELLE HARBOR': BOROUGHS.QUEENS,
  'BREEZY POINT': BOROUGHS.QUEENS,
  'NEPONSIT': BOROUGHS.QUEENS,
  'BAYSIDE': BOROUGHS.QUEENS,
  'AUBURNDALE': BOROUGHS.QUEENS,
  'WHITESTONE': BOROUGHS.QUEENS,
  'COLLEGE POINT': BOROUGHS.QUEENS,
  'MALBA': BOROUGHS.QUEENS,
  'BEECHHURST': BOROUGHS.QUEENS,
  'LITTLE NECK': BOROUGHS.QUEENS,
  'DOUGLASTON': BOROUGHS.QUEENS,
  'OAKLAND GARDENS': BOROUGHS.QUEENS,
  'FRESH MEADOWS': BOROUGHS.QUEENS,
  'UTOPIA': BOROUGHS.QUEENS,
  'HOLLIS': BOROUGHS.QUEENS,
  'HOLLIS HILLS': BOROUGHS.QUEENS,
  'QUEENS VILLAGE': BOROUGHS.QUEENS,
  'BELLEROSE': BOROUGHS.QUEENS,
  'GLEN OAKS': BOROUGHS.QUEENS,
  'FLORAL PARK': BOROUGHS.QUEENS,
  'NEW HYDE PARK': BOROUGHS.QUEENS,
  'CAMBRIA HEIGHTS': BOROUGHS.QUEENS,
  'ROSEDALE': BOROUGHS.QUEENS,
  'LAURELTON': BOROUGHS.QUEENS,
  'SPRINGFIELD GARDENS': BOROUGHS.QUEENS,
  'ST ALBANS': BOROUGHS.QUEENS,
  'SAINT ALBANS': BOROUGHS.QUEENS,
  'SOUTH JAMAICA': BOROUGHS.QUEENS,
  'BRIARWOOD': BOROUGHS.QUEENS,
  'JAMAICA ESTATES': BOROUGHS.QUEENS,
  'JAMAICA HILLS': BOROUGHS.QUEENS,
  'HILLCREST': BOROUGHS.QUEENS,
  'POMONOK': BOROUGHS.QUEENS,
  'ELECTCHESTER': BOROUGHS.QUEENS,
  'LEFRAK CITY': BOROUGHS.QUEENS,
  'RAVENSWOOD': BOROUGHS.QUEENS,
  'HUNTERS POINT': BOROUGHS.QUEENS,
  'DITMARS': BOROUGHS.QUEENS,
  'STEINWAY': BOROUGHS.QUEENS,
  'EAST FLUSHING': BOROUGHS.QUEENS,
  'MURRAY HILL QUEENS': BOROUGHS.QUEENS,
  'BROADWAY FLUSHING': BOROUGHS.QUEENS,

  // -------------------------------------------------------------------------
  // BRONX VARIATIONS (normalize to "Bronx")
  // -------------------------------------------------------------------------
  'BRONX': BOROUGHS.BRONX,
  'THE BRONX': BOROUGHS.BRONX,
  'BX': BOROUGHS.BRONX,
  'BRONX NY': BOROUGHS.BRONX,
  'BRONX, NY': BOROUGHS.BRONX,
  'BORNX': BOROUGHS.BRONX,
  'BРОНX': BOROUGHS.BRONX,

  // Bronx neighborhoods
  'RIVERDALE': BOROUGHS.BRONX,
  'KINGSBRIDGE': BOROUGHS.BRONX,
  'FORDHAM': BOROUGHS.BRONX,
  'BELMONT': BOROUGHS.BRONX,
  'MORRIS PARK': BOROUGHS.BRONX,
  'PELHAM BAY': BOROUGHS.BRONX,
  'PELHAM GARDENS': BOROUGHS.BRONX,
  'THROGS NECK': BOROUGHS.BRONX,
  'THROGGS NECK': BOROUGHS.BRONX,
  'CITY ISLAND': BOROUGHS.BRONX,
  'CO-OP CITY': BOROUGHS.BRONX,
  'COOP CITY': BOROUGHS.BRONX,
  'BAYCHESTER': BOROUGHS.BRONX,
  'EASTCHESTER': BOROUGHS.BRONX,
  'WAKEFIELD': BOROUGHS.BRONX,
  'WOODLAWN': BOROUGHS.BRONX,
  'NORWOOD': BOROUGHS.BRONX,
  'BEDFORD PARK': BOROUGHS.BRONX,
  'UNIVERSITY HEIGHTS': BOROUGHS.BRONX,
  'TREMONT': BOROUGHS.BRONX,
  'MOUNT HOPE': BOROUGHS.BRONX,
  'MT HOPE': BOROUGHS.BRONX,
  'CLAREMONT': BOROUGHS.BRONX,
  'MORRISANIA': BOROUGHS.BRONX,
  'MELROSE': BOROUGHS.BRONX,
  'MOTT HAVEN': BOROUGHS.BRONX,
  'PORT MORRIS': BOROUGHS.BRONX,
  'HUNTS POINT': BOROUGHS.BRONX,
  'LONGWOOD': BOROUGHS.BRONX,
  'SOUNDVIEW': BOROUGHS.BRONX,
  'CASTLE HILL': BOROUGHS.BRONX,
  'PARKCHESTER': BOROUGHS.BRONX,
  'WESTCHESTER SQUARE': BOROUGHS.BRONX,
  'VAN NEST': BOROUGHS.BRONX,
  'MORRIS HEIGHTS': BOROUGHS.BRONX,
  'HIGHBRIDGE': BOROUGHS.BRONX,
  'CONCOURSE': BOROUGHS.BRONX,
  'GRAND CONCOURSE': BOROUGHS.BRONX,
  'CONCOURSE VILLAGE': BOROUGHS.BRONX,
  'MOUNT EDEN': BOROUGHS.BRONX,
  'MT EDEN': BOROUGHS.BRONX,
  'CLASON POINT': BOROUGHS.BRONX,
  'SCHUYLERVILLE': BOROUGHS.BRONX,
  'EDGEWATER PARK': BOROUGHS.BRONX,
  'COUNTRY CLUB': BOROUGHS.BRONX,
  'SPENCER ESTATES': BOROUGHS.BRONX,
  'LACONIA': BOROUGHS.BRONX,
  'EDENWALD': BOROUGHS.BRONX,
  'WILLIAMSBRIDGE': BOROUGHS.BRONX,
  'OLINVILLE': BOROUGHS.BRONX,
  'ALLERTON': BOROUGHS.BRONX,
  'PELHAM PARKWAY': BOROUGHS.BRONX,
  'BRONX PARK': BOROUGHS.BRONX,
  'WEST FARMS': BOROUGHS.BRONX,
  'CROTONA PARK': BOROUGHS.BRONX,
  'CHARLOTTE GARDENS': BOROUGHS.BRONX,
  'FOXHURST': BOROUGHS.BRONX,
  'SPUYTEN DUYVIL': BOROUGHS.BRONX,
  'FIELDSTON': BOROUGHS.BRONX,
  'NORTH RIVERDALE': BOROUGHS.BRONX,
  'VAN CORTLANDT': BOROUGHS.BRONX,
  'KINGSBRIDGE HEIGHTS': BOROUGHS.BRONX,
  'MARBLE HILL BRONX': BOROUGHS.BRONX,

  // -------------------------------------------------------------------------
  // STATEN ISLAND VARIATIONS (normalize to "Staten Island")
  // -------------------------------------------------------------------------
  'STATEN ISLAND': BOROUGHS.STATEN_ISLAND,
  'STATEN IS': BOROUGHS.STATEN_ISLAND,
  'STATEN IS.': BOROUGHS.STATEN_ISLAND,
  'STATENISLAND': BOROUGHS.STATEN_ISLAND,
  'STATEN  ISLAND': BOROUGHS.STATEN_ISLAND,
  'STATEN-ISLAND': BOROUGHS.STATEN_ISLAND,
  'S.I.': BOROUGHS.STATEN_ISLAND,
  'SI': BOROUGHS.STATEN_ISLAND,
  'STATEN ISLAND NY': BOROUGHS.STATEN_ISLAND,
  'STATEN ISLAND, NY': BOROUGHS.STATEN_ISLAND,
  'RICHMOND': BOROUGHS.STATEN_ISLAND, // Historical name

  // Staten Island neighborhoods
  'ST GEORGE': BOROUGHS.STATEN_ISLAND,
  'SAINT GEORGE': BOROUGHS.STATEN_ISLAND,
  'TOMPKINSVILLE': BOROUGHS.STATEN_ISLAND,
  'STAPLETON': BOROUGHS.STATEN_ISLAND,
  'CLIFTON': BOROUGHS.STATEN_ISLAND,
  'ROSEBANK': BOROUGHS.STATEN_ISLAND,
  'GRASMERE': BOROUGHS.STATEN_ISLAND,
  'ARROCHAR': BOROUGHS.STATEN_ISLAND,
  'SOUTH BEACH': BOROUGHS.STATEN_ISLAND,
  'MIDLAND BEACH': BOROUGHS.STATEN_ISLAND,
  'DONGAN HILLS': BOROUGHS.STATEN_ISLAND,
  'GRANT CITY': BOROUGHS.STATEN_ISLAND,
  'NEW DORP': BOROUGHS.STATEN_ISLAND,
  'NEW DORP BEACH': BOROUGHS.STATEN_ISLAND,
  'OAKWOOD': BOROUGHS.STATEN_ISLAND,
  'OAKWOOD BEACH': BOROUGHS.STATEN_ISLAND,
  'BAY TERRACE SI': BOROUGHS.STATEN_ISLAND,
  'GREAT KILLS': BOROUGHS.STATEN_ISLAND,
  'ELTINGVILLE': BOROUGHS.STATEN_ISLAND,
  'ANNADALE': BOROUGHS.STATEN_ISLAND,
  'HUGUENOT': BOROUGHS.STATEN_ISLAND,
  'PRINCES BAY': BOROUGHS.STATEN_ISLAND,
  'PLEASANT PLAINS': BOROUGHS.STATEN_ISLAND,
  'CHARLESTON': BOROUGHS.STATEN_ISLAND,
  'ROSSVILLE': BOROUGHS.STATEN_ISLAND,
  'WOODROW': BOROUGHS.STATEN_ISLAND,
  'TOTTENVILLE': BOROUGHS.STATEN_ISLAND,
  'PORT RICHMOND': BOROUGHS.STATEN_ISLAND,
  'WEST BRIGHTON': BOROUGHS.STATEN_ISLAND,
  'NEW BRIGHTON': BOROUGHS.STATEN_ISLAND,
  'RANDALL MANOR': BOROUGHS.STATEN_ISLAND,
  'LIVINGSTON': BOROUGHS.STATEN_ISLAND,
  'WESTERLEIGH': BOROUGHS.STATEN_ISLAND,
  'SUNNYSIDE SI': BOROUGHS.STATEN_ISLAND,
  'WILLOWBROOK': BOROUGHS.STATEN_ISLAND,
  'BULLS HEAD': BOROUGHS.STATEN_ISLAND,
  'TRAVIS': BOROUGHS.STATEN_ISLAND,
  'MARINERS HARBOR': BOROUGHS.STATEN_ISLAND,
  'PORT IVORY': BOROUGHS.STATEN_ISLAND,
  'BLOOMFIELD': BOROUGHS.STATEN_ISLAND,
  'ELM PARK': BOROUGHS.STATEN_ISLAND,
  'TODT HILL': BOROUGHS.STATEN_ISLAND,
  'EMERSON HILL': BOROUGHS.STATEN_ISLAND,
  'GRYMES HILL': BOROUGHS.STATEN_ISLAND,
  'SHORE ACRES': BOROUGHS.STATEN_ISLAND,
  'RICHMONDTOWN': BOROUGHS.STATEN_ISLAND,
  'LIGHTHOUSE HILL': BOROUGHS.STATEN_ISLAND,
  'HEARTLAND VILLAGE': BOROUGHS.STATEN_ISLAND,
  'CASTLETON CORNERS': BOROUGHS.STATEN_ISLAND,
  'ARDEN HEIGHTS': BOROUGHS.STATEN_ISLAND,
  'GREENRIDGE': BOROUGHS.STATEN_ISLAND,
  'CHELSEA SI': BOROUGHS.STATEN_ISLAND,
};

// ============================================================================
// CLEANUP PATTERNS
// ============================================================================

// Patterns to clean from city names before mapping
const CLEANUP_PATTERNS: [RegExp, string][] = [
  // Remove trailing state codes
  [/,\s*NY$/i, ''],
  [/,NY$/i, ''],
  [/\s+NY$/i, ''],
  [/,\s*NEW YORK$/i, ''],
  [/,\s*N\.?Y\.?$/i, ''],

  // Remove zip codes that might be appended
  [/\s+\d{5}(-\d{4})?$/, ''],

  // Normalize multiple spaces
  [/\s+/g, ' '],

  // Remove leading/trailing whitespace (done via trim)
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function cleanCityName(city: string): string {
  if (!city) return '';

  let cleaned = city.trim().toUpperCase();

  for (const [pattern, replacement] of CLEANUP_PATTERNS) {
    cleaned = cleaned.replace(pattern, replacement);
  }

  return cleaned.trim();
}

function normalizeCity(city: string): string | null {
  if (!city) return null;

  const cleaned = cleanCityName(city);

  // Direct lookup
  if (NYC_CITY_MAPPINGS[cleaned]) {
    return NYC_CITY_MAPPINGS[cleaned];
  }

  return null; // No normalization needed or unknown
}

// ============================================================================
// MAIN SCRIPT
// ============================================================================

interface CityStats {
  city: string;
  count: number;
  normalizedTo: string | null;
}

interface NormalizationResult {
  beforeStats: {
    totalRecords: number;
    uniqueCities: number;
    cities: CityStats[];
  };
  changes: {
    fromCity: string;
    toCity: string;
    count: number;
  }[];
  afterStats?: {
    totalRecords: number;
    uniqueCities: number;
    cities: CityStats[];
  };
}

async function analyzeCityData(pool: pg.Pool): Promise<NormalizationResult['beforeStats']> {
  console.log('\n📊 Analyzing current city data for NY state...\n');

  const result = await pool.query(`
    SELECT city, COUNT(*) as count
    FROM providers
    WHERE state = 'NY'
    GROUP BY city
    ORDER BY count DESC
  `);

  const cities: CityStats[] = result.rows.map((row: { city: string; count: string }) => ({
    city: row.city,
    count: parseInt(row.count),
    normalizedTo: normalizeCity(row.city),
  }));

  const totalRecords = cities.reduce((sum, c) => sum + c.count, 0);

  return {
    totalRecords,
    uniqueCities: cities.length,
    cities,
  };
}

async function previewChanges(beforeStats: NormalizationResult['beforeStats']): Promise<NormalizationResult['changes']> {
  const changes: NormalizationResult['changes'] = [];

  for (const city of beforeStats.cities) {
    if (city.normalizedTo && city.normalizedTo !== city.city) {
      changes.push({
        fromCity: city.city,
        toCity: city.normalizedTo,
        count: city.count,
      });
    }
  }

  // Sort by count descending
  changes.sort((a, b) => b.count - a.count);

  return changes;
}

async function applyChanges(pool: pg.Pool, changes: NormalizationResult['changes']): Promise<number> {
  console.log('\n🔄 Applying changes in transaction...\n');

  const client = await pool.connect();
  let totalUpdated = 0;

  try {
    await client.query('BEGIN');

    for (const change of changes) {
      const result = await client.query(`
        UPDATE providers
        SET city = $1
        WHERE state = 'NY' AND city = $2
      `, [change.toCity, change.fromCity]);

      totalUpdated += result.rowCount || 0;
      console.log(`  ✓ "${change.fromCity}" → "${change.toCity}" (${result.rowCount} records)`);
    }

    await client.query('COMMIT');
    console.log(`\n✅ Transaction committed. ${totalUpdated} records updated.`);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n❌ Transaction rolled back due to error:', error);
    throw error;
  } finally {
    client.release();
  }

  return totalUpdated;
}

function printStats(label: string, stats: NormalizationResult['beforeStats']) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`${label}`);
  console.log('='.repeat(80));
  console.log(`Total NY records: ${stats.totalRecords.toLocaleString()}`);
  console.log(`Unique city names: ${stats.uniqueCities}`);
  console.log('\nTop 30 city names by frequency:');
  console.log('-'.repeat(60));

  const topCities = stats.cities.slice(0, 30);
  for (const city of topCities) {
    const normalized = city.normalizedTo && city.normalizedTo !== city.city
      ? ` → ${city.normalizedTo}`
      : '';
    console.log(`  ${city.city.padEnd(30)} ${city.count.toLocaleString().padStart(8)}${normalized}`);
  }

  if (stats.cities.length > 30) {
    console.log(`  ... and ${stats.cities.length - 30} more unique city names`);
  }
}

function printChanges(changes: NormalizationResult['changes']) {
  console.log(`\n${'='.repeat(80)}`);
  console.log('PROPOSED CHANGES');
  console.log('='.repeat(80));

  if (changes.length === 0) {
    console.log('No changes needed. All city names are already normalized.');
    return;
  }

  const totalAffected = changes.reduce((sum, c) => sum + c.count, 0);
  console.log(`\n${changes.length} city name variations will be normalized.`);
  console.log(`${totalAffected.toLocaleString()} records will be updated.\n`);

  // Group by target city
  const byTarget: Record<string, typeof changes> = {};
  for (const change of changes) {
    if (!byTarget[change.toCity]) {
      byTarget[change.toCity] = [];
    }
    byTarget[change.toCity].push(change);
  }

  for (const [target, sourceChanges] of Object.entries(byTarget)) {
    const totalForTarget = sourceChanges.reduce((sum, c) => sum + c.count, 0);
    console.log(`\n→ "${target}" (${totalForTarget.toLocaleString()} records):`);

    // Sort by count and show top entries
    const sorted = sourceChanges.sort((a, b) => b.count - a.count);
    const toShow = sorted.slice(0, 15);

    for (const change of toShow) {
      console.log(`    "${change.fromCity}" (${change.count.toLocaleString()})`);
    }

    if (sorted.length > 15) {
      console.log(`    ... and ${sorted.length - 15} more variations`);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const applyMode = args.includes('--apply');

  console.log('\n' + '═'.repeat(80));
  console.log('NYC CITY NAME NORMALIZATION SCRIPT');
  console.log('═'.repeat(80));

  if (!applyMode) {
    console.log('\n🔍 DRY RUN MODE - No changes will be made.');
    console.log('   Use --apply flag to apply changes.');
  } else {
    console.log('\n⚠️  APPLY MODE - Changes will be committed to the database.');
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('\n❌ Error: DATABASE_URL environment variable is required');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    max: 3,
  });

  try {
    // Analyze before state
    const beforeStats = await analyzeCityData(pool);
    printStats('BEFORE NORMALIZATION', beforeStats);

    // Calculate changes
    const changes = await previewChanges(beforeStats);
    printChanges(changes);

    if (applyMode && changes.length > 0) {
      // Apply changes
      await applyChanges(pool, changes);

      // Analyze after state
      const afterStats = await analyzeCityData(pool);
      printStats('AFTER NORMALIZATION', afterStats);

      // Summary
      console.log(`\n${'='.repeat(80)}`);
      console.log('SUMMARY');
      console.log('='.repeat(80));
      console.log(`  Unique city names BEFORE: ${beforeStats.uniqueCities}`);
      console.log(`  Unique city names AFTER:  ${afterStats.uniqueCities}`);
      console.log(`  Reduction: ${beforeStats.uniqueCities - afterStats.uniqueCities} fewer unique values`);

    } else if (!applyMode && changes.length > 0) {
      console.log(`\n${'='.repeat(80)}`);
      console.log('DRY RUN COMPLETE');
      console.log('='.repeat(80));
      console.log(`\nTo apply these changes, run:`);
      console.log(`  npx tsx scripts/normalize-city-names.ts --apply\n`);
    }

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
