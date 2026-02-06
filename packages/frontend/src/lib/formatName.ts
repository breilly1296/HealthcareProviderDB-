/**
 * Title-case formatting for NPPES ALL-CAPS provider names and addresses.
 * Display-only — does not modify backend/database data.
 */

const CREDENTIALS = new Set([
  'MD', 'DO', 'PhD', 'PharmD', 'NP', 'PA', 'PA-C', 'RN', 'LPN', 'APRN',
  'LCSW', 'LMHC', 'LMFT', 'LPC', 'LCPC', 'LMSW', 'LSW', 'LICSW',
  'DNP', 'DPM', 'OD', 'DDS', 'DMD', 'DC', 'DPT', 'DrPH', 'PsyD',
  'CNM', 'CRNA', 'CNS', 'AuD', 'SLP', 'CCC-SLP',
  'BCBA', 'BCABA', 'RBT', 'OT', 'OTR', 'PT', 'RD', 'RDN', 'LD', 'CDN',
  'FACP', 'FACS', 'FACOG', 'FAAP', 'FAAN',
  'MBA', 'MPH', 'MS', 'MA', 'MSW', 'MEd',
  'CRC', 'CASAC', 'CADC', 'CDCA', 'CAP', 'MAC',
]);

const SUFFIXES = new Set(['JR', 'SR', 'II', 'III', 'IV', 'V']);

/**
 * Title-case a single word, handling:
 * - Mc/Mac prefixes: "MCDONALD" → "McDonald"
 * - O' prefixes: "O'BRIEN" → "O'Brien"
 * - Hyphenated names: "AADE-GBAMI" → "Aade-Gbami"
 */
