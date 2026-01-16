import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface Facility {
  name: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  facilityType: string;
  healthSystem: string;
}

interface FacilitiesData {
  organizations: Array<{
    healthSystem: string;
    facilities: Array<{
      name: string;
      address: string;
      city: string;
      state: string;
      zipCode: string;
      facilityType: string;
    }>;
  }>;
}

/**
 * Convert ordinal number to word form
 */
function ordinalToWord(num: number): string {
  const ordinals: Record<number, string> = {
    1: 'first', 2: 'second', 3: 'third', 4: 'fourth', 5: 'fifth',
    6: 'sixth', 7: 'seventh', 8: 'eighth', 9: 'ninth', 10: 'tenth',
    11: 'eleventh', 12: 'twelfth', 13: 'thirteenth', 14: 'fourteenth', 15: 'fifteenth',
    16: 'sixteenth', 17: 'seventeenth', 18: 'eighteenth', 19: 'nineteenth', 20: 'twentieth',
    21: 'twenty-first', 22: 'twenty-second', 23: 'twenty-third', 24: 'twenty-fourth', 25: 'twenty-fifth',
    26: 'twenty-sixth', 27: 'twenty-seventh', 28: 'twenty-eighth', 29: 'twenty-ninth', 30: 'thirtieth',
    31: 'thirty-first', 32: 'thirty-second', 33: 'thirty-third', 34: 'thirty-fourth', 35: 'thirty-fifth',
    36: 'thirty-sixth', 37: 'thirty-seventh', 38: 'thirty-eighth', 39: 'thirty-ninth', 40: 'fortieth',
    41: 'forty-first', 42: 'forty-second', 43: 'forty-third', 44: 'forty-fourth', 45: 'forty-fifth',
    46: 'forty-sixth', 47: 'forty-seventh', 48: 'forty-eighth', 49: 'forty-ninth', 50: 'fiftieth',
    51: 'fifty-first', 52: 'fifty-second', 53: 'fifty-third', 54: 'fifty-fourth', 55: 'fifty-fifth',
    56: 'fifty-sixth', 57: 'fifty-seventh', 58: 'fifty-eighth', 59: 'fifty-ninth', 60: 'sixtieth',
    61: 'sixty-first', 62: 'sixty-second', 63: 'sixty-third', 64: 'sixty-fourth', 65: 'sixty-fifth',
    66: 'sixty-sixth', 67: 'sixty-seventh', 68: 'sixty-eighth', 69: 'sixty-ninth', 70: 'seventieth',
    71: 'seventy-first', 72: 'seventy-second', 73: 'seventy-third', 74: 'seventy-fourth', 75: 'seventy-fifth',
    76: 'seventy-sixth', 77: 'seventy-seventh', 78: 'seventy-eighth', 79: 'seventy-ninth', 80: 'eightieth',
    81: 'eighty-first', 82: 'eighty-second', 83: 'eighty-third', 84: 'eighty-fourth', 85: 'eighty-fifth',
    86: 'eighty-sixth', 87: 'eighty-seventh', 88: 'eighty-eighth', 89: 'eighty-ninth', 90: 'ninetieth',
    91: 'ninety-first', 92: 'ninety-second', 93: 'ninety-third', 94: 'ninety-fourth', 95: 'ninety-fifth',
    96: 'ninety-sixth', 97: 'ninety-seventh', 98: 'ninety-eighth', 99: 'ninety-ninth', 100: 'one-hundredth',
  };
  return ordinals[num] || num.toString();
}

/**
 * Convert word ordinal to numeric form (fifth → 5th)
 */
