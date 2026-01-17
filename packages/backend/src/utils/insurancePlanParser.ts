/**
 * Insurance Plan Parser
 *
 * Parses raw insurance plan names extracted from hospital websites
 * into normalized carrier and variant fields.
 */

export interface ParsedInsurancePlan {
  carrier: string;
  planVariant: string | null;
  rawName: string;
}

/**
 * Carrier name normalization map
 * Maps common abbreviations/variations to canonical carrier names
 */
const CARRIER_ALIASES: Record<string, string> = {
  // Blue Cross Blue Shield variations
  'bcbs': 'Blue Cross Blue Shield',
  'blue cross': 'Blue Cross Blue Shield',
  'blue shield': 'Blue Cross Blue Shield',
  'bluecross': 'Blue Cross Blue Shield',
  'blueshield': 'Blue Cross Blue Shield',
  'empire bcbs': 'Empire Blue Cross Blue Shield',
  'empire blue cross': 'Empire Blue Cross Blue Shield',
  'empire blue cross blue shield': 'Empire Blue Cross Blue Shield',
  'anthem': 'Anthem Blue Cross Blue Shield',
  'anthem bcbs': 'Anthem Blue Cross Blue Shield',

  // UnitedHealthcare variations
  'united': 'UnitedHealthcare',
  'united healthcare': 'UnitedHealthcare',
  'united health': 'UnitedHealthcare',
  'unitedhealth': 'UnitedHealthcare',
  'uhc': 'UnitedHealthcare',
  'oxford': 'Oxford Health Plans (UnitedHealthcare)',

  // Aetna variations
  'aetna': 'Aetna',

  // Cigna variations
  'cigna': 'Cigna',

  // Humana variations
  'humana': 'Humana',

  // Kaiser variations
  'kaiser': 'Kaiser Permanente',
  'kaiser permanente': 'Kaiser Permanente',

  // Healthfirst variations
  'healthfirst': 'Healthfirst',
  'health first': 'Healthfirst',

  // Fidelis variations
  'fidelis': 'Fidelis Care',
  'fidelis care': 'Fidelis Care',

  // Emblem/GHI/HIP variations
  'emblem': 'EmblemHealth',
  'emblemhealth': 'EmblemHealth',
  'ghi': 'EmblemHealth (GHI)',
  'hip': 'EmblemHealth (HIP)',

  // Oscar variations
  'oscar': 'Oscar Health',
  'oscar health': 'Oscar Health',

  // Molina variations
  'molina': 'Molina Healthcare',
  'molina healthcare': 'Molina Healthcare',

  // Wellcare variations
  'wellcare': 'WellCare',

  // Centene/Ambetter variations
  'centene': 'Centene',
  'ambetter': 'Ambetter (Centene)',

  // Medicare/Medicaid
  'medicare': 'Medicare',
  'medicaid': 'Medicaid',

  // Other common carriers
  'tricare': 'TRICARE',
  '1199': '1199SEIU',
  '1199seiu': '1199SEIU',
  'magnacare': 'MagnaCare',
  'multiplan': 'MultiPlan',
  'phcs': 'PHCS',
  'beech street': 'Beech Street',
};

/**
 * Plan variant patterns
 * Order matters - more specific patterns should come first
 */
const VARIANT_PATTERNS: Array<{ pattern: RegExp; variant: string }> = [
  // Medicare variants
  { pattern: /medicare\s*advantage/i, variant: 'Medicare Advantage' },
  { pattern: /medicare\s*supplement/i, variant: 'Medicare Supplement' },
  { pattern: /medigap/i, variant: 'Medigap' },
  { pattern: /medicare/i, variant: 'Medicare' },

  // Medicaid variants
  { pattern: /medicaid/i, variant: 'Medicaid' },
  { pattern: /managed\s*medicaid/i, variant: 'Managed Medicaid' },
  { pattern: /chip/i, variant: 'CHIP' },

  // Plan types
  { pattern: /\bppo\b/i, variant: 'PPO' },
  { pattern: /\bhmo\b/i, variant: 'HMO' },
  { pattern: /\bepo\b/i, variant: 'EPO' },
  { pattern: /\bpos\b/i, variant: 'POS' },
  { pattern: /\bhdhp\b/i, variant: 'HDHP' },
  { pattern: /high\s*deductible/i, variant: 'HDHP' },

  // Market types
  { pattern: /commercial/i, variant: 'Commercial' },
  { pattern: /exchange/i, variant: 'Exchange' },
  { pattern: /marketplace/i, variant: 'Marketplace' },
  { pattern: /individual/i, variant: 'Individual' },
  { pattern: /group/i, variant: 'Group' },
  { pattern: /employer/i, variant: 'Employer' },

  // Special programs
  { pattern: /essential\s*plan/i, variant: 'Essential Plan' },
  { pattern: /child\s*health\s*plus/i, variant: 'Child Health Plus' },
];