function titleCaseWord(word: string): string {
  if (!word) return word;

  // Check for hyphenated names
  if (word.includes('-')) {
    return word.split('-').map(titleCaseWord).join('-');
  }

  const upper = word.toUpperCase();

  // Credentials stay uppercase
  if (CREDENTIALS.has(upper) || CREDENTIALS.has(word)) return upper;

  // Suffixes stay uppercase (II, III, IV) or title case (Jr, Sr)
  if (SUFFIXES.has(upper)) {
    if (upper === 'JR' || upper === 'SR') {
      return upper.charAt(0) + upper.slice(1).toLowerCase();
    }
    return upper;
  }

  const lower = word.toLowerCase();

  // O'prefix: O'BRIEN → O'Brien
  if (lower.length > 2 && lower.startsWith("o'")) {
    return "O'" + lower.charAt(2).toUpperCase() + lower.slice(3);
  }

  // Mc prefix: MCDONALD → McDonald (min 4 chars to avoid false positives)
  if (lower.length >= 4 && lower.startsWith('mc')) {
    return 'Mc' + lower.charAt(2).toUpperCase() + lower.slice(3);
  }

  // Mac prefix: MACDONALD → MacDonald (min 5 chars, exclude common words like "mace", "macro")
  if (lower.length >= 5 && lower.startsWith('mac') && /^mac[a-z]/.test(lower) && !lower.startsWith('mach') && !lower.startsWith('mace') && !lower.startsWith('macr')) {
    return 'Mac' + lower.charAt(3).toUpperCase() + lower.slice(4);
  }

  // Standard title case
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * Convert NPPES ALL-CAPS text to Title Case.
 *
 * Handles credentials (MD, DO), hyphenated names (Aade-Gbami),
 * Irish/Scottish prefixes (McDonald, O'Brien), suffixes (Jr, Sr, III).
 */
export function toTitleCase(str: string | null | undefined): string {
  if (!str) return '';
  // Already mixed case? Return as-is (not all-caps)
  if (str !== str.toUpperCase()) return str;

  return str
    .split(/\s+/)
    .map((word) => titleCaseWord(word))
    .join(' ');
}

/**
 * Format a provider's full name from NPPES fields.
 *
 * Example: ("JOHN", "A", "SMITH", "MD") → "John A. Smith, MD"
 */
export function formatProviderName(
  firstName: string | null | undefined,
  middleName?: string | null,
  lastName?: string | null | undefined,
  credential?: string | null
): string {
  const parts: string[] = [];

  if (firstName) parts.push(toTitleCase(firstName));
  if (middleName) {
    const mid = middleName.trim();
    // Single letter middle initial — add period
    parts.push(mid.length === 1 ? mid.toUpperCase() + '.' : toTitleCase(mid));
  }
  if (lastName) parts.push(toTitleCase(lastName));

  let name = parts.join(' ');

  if (credential) {
    // Credentials: keep uppercase for known ones, title-case otherwise
    const creds = credential
      .split(/[,\s]+/)
      .filter(Boolean)
      .map((c) => (CREDENTIALS.has(c.toUpperCase()) ? c.toUpperCase() : c))
      .join(', ');
    if (creds) name += `, ${creds}`;
  }

  return name;
}

/**
 * Title-case a display name that may contain credentials after a comma.
 *
 * "JOHN SMITH, MD" → "John Smith, MD"
 * "MONTEFIORE MEDICAL CENTER" → "Montefiore Medical Center"
 */
export function toDisplayCase(displayName: string | null | undefined): string {
  if (!displayName) return '';
  if (displayName !== displayName.toUpperCase()) return displayName;

  // Split on first comma to preserve credential portion
  const commaIdx = displayName.indexOf(',');
  if (commaIdx === -1) return toTitleCase(displayName);

  const namePart = displayName.slice(0, commaIdx);
  const credPart = displayName.slice(commaIdx); // includes the comma

  // Title-case the name, keep credentials as-is (they're processed by cleanProviderName)
  return toTitleCase(namePart) + credPart
    .split(/\s+/)
    .map((token) => {
      const stripped = token.replace(/,/g, '');
      if (CREDENTIALS.has(stripped.toUpperCase())) return token; // keep credential tokens
      return token.toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
    })
    .join(' ');
}

/**
 * Title-case an address street line from NPPES ALL-CAPS.
 *
 * "50 E 18TH ST APT E12" → "50 E 18th St Apt E12"
 *
 * Keeps:
 * - Single letters uppercase (directionals: N, S, E, W, NE, NW, SE, SW)
 * - Alphanumeric tokens that start with a letter uppercase (unit numbers like E12)
 * - Pure numbers as-is
 */
export function toAddressCase(str: string | null | undefined): string {
  if (!str) return '';
  if (str !== str.toUpperCase()) return str;

  return str.split(/\s+/).map((word) => {
    // Pure number: keep as-is
    if (/^\d+$/.test(word)) return word;

    // Directional abbreviations: keep uppercase
    if (/^(N|S|E|W|NE|NW|SE|SW)$/.test(word)) return word;

    // Alphanumeric starting with letter (unit like E12, B2): keep uppercase
    if (/^[A-Z]\d+/i.test(word)) return word.toUpperCase();

    // Ordinals: lowercase the suffix (18TH → 18th, 1ST → 1st)
    const ordinalMatch = word.match(/^(\d+)(ST|ND|RD|TH)$/i);
    if (ordinalMatch?.[1] && ordinalMatch[2]) return ordinalMatch[1] + ordinalMatch[2].toLowerCase();

    // Standard title case
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }).join(' ');
}

/**
 * Format a full address from NPPES ALL-CAPS fields.
 * State stays uppercase, everything else is title-cased.
 */
export function formatAddress(
  addressLine1: string | null | undefined,
  city: string | null | undefined,
  state: string | null | undefined,
  zipCode: string | null | undefined
): string {
  const parts: string[] = [];
  if (addressLine1) parts.push(toAddressCase(addressLine1));

  const locale: string[] = [];
  if (city) locale.push(toTitleCase(city));
  if (state) locale.push(state.toUpperCase());
  if (locale.length > 0) {
    let location = locale.join(', ');
    if (zipCode) location += ' ' + zipCode;
    parts.push(location);
  }

  return parts.join(', ');
}