function wordToNumericOrdinal(word: string): string {
  const wordToNum: Record<string, string> = {
    'first': '1st', 'second': '2nd', 'third': '3rd', 'fourth': '4th', 'fifth': '5th',
    'sixth': '6th', 'seventh': '7th', 'eighth': '8th', 'ninth': '9th', 'tenth': '10th',
    'eleventh': '11th', 'twelfth': '12th', 'thirteenth': '13th', 'fourteenth': '14th', 'fifteenth': '15th',
    'sixteenth': '16th', 'seventeenth': '17th', 'eighteenth': '18th', 'nineteenth': '19th', 'twentieth': '20th',
    'twenty-first': '21st', 'twenty-second': '22nd', 'twenty-third': '23rd', 'twenty-fourth': '24th', 'twenty-fifth': '25th',
    'twenty-sixth': '26th', 'twenty-seventh': '27th', 'twenty-eighth': '28th', 'twenty-ninth': '29th', 'thirtieth': '30th',
    'thirty-first': '31st', 'thirty-second': '32nd', 'thirty-third': '33rd', 'thirty-fourth': '34th', 'thirty-fifth': '35th',
    'thirty-sixth': '36th', 'thirty-seventh': '37th', 'thirty-eighth': '38th', 'thirty-ninth': '39th', 'fortieth': '40th',
    'forty-first': '41st', 'forty-second': '42nd', 'forty-third': '43rd', 'forty-fourth': '44th', 'forty-fifth': '45th',
    'forty-sixth': '46th', 'forty-seventh': '47th', 'forty-eighth': '48th', 'forty-ninth': '49th', 'fiftieth': '50th',
    'fifty-first': '51st', 'fifty-second': '52nd', 'fifty-third': '53rd', 'fifty-fourth': '54th', 'fifty-fifth': '55th',
    'fifty-sixth': '56th', 'fifty-seventh': '57th', 'fifty-eighth': '58th', 'fifty-ninth': '59th', 'sixtieth': '60th',
    'sixty-first': '61st', 'sixty-second': '62nd', 'sixty-third': '63rd', 'sixty-fourth': '64th', 'sixty-fifth': '65th',
    'sixty-sixth': '66th', 'sixty-seventh': '67th', 'sixty-eighth': '68th', 'sixty-ninth': '69th', 'seventieth': '70th',
    'seventy-first': '71st', 'seventy-second': '72nd', 'seventy-third': '73rd', 'seventy-fourth': '74th', 'seventy-fifth': '75th',
    'seventy-sixth': '76th', 'seventy-seventh': '77th', 'seventy-eighth': '78th', 'seventy-ninth': '79th', 'eightieth': '80th',
    'eighty-first': '81st', 'eighty-second': '82nd', 'eighty-third': '83rd', 'eighty-fourth': '84th', 'eighty-fifth': '85th',
    'eighty-sixth': '86th', 'eighty-seventh': '87th', 'eighty-eighth': '88th', 'eighty-ninth': '89th', 'ninetieth': '90th',
    'ninety-first': '91st', 'ninety-second': '92nd', 'ninety-third': '93rd', 'ninety-fourth': '94th', 'ninety-fifth': '95th',
    'ninety-sixth': '96th', 'ninety-seventh': '97th', 'ninety-eighth': '98th', 'ninety-ninth': '99th', 'one-hundredth': '100th',
  };
  return wordToNum[word] || word;
}

/**
 * Normalize address for matching:
 * - Lowercase and normalize case
 * - Remove extra spaces
 * - Expand abbreviations to full form
 * - Convert ordinal numbers to word form (1st → first, 5Th → fifth)
 */