/**
 * Extract carrier name from raw plan name
 */
function extractCarrier(rawName: string): string {
  const normalized = rawName.toLowerCase().trim();

  // Check for exact matches first (sorted by length descending for longest match first)
  const sortedAliases = Object.entries(CARRIER_ALIASES)
    .sort((a, b) => b[0].length - a[0].length);

  for (const [alias, carrier] of sortedAliases) {
    if (normalized.includes(alias)) {
      return carrier;
    }
  }

  // If no match, try to extract the first word(s) as the carrier
  // Remove common suffixes/prefixes
  const cleaned = normalized
    .replace(/\s*[-–—]\s*/g, ' ')
    .replace(/\s*(hmo|ppo|epo|pos|medicare|medicaid|commercial|exchange)\s*/gi, ' ')
    .trim();

  // Get the first meaningful word(s)
  const words = cleaned.split(/\s+/);
  if (words.length > 0) {
    // Capitalize first letter of each word
    return words
      .slice(0, 2)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  return rawName.trim();
}

/**
 * Extract plan variant from raw plan name
 */
function extractVariant(rawName: string): string | null {
  for (const { pattern, variant } of VARIANT_PATTERNS) {
    if (pattern.test(rawName)) {
      return variant;
    }
  }
  return null;
}

/**
 * Parse a raw insurance plan name into normalized components
 *
 * @param rawName - The raw plan name as scraped (e.g., "Aetna HMO")
 * @returns Parsed plan with carrier, variant, and original rawName
 *
 * @example
 * parseInsurancePlan("Aetna HMO")
 * // { carrier: "Aetna", planVariant: "HMO", rawName: "Aetna HMO" }
 *
 * parseInsurancePlan("Empire Blue Cross Blue Shield - Medicare")
 * // { carrier: "Empire Blue Cross Blue Shield", planVariant: "Medicare", rawName: "Empire Blue Cross Blue Shield - Medicare" }
 */
export function parseInsurancePlan(rawName: string): ParsedInsurancePlan {
  const trimmed = rawName.trim();

  if (!trimmed) {
    return {
      carrier: 'Unknown',
      planVariant: null,
      rawName: '',
    };
  }

  return {
    carrier: extractCarrier(trimmed),
    planVariant: extractVariant(trimmed),
    rawName: trimmed,
  };
}

/**
 * Generate a unique plan ID from parsed plan data
 * Used for deduplication and lookups
 * Max length: 50 characters (database constraint)
 */
export function generatePlanId(parsed: ParsedInsurancePlan): string {
  const carrierSlug = parsed.carrier
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 30); // Max 30 chars for carrier

  const variantSlug = parsed.planVariant
    ? parsed.planVariant.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 18)
    : 'general';

  return `${carrierSlug}-${variantSlug}`.substring(0, 50);
}

/**
 * Normalize a list of raw plan names
 * Returns deduplicated parsed plans
 */
export function parseInsurancePlans(rawNames: string[]): ParsedInsurancePlan[] {
  const seen = new Set<string>();
  const result: ParsedInsurancePlan[] = [];

  for (const rawName of rawNames) {
    const parsed = parseInsurancePlan(rawName);
    const key = `${parsed.carrier}|${parsed.planVariant || ''}`.toLowerCase();

    if (!seen.has(key)) {
      seen.add(key);
      result.push(parsed);
    }
  }

  return result;
}

/**
 * Split a semicolon-separated list of plans and parse each
 */
export function parsePlanList(planListString: string): ParsedInsurancePlan[] {
  if (!planListString || !planListString.trim()) {
    return [];
  }

  const rawNames = planListString
    .split(/[;,]/)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  return parseInsurancePlans(rawNames);
}