function normalizeAddress(address: string): string {
  let normalized = address
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    // Remove periods
    .replace(/\./g, '');

  // Step 1: Convert WORD ordinals to numeric form first (fifth → 5th, twenty-first → 21st)
  // This ensures both "Fifth Avenue" and "5th Ave" converge to the same form
  const wordOrdinalPattern = /\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth|twenty-first|twenty-second|twenty-third|twenty-fourth|twenty-fifth|twenty-sixth|twenty-seventh|twenty-eighth|twenty-ninth|thirtieth|thirty-first|thirty-second|thirty-third|thirty-fourth|thirty-fifth|thirty-sixth|thirty-seventh|thirty-eighth|thirty-ninth|fortieth|forty-first|forty-second|forty-third|forty-fourth|forty-fifth|forty-sixth|forty-seventh|forty-eighth|forty-ninth|fiftieth|fifty-first|fifty-second|fifty-third|fifty-fourth|fifty-fifth|fifty-sixth|fifty-seventh|fifty-eighth|fifty-ninth|sixtieth|sixty-first|sixty-second|sixty-third|sixty-fourth|sixty-fifth|sixty-sixth|sixty-seventh|sixty-eighth|sixty-ninth|seventieth|seventy-first|seventy-second|seventy-third|seventy-fourth|seventy-fifth|seventy-sixth|seventy-seventh|seventy-eighth|seventy-ninth|eightieth|eighty-first|eighty-second|eighty-third|eighty-fourth|eighty-fifth|eighty-sixth|eighty-seventh|eighty-eighth|eighty-ninth|ninetieth|ninety-first|ninety-second|ninety-third|ninety-fourth|ninety-fifth|ninety-sixth|ninety-seventh|ninety-eighth|ninety-ninth|one-hundredth)\b/g;
  normalized = normalized.replace(wordOrdinalPattern, match => wordToNumericOrdinal(match));

  // Step 2: Convert ALL numeric ordinals to word form (canonical)
  normalized = normalized.replace(/\b(\d+)(?:st|nd|rd|th)\b/gi, (_, num) => {
    return ordinalToWord(parseInt(num, 10));
  });

  // Expand street suffix abbreviations to full form
  normalized = normalized
    .replace(/\bst\b/g, 'street')
    .replace(/\bave\b/g, 'avenue')
    .replace(/\bblvd\b/g, 'boulevard')
    .replace(/\brd\b/g, 'road')
    .replace(/\bdr\b/g, 'drive')
    .replace(/\bln\b/g, 'lane')
    .replace(/\bpl\b/g, 'place')
    .replace(/\bpkwy\b/g, 'parkway')
    .replace(/\bhwy\b/g, 'highway')
    .replace(/\btpke\b/g, 'turnpike')
    .replace(/\bctr\b/g, 'center')
    .replace(/\bct\b/g, 'court')
    .replace(/\bcir\b/g, 'circle')
    .replace(/\bsq\b/g, 'square')
    .replace(/\bter\b/g, 'terrace')
    .replace(/\bexpy\b/g, 'expressway')
    .replace(/\bfwy\b/g, 'freeway')
    .replace(/\bste\b/g, 'suite')
    .replace(/\bapt\b/g, 'apartment')
    .replace(/\bfl\b/g, 'floor')
    .replace(/\bbldg\b/g, 'building');

  // Expand directional abbreviations to full form
  normalized = normalized
    .replace(/\bw\b/g, 'west')
    .replace(/\be\b/g, 'east')
    .replace(/\bn\b/g, 'north')
    .replace(/\bs\b/g, 'south')
    .replace(/\bnw\b/g, 'northwest')
    .replace(/\bne\b/g, 'northeast')
    .replace(/\bsw\b/g, 'southwest')
    .replace(/\bse\b/g, 'southeast');

  return normalized;
}

function normalizeCity(city: string): string {
  return city.toLowerCase().trim();
}

function normalizeZip(zip: string): string {
  // Take first 5 digits
  return zip.replace(/[^\d]/g, '').slice(0, 5);
}

async function main() {
  const isDryRun = !process.argv.includes('--apply');

  console.log('='.repeat(70));
  console.log('Healthcare Facility Matching Script');
  console.log(isDryRun ? 'MODE: DRY RUN (use --apply to update database)' : 'MODE: APPLYING CHANGES');
  console.log('='.repeat(70));
  console.log();

  // Debug specific addresses
  console.log('DEBUG - Address normalization test:');
  console.log(`  DB:   "1184 5Th Ave" → "${normalizeAddress('1184 5Th Ave')}"`);
  console.log(`  JSON: "1184 Fifth Avenue" → "${normalizeAddress('1184 Fifth Avenue')}"`);
  console.log();

  // Load facilities JSON
  const jsonPath = path.join(__dirname, '..', '..', '..', 'scripts', 'nyc_healthcare_facilities.json');

  if (!fs.existsSync(jsonPath)) {
    console.error(`ERROR: Could not find ${jsonPath}`);
    process.exit(1);
  }

  const data: FacilitiesData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

  // Flatten facilities with health system info
  const facilities: Facility[] = [];
  for (const org of data.organizations) {
    for (const facility of org.facilities) {
      facilities.push({
        ...facility,
        healthSystem: org.healthSystem,
      });
    }
  }

  console.log(`Loaded ${facilities.length} facilities from ${data.organizations.length} health systems`);
  console.log();

  // Build lookup map by normalized address key
  const facilityMap = new Map<string, Facility>();
  for (const facility of facilities) {
    const key = [
      normalizeAddress(facility.address),
      normalizeCity(facility.city),
      facility.state.toUpperCase(),
      normalizeZip(facility.zipCode),
    ].join('|');
    facilityMap.set(key, facility);
  }

  // Get all NY locations from database
  const locations = await prisma.location.findMany({
    where: { state: 'NY' },
    select: {
      id: true,
      addressLine1: true,
      city: true,
      state: true,
      zipCode: true,
      name: true,
      healthSystem: true,
      facilityType: true,
      providerCount: true,
    },
  });

  console.log(`Found ${locations.length} NY locations in database`);
  console.log();

  // Match locations
  const matches: Array<{
    locationId: number;
    currentName: string | null;
    currentHealthSystem: string | null;
    currentFacilityType: string | null;
    newName: string;
    newHealthSystem: string;
    newFacilityType: string;
    address: string;
    city: string;
    providerCount: number;
  }> = [];

  for (const location of locations) {
    const key = [
      normalizeAddress(location.addressLine1),
      normalizeCity(location.city),
      location.state.toUpperCase(),
      normalizeZip(location.zipCode),
    ].join('|');

    const facility = facilityMap.get(key);
    if (facility) {
      matches.push({
        locationId: location.id,
        currentName: location.name,
        currentHealthSystem: location.healthSystem,
        currentFacilityType: location.facilityType,
        newName: facility.name,
        newHealthSystem: facility.healthSystem,
        newFacilityType: facility.facilityType,
        address: location.addressLine1,
        city: location.city,
        providerCount: location.providerCount,
      });
    }
  }

  // Report matches
  console.log('='.repeat(70));
  console.log(`MATCHES FOUND: ${matches.length}`);
  console.log('='.repeat(70));
  console.log();

  if (matches.length === 0) {
    console.log('No matches found.');
    return;
  }

  // Group by health system for summary
  const byHealthSystem = new Map<string, typeof matches>();
  for (const match of matches) {
    const hs = match.newHealthSystem;
    if (!byHealthSystem.has(hs)) {
      byHealthSystem.set(hs, []);
    }
    byHealthSystem.get(hs)!.push(match);
  }

  console.log('Matches by Health System:');
  console.log('-'.repeat(70));
  for (const [hs, hsMatches] of byHealthSystem) {
    const totalProviders = hsMatches.reduce((sum, m) => sum + m.providerCount, 0);
    console.log(`  ${hs}: ${hsMatches.length} locations, ${totalProviders} providers`);
  }
  console.log();

  // Show detailed matches (limited to first 30)
  console.log('Match Details (first 30):');
  console.log('-'.repeat(70));

  const sortedMatches = [...matches].sort((a, b) => b.providerCount - a.providerCount);

  for (const match of sortedMatches.slice(0, 30)) {
    const changes: string[] = [];
    if (match.currentName !== match.newName) {
      changes.push(`name: "${match.currentName || '(none)'}" → "${match.newName}"`);
    }
    if (match.currentHealthSystem !== match.newHealthSystem) {
      changes.push(`healthSystem: "${match.currentHealthSystem || '(none)'}" → "${match.newHealthSystem}"`);
    }
    if (match.currentFacilityType !== match.newFacilityType) {
      changes.push(`facilityType: "${match.currentFacilityType || '(none)'}" → "${match.newFacilityType}"`);
    }

    if (changes.length > 0) {
      console.log(`  [${match.providerCount} providers] ${match.address}, ${match.city}`);
      for (const change of changes) {
        console.log(`    → ${change}`);
      }
    } else {
      console.log(`  [${match.providerCount} providers] ${match.address}, ${match.city} (no changes needed)`);
    }
  }

  if (matches.length > 30) {
    console.log(`  ... and ${matches.length - 30} more matches`);
  }
  console.log();

  // Calculate stats
  const needsUpdate = matches.filter(m =>
    m.currentName !== m.newName ||
    m.currentHealthSystem !== m.newHealthSystem ||
    m.currentFacilityType !== m.newFacilityType
  );

  const totalProviders = matches.reduce((sum, m) => sum + m.providerCount, 0);

  console.log('='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));
  console.log(`  Total matches: ${matches.length} locations`);
  console.log(`  Locations needing updates: ${needsUpdate.length}`);
  console.log(`  Providers affected: ${totalProviders}`);
  console.log();

  // Apply updates if not dry run
  if (!isDryRun && needsUpdate.length > 0) {
    console.log('Applying updates...');

    let updated = 0;
    for (const match of needsUpdate) {
      await prisma.location.update({
        where: { id: match.locationId },
        data: {
          name: match.newName,
          healthSystem: match.newHealthSystem,
          facilityType: match.newFacilityType,
        },
      });
      updated++;

      if (updated % 10 === 0) {
        process.stdout.write(`  Updated ${updated}/${needsUpdate.length}\r`);
      }
    }

    console.log(`  Updated ${updated} locations successfully.`);
  } else if (isDryRun && needsUpdate.length > 0) {
    console.log('To apply these changes, run:');
    console.log('  npx ts-node scripts/match-facilities.ts --apply');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
