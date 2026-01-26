/**
 * City Name Normalization Script
 *
 * Normalizes inconsistent city names in the providers table for major metro areas.
 * Handles variations in city names, neighborhoods, and common typos.
 *
 * Supported metros:
 *   - New York City (NY) - boroughs and neighborhoods
 *   - Los Angeles (CA) - neighborhoods and unincorporated areas
 *   - Chicago (IL) - neighborhoods
 *   - Houston (TX) - neighborhoods and surrounding areas
 *   - Phoenix (AZ) - neighborhoods and surrounding cities
 *   - Philadelphia (PA) - neighborhoods
 *
 * Usage:
 *   npx tsx scripts/normalize-city-names.ts                    # DRY RUN (all metros)
 *   npx tsx scripts/normalize-city-names.ts --apply            # Apply changes (all metros)
 *   npx tsx scripts/normalize-city-names.ts --state NY         # Specific state only
 *   npx tsx scripts/normalize-city-names.ts --state NY --apply # Apply for specific state
 */

import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface MetroConfig {
  states: string[];       // State codes this metro belongs to
  primaryCity: string;    // Main city name for the metro
  mappings: Record<string, string>;  // Neighborhood/variation -> normalized name
}

// ============================================================================
// NYC CITY NAME MAPPINGS
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
// LOS ANGELES AREA MAPPINGS (CA)
// ============================================================================

const LA_CITY_MAPPINGS: Record<string, string> = {
  // Main city variations
  'LOS ANGELES': 'Los Angeles',
  'LA': 'Los Angeles',
  'L.A.': 'Los Angeles',
  'L A': 'Los Angeles',
  'LOS ANGELAS': 'Los Angeles',
  'LOS ANGLES': 'Los Angeles',
  'LOSANGELES': 'Los Angeles',
  'LOS  ANGELES': 'Los Angeles',
  'LOS ANGELES CA': 'Los Angeles',
  'LOS ANGELES, CA': 'Los Angeles',

  // LA Neighborhoods (map to Los Angeles)
  'HOLLYWOOD': 'Los Angeles',
  'WEST HOLLYWOOD': 'West Hollywood', // Separate city
  'WEHO': 'West Hollywood',
  'EAST HOLLYWOOD': 'Los Angeles',
  'NORTH HOLLYWOOD': 'Los Angeles',
  'NOHO': 'Los Angeles',
  'STUDIO CITY': 'Los Angeles',
  'SHERMAN OAKS': 'Los Angeles',
  'ENCINO': 'Los Angeles',
  'TARZANA': 'Los Angeles',
  'WOODLAND HILLS': 'Los Angeles',
  'CANOGA PARK': 'Los Angeles',
  'CHATSWORTH': 'Los Angeles',
  'NORTHRIDGE': 'Los Angeles',
  'GRANADA HILLS': 'Los Angeles',
  'PORTER RANCH': 'Los Angeles',
  'SYLMAR': 'Los Angeles',
  'SAN FERNANDO': 'San Fernando', // Separate city
  'PACOIMA': 'Los Angeles',
  'ARLETA': 'Los Angeles',
  'SUN VALLEY': 'Los Angeles',
  'SUNLAND': 'Los Angeles',
  'TUJUNGA': 'Los Angeles',
  'SHADOW HILLS': 'Los Angeles',
  'LA TUNA CANYON': 'Los Angeles',
  'LAKE VIEW TERRACE': 'Los Angeles',
  'PANORAMA CITY': 'Los Angeles',
  'VAN NUYS': 'Los Angeles',
  'VALLEY VILLAGE': 'Los Angeles',
  'RESEDA': 'Los Angeles',
  'LAKE BALBOA': 'Los Angeles',
  'WINNETKA': 'Los Angeles',
  'WEST HILLS': 'Los Angeles',

  // Westside neighborhoods
  'WESTWOOD': 'Los Angeles',
  'BEL AIR': 'Los Angeles',
  'BEL-AIR': 'Los Angeles',
  'BELAIR': 'Los Angeles',
  'BRENTWOOD': 'Los Angeles',
  'PACIFIC PALISADES': 'Los Angeles',
  'MAR VISTA': 'Los Angeles',
  'PALMS': 'Los Angeles',
  'WEST LA': 'Los Angeles',
  'WEST LOS ANGELES': 'Los Angeles',
  'SAWTELLE': 'Los Angeles',
  'CENTURY CITY': 'Los Angeles',
  'CHEVIOT HILLS': 'Los Angeles',
  'RANCHO PARK': 'Los Angeles',
  'PLAYA DEL REY': 'Los Angeles',
  'PLAYA VISTA': 'Los Angeles',
  'MARINA DEL REY': 'Los Angeles',
  'VENICE': 'Los Angeles',
  'VENICE BEACH': 'Los Angeles',

  // South LA neighborhoods
  'SOUTH LA': 'Los Angeles',
  'SOUTH LOS ANGELES': 'Los Angeles',
  'WATTS': 'Los Angeles',
  'COMPTON': 'Compton', // Separate city
  'WILLOWBROOK': 'Los Angeles',
  'FLORENCE': 'Los Angeles',
  'FLORENCE-FIRESTONE': 'Los Angeles',
  'SOUTH CENTRAL': 'Los Angeles',
  'SOUTH CENTRAL LA': 'Los Angeles',
  'HYDE PARK': 'Los Angeles',
  'LEIMERT PARK': 'Los Angeles',
  'BALDWIN HILLS': 'Los Angeles',
  'VIEW PARK': 'Los Angeles',
  'CRENSHAW': 'Los Angeles',
  'JEFFERSON PARK': 'Los Angeles',
  'WEST ADAMS': 'Los Angeles',
  'EXPOSITION PARK': 'Los Angeles',
  'VERMONT SQUARE': 'Los Angeles',
  'VERMONT KNOLLS': 'Los Angeles',
  'HARBOR CITY': 'Los Angeles',
  'HARBOR GATEWAY': 'Los Angeles',
  'WILMINGTON': 'Los Angeles',
  'SAN PEDRO': 'Los Angeles',

  // Central/East LA neighborhoods
  'DOWNTOWN LA': 'Los Angeles',
  'DOWNTOWN LOS ANGELES': 'Los Angeles',
  'DTLA': 'Los Angeles',
  'KOREATOWN': 'Los Angeles',
  'K-TOWN': 'Los Angeles',
  'KTOWN': 'Los Angeles',
  'ECHO PARK': 'Los Angeles',
  'SILVER LAKE': 'Los Angeles',
  'SILVERLAKE': 'Los Angeles',
  'LOS FELIZ': 'Los Angeles',
  'ATWATER VILLAGE': 'Los Angeles',
  'GLASSELL PARK': 'Los Angeles',
  'CYPRESS PARK': 'Los Angeles',
  'HIGHLAND PARK': 'Los Angeles',
  'EAGLE ROCK': 'Los Angeles',
  'MT WASHINGTON': 'Los Angeles',
  'MOUNT WASHINGTON': 'Los Angeles',
  'EL SERENO': 'Los Angeles',
  'LINCOLN HEIGHTS': 'Los Angeles',
  'BOYLE HEIGHTS': 'Los Angeles',
  'EAST LA': 'East Los Angeles', // Unincorporated area
  'EAST LOS ANGELES': 'East Los Angeles',
  'CITY TERRACE': 'Los Angeles',

  // Northeast LA
  'SUNLAND-TUJUNGA': 'Los Angeles',
  'LA CRESCENTA': 'La Crescenta-Montrose', // Unincorporated
  'MONTROSE': 'La Crescenta-Montrose',

  // Separate cities in LA metro (keep as-is but normalize spelling)
  'BEVERLY HILLS': 'Beverly Hills',
  'SANTA MONICA': 'Santa Monica',
  'CULVER CITY': 'Culver City',
  'INGLEWOOD': 'Inglewood',
  'HAWTHORNE': 'Hawthorne',
  'GARDENA': 'Gardena',
  'TORRANCE': 'Torrance',
  'REDONDO BEACH': 'Redondo Beach',
  'HERMOSA BEACH': 'Hermosa Beach',
  'MANHATTAN BEACH CA': 'Manhattan Beach',
  'EL SEGUNDO': 'El Segundo',
  'BURBANK': 'Burbank',
  'GLENDALE': 'Glendale',
  'PASADENA': 'Pasadena',
  'LONG BEACH': 'Long Beach',
  'LONG BEACH CA': 'Long Beach',
  'CARSON': 'Carson',
  'LAKEWOOD': 'Lakewood',
  'DOWNEY': 'Downey',
  'NORWALK': 'Norwalk',
  'CERRITOS': 'Cerritos',
  'WHITTIER': 'Whittier',
  'POMONA': 'Pomona',
  'ARCADIA': 'Arcadia',
  'MONROVIA': 'Monrovia',
  'AZUSA': 'Azusa',
  'COVINA': 'Covina',
  'WEST COVINA': 'West Covina',
  'ALHAMBRA': 'Alhambra',
  'MONTEREY PARK': 'Monterey Park',
  'ROSEMEAD': 'Rosemead',
  'SAN GABRIEL': 'San Gabriel',
  'EL MONTE': 'El Monte',
  'SOUTH EL MONTE': 'South El Monte',
  'HUNTINGTON PARK': 'Huntington Park',
  'BELL': 'Bell',
  'BELL GARDENS': 'Bell Gardens',
  'SOUTH GATE': 'South Gate',
  'LYNWOOD': 'Lynwood',
  'PARAMOUNT': 'Paramount',
  'BELLFLOWER': 'Bellflower',
};

// ============================================================================
// CHICAGO AREA MAPPINGS (IL)
// ============================================================================

const CHICAGO_CITY_MAPPINGS: Record<string, string> = {
  // Main city variations
  'CHICAGO': 'Chicago',
  'CHI': 'Chicago',
  'CHGO': 'Chicago',
  'CHICAO': 'Chicago',
  'CHICGO': 'Chicago',
  'CHICAGP': 'Chicago',
  'CHICAGO IL': 'Chicago',
  'CHICAGO, IL': 'Chicago',

  // Chicago neighborhoods (all map to Chicago)
  'LOOP': 'Chicago',
  'THE LOOP': 'Chicago',
  'NEAR NORTH SIDE': 'Chicago',
  'GOLD COAST': 'Chicago',
  'OLD TOWN': 'Chicago',
  'LINCOLN PARK': 'Chicago',
  'LAKEVIEW': 'Chicago',
  'LAKE VIEW': 'Chicago',
  'WRIGLEYVILLE': 'Chicago',
  'BOYSTOWN': 'Chicago',
  'UPTOWN': 'Chicago',
  'EDGEWATER': 'Chicago',
  'ROGERS PARK': 'Chicago',
  'ANDERSONVILLE': 'Chicago',
  'RAVENSWOOD': 'Chicago',
  'LINCOLN SQUARE': 'Chicago',
  'ALBANY PARK': 'Chicago',
  'NORTH CENTER': 'Chicago',
  'IRVING PARK': 'Chicago',
  'PORTAGE PARK': 'Chicago',
  'JEFFERSON PARK': 'Chicago',
  'NORWOOD PARK': 'Chicago',
  'EDISON PARK': 'Chicago',
  'OHARE': 'Chicago',
  "O'HARE": 'Chicago',

  // West Side neighborhoods
  'WEST LOOP': 'Chicago',
  'WEST TOWN': 'Chicago',
  'WICKER PARK': 'Chicago',
  'BUCKTOWN': 'Chicago',
  'UKRAINIAN VILLAGE': 'Chicago',
  'HUMBOLDT PARK': 'Chicago',
  'LOGAN SQUARE': 'Chicago',
  'AVONDALE': 'Chicago',
  'HERMOSA': 'Chicago',
  'BELMONT CRAGIN': 'Chicago',
  'AUSTIN': 'Chicago',
  'GARFIELD PARK': 'Chicago',
  'EAST GARFIELD PARK': 'Chicago',
  'WEST GARFIELD PARK': 'Chicago',
  'NORTH LAWNDALE': 'Chicago',
  'LITTLE VILLAGE': 'Chicago',
  'SOUTH LAWNDALE': 'Chicago',
  'PILSEN': 'Chicago',
  'LOWER WEST SIDE': 'Chicago',

  // South Side neighborhoods
  'NEAR SOUTH SIDE': 'Chicago',
  'SOUTH LOOP': 'Chicago',
  'CHINATOWN CHI': 'Chicago',
  'BRIDGEPORT': 'Chicago',
  'MCKINLEY PARK': 'Chicago',
  'BRIGHTON PARK': 'Chicago',
  'ARCHER HEIGHTS': 'Chicago',
  'GARFIELD RIDGE': 'Chicago',
  'CLEARING': 'Chicago',
  'WEST LAWN': 'Chicago',
  'CHICAGO LAWN': 'Chicago',
  'WEST ENGLEWOOD': 'Chicago',
  'ENGLEWOOD': 'Chicago',
  'GREATER GRAND CROSSING': 'Chicago',
  'WOODLAWN CHI': 'Chicago',
  'SOUTH SHORE': 'Chicago',
  'HYDE PARK CHI': 'Chicago',
  'KENWOOD': 'Chicago',
  'OAKLAND': 'Chicago',
  'DOUGLAS': 'Chicago',
  'GRAND BOULEVARD': 'Chicago',
  'WASHINGTON PARK CHI': 'Chicago',
  'BRONZEVILLE': 'Chicago',
  'ARMOUR SQUARE': 'Chicago',
  'FULLER PARK': 'Chicago',
  'NEW CITY': 'Chicago',
  'BACK OF THE YARDS': 'Chicago',
  'CANARYVILLE': 'Chicago',
  'GAGE PARK': 'Chicago',
  'MARQUETTE PARK': 'Chicago',
  'ASHBURN': 'Chicago',
  'AUBURN GRESHAM': 'Chicago',
  'BEVERLY': 'Chicago',
  'MOUNT GREENWOOD': 'Chicago',
  'MORGAN PARK': 'Chicago',
  'WASHINGTON HEIGHTS CHI': 'Chicago',
  'ROSELAND': 'Chicago',
  'PULLMAN': 'Chicago',
  'WEST PULLMAN': 'Chicago',
  'RIVERDALE CHI': 'Chicago',
  'HEGEWISCH': 'Chicago',
  'SOUTH CHICAGO': 'Chicago',
  'EAST SIDE CHI': 'Chicago',
  'SOUTH DEERING': 'Chicago',
  'CALUMET HEIGHTS': 'Chicago',
  'AVALON PARK': 'Chicago',
  'CHATHAM': 'Chicago',

  // Separate cities in Chicago metro (normalize spelling)
  'EVANSTON': 'Evanston',
  'OAK PARK': 'Oak Park',
  'CICERO': 'Cicero',
  'BERWYN': 'Berwyn',
  'SKOKIE': 'Skokie',
  'SCHAUMBURG': 'Schaumburg',
  'NAPERVILLE': 'Naperville',
  'AURORA': 'Aurora',
  'JOLIET': 'Joliet',
  'WAUKEGAN': 'Waukegan',
  'ELGIN': 'Elgin',
  'ARLINGTON HEIGHTS': 'Arlington Heights',
  'PALATINE': 'Palatine',
  'DES PLAINES': 'Des Plaines',
  'DOWNERS GROVE': 'Downers Grove',
  'ELMHURST': 'Elmhurst',
  'LOMBARD': 'Lombard',
  'WHEATON': 'Wheaton',
  'GLEN ELLYN': 'Glen Ellyn',
  'OAK LAWN': 'Oak Lawn',
  'ORLAND PARK': 'Orland Park',
  'TINLEY PARK': 'Tinley Park',
  'BOLINGBROOK': 'Bolingbrook',
};

// ============================================================================
// HOUSTON AREA MAPPINGS (TX)
// ============================================================================

const HOUSTON_CITY_MAPPINGS: Record<string, string> = {
  // Main city variations
  'HOUSTON': 'Houston',
  'HUSTON': 'Houston',
  'HOUSTAN': 'Houston',
  'HOUSTIN': 'Houston',
  'HOUSTON TX': 'Houston',
  'HOUSTON, TX': 'Houston',
  'HTX': 'Houston',
  'H-TOWN': 'Houston',

  // Houston neighborhoods/areas (all map to Houston)
  'DOWNTOWN HOUSTON': 'Houston',
  'MIDTOWN HOUSTON': 'Houston',
  'MONTROSE': 'Houston',
  'HEIGHTS': 'Houston',
  'HOUSTON HEIGHTS': 'Houston',
  'THE HEIGHTS': 'Houston',
  'RIVER OAKS': 'Houston',
  'WEST UNIVERSITY': 'Houston',
  'WEST UNIVERSITY PLACE': 'West University Place', // Separate city
  'WEST U': 'West University Place',
  'BELLAIRE': 'Bellaire', // Separate city
  'GALLERIA': 'Houston',
  'UPTOWN HOUSTON': 'Houston',
  'GREENWAY PLAZA': 'Houston',
  'UPPER KIRBY': 'Houston',
  'NEARTOWN': 'Houston',
  'FOURTH WARD': 'Houston',
  'THIRD WARD': 'Houston',
  'FIFTH WARD': 'Houston',
  'SECOND WARD': 'Houston',
  'EAST END': 'Houston',
  'EASTWOOD': 'Houston',
  'MAGNOLIA PARK': 'Houston',
  'DENVER HARBOR': 'Houston',
  'NORTHSIDE': 'Houston',
  'NEAR NORTHSIDE': 'Houston',
  'LINDALE': 'Houston',
  'INDEPENDENCE HEIGHTS': 'Houston',
  'ACRES HOMES': 'Houston',
  'OAK FOREST': 'Houston',
  'GARDEN OAKS': 'Houston',
  'LAZYBROOK': 'Houston',
  'TIMBERGROVE': 'Houston',
  'MEMORIAL': 'Houston',
  'MEMORIAL PARK': 'Houston',
  'SPRING BRANCH': 'Houston',
  'SHARPSTOWN': 'Houston',
  'GULFTON': 'Houston',
  'MEYERLAND': 'Houston',
  'BRAESWOOD': 'Houston',
  'MEDICAL CENTER': 'Houston',
  'TEXAS MEDICAL CENTER': 'Houston',
  'TMC': 'Houston',
  'MUSEUM DISTRICT': 'Houston',
  'RICE VILLAGE': 'Houston',
  'SOUTHAMPTON': 'Houston',
  'AFTON OAKS': 'Houston',
  'TANGLEWOOD': 'Houston',
  'BRIARGROVE': 'Houston',
  'WESTCHASE': 'Houston',
  'ENERGY CORRIDOR': 'Houston',
  'GREATER HEIGHTS': 'Houston',
  'EAST DOWNTOWN': 'Houston',
  'EADO': 'Houston',
  'MIDTOWN': 'Houston',
  'COTTAGE GROVE': 'Houston',
  'PLEASANTVILLE': 'Houston',
  'KASHMERE GARDENS': 'Houston',
  'TRINITY GARDENS': 'Houston',
  'SETTEGAST': 'Houston',
  'SUNNYSIDE': 'Houston',
  'SOUTH PARK': 'Houston',
  'SOUTH ACRES': 'Houston',
  'CRESTMONT PARK': 'Houston',
  'MINNETEX': 'Houston',
  'ALIEF': 'Houston',
  'FONDREN': 'Houston',
  'BRAEBURN': 'Houston',
  'WILLOWBEND': 'Houston',
  'ASTRODOME': 'Houston',
  'RELIANT': 'Houston',
  'GREENWAY': 'Houston',
  'KINGWOOD': 'Houston',
  'CLEAR LAKE': 'Houston',
  'CLEAR LAKE CITY': 'Houston',

  // Separate cities in Houston metro (normalize spelling)
  'PASADENA TX': 'Pasadena',
  'PEARLAND': 'Pearland',
  'SUGAR LAND': 'Sugar Land',
  'SUGARLAND': 'Sugar Land',
  'THE WOODLANDS': 'The Woodlands',
  'WOODLANDS': 'The Woodlands',
  'SPRING': 'Spring',
  'CYPRESS': 'Cypress',
  'KATY': 'Katy',
  'HUMBLE': 'Humble',
  'BAYTOWN': 'Baytown',
  'LEAGUE CITY': 'League City',
  'MISSOURI CITY': 'Missouri City',
  'STAFFORD': 'Stafford',
  'FRIENDSWOOD': 'Friendswood',
  'DEER PARK': 'Deer Park',
  'LA PORTE': 'La Porte',
  'GALVESTON': 'Galveston',
  'TEXAS CITY': 'Texas City',
  'CONROE': 'Conroe',
  'RICHMOND': 'Richmond',
  'ROSENBERG': 'Rosenberg',
  'TOMBALL': 'Tomball',
  'WEBSTER': 'Webster',
  'SEABROOK': 'Seabrook',
  'KEMAH': 'Kemah',
};

// ============================================================================
// PHOENIX AREA MAPPINGS (AZ)
// ============================================================================

const PHOENIX_CITY_MAPPINGS: Record<string, string> = {
  // Main city variations
  'PHOENIX': 'Phoenix',
  'PHEONIX': 'Phoenix',
  'PHENIX': 'Phoenix',
  'PHX': 'Phoenix',
  'PHOENIX AZ': 'Phoenix',
  'PHOENIX, AZ': 'Phoenix',

  // Phoenix neighborhoods/areas (all map to Phoenix)
  'DOWNTOWN PHOENIX': 'Phoenix',
  'CENTRAL PHOENIX': 'Phoenix',
  'MIDTOWN PHOENIX': 'Phoenix',
  'UPTOWN PHOENIX': 'Phoenix',
  'NORTH PHOENIX': 'Phoenix',
  'SOUTH PHOENIX': 'Phoenix',
  'WEST PHOENIX': 'Phoenix',
  'MARYVALE': 'Phoenix',
  'ALHAMBRA AZ': 'Phoenix',
  'ENCANTO': 'Phoenix',
  'CAMELBACK EAST': 'Phoenix',
  'BILTMORE': 'Phoenix',
  'ARCADIA AZ': 'Phoenix',
  'PARADISE VALLEY VILLAGE': 'Phoenix',
  'NORTH GATEWAY': 'Phoenix',
  'DEER VALLEY': 'Phoenix',
  'NORTH MOUNTAIN': 'Phoenix',
  'SUNNYSLOPE': 'Phoenix',
  'LAVEEN': 'Phoenix',
  'SOUTH MOUNTAIN': 'Phoenix',
  'AHWATUKEE': 'Phoenix',
  'AHWATUKEE FOOTHILLS': 'Phoenix',
  'ESTRELLA': 'Phoenix',
  'DESERT VIEW': 'Phoenix',
  'RIO VISTA': 'Phoenix',

  // Separate cities in Phoenix metro (normalize spelling)
  'SCOTTSDALE': 'Scottsdale',
  'TEMPE': 'Tempe',
  'MESA': 'Mesa',
  'CHANDLER': 'Chandler',
  'GILBERT': 'Gilbert',
  'GLENDALE AZ': 'Glendale',
  'PEORIA': 'Peoria',
  'SURPRISE': 'Surprise',
  'AVONDALE': 'Avondale',
  'GOODYEAR': 'Goodyear',
  'BUCKEYE': 'Buckeye',
  'LITCHFIELD PARK': 'Litchfield Park',
  'TOLLESON': 'Tolleson',
  'CAVE CREEK': 'Cave Creek',
  'CAREFREE': 'Carefree',
  'FOUNTAIN HILLS': 'Fountain Hills',
  'PARADISE VALLEY': 'Paradise Valley', // Separate town
  'QUEEN CREEK': 'Queen Creek',
  'SAN TAN VALLEY': 'San Tan Valley',
  'APACHE JUNCTION': 'Apache Junction',
  'GOLD CANYON': 'Gold Canyon',
  'ANTHEM': 'Phoenix', // Part of Phoenix
  'DESERT RIDGE': 'Phoenix',
  'NORTERRA': 'Phoenix',
};

// ============================================================================
// PHILADELPHIA AREA MAPPINGS (PA)
// ============================================================================

const PHILADELPHIA_CITY_MAPPINGS: Record<string, string> = {
  // Main city variations
  'PHILADELPHIA': 'Philadelphia',
  'PHILA': 'Philadelphia',
  'PHILLY': 'Philadelphia',
  'PHILDELPHIA': 'Philadelphia',
  'PHILADEPHIA': 'Philadelphia',
  'PHILIDELPHIA': 'Philadelphia',
  'PHILLADELPHIA': 'Philadelphia',
  'PHILADELPHIA PA': 'Philadelphia',
  'PHILADELPHIA, PA': 'Philadelphia',
  'PHL': 'Philadelphia',

  // Philadelphia neighborhoods (all map to Philadelphia)
  'CENTER CITY': 'Philadelphia',
  'CENTER CITY PHILADELPHIA': 'Philadelphia',
  'OLD CITY': 'Philadelphia',
  'SOCIETY HILL': 'Philadelphia',
  'WASHINGTON SQUARE WEST': 'Philadelphia',
  'RITTENHOUSE': 'Philadelphia',
  'RITTENHOUSE SQUARE': 'Philadelphia',
  'LOGAN SQUARE PHILLY': 'Philadelphia',
  'FAIRMOUNT': 'Philadelphia',
  'SPRING GARDEN': 'Philadelphia',
  'NORTHERN LIBERTIES': 'Philadelphia',
  'FISHTOWN': 'Philadelphia',
  'KENSINGTON': 'Philadelphia',
  'PORT RICHMOND': 'Philadelphia',
  'BRIDESBURG': 'Philadelphia',
  'FRANKFORD': 'Philadelphia',
  'MAYFAIR': 'Philadelphia',
  'HOLMESBURG': 'Philadelphia',
  'TACONY': 'Philadelphia',
  'TORRESDALE': 'Philadelphia',
  'NORTHEAST PHILADELPHIA': 'Philadelphia',
  'NORTHEAST PHILLY': 'Philadelphia',
  'BUSTLETON': 'Philadelphia',
  'SOMERTON': 'Philadelphia',
  'BYBERRY': 'Philadelphia',
  'OXFORD CIRCLE': 'Philadelphia',
  'RHAWNHURST': 'Philadelphia',
  'FOX CHASE': 'Philadelphia',
  'BURHOLME': 'Philadelphia',
  'LAWNCREST': 'Philadelphia',
  'LAWNDALE PHILLY': 'Philadelphia',
  'CRESCENTVILLE': 'Philadelphia',
  'FELTONVILLE': 'Philadelphia',
  'OLNEY': 'Philadelphia',
  'LOGAN': 'Philadelphia',
  'FERN ROCK': 'Philadelphia',
  'OGONTZ': 'Philadelphia',
  'EAST OAK LANE': 'Philadelphia',
  'WEST OAK LANE': 'Philadelphia',
  'GERMANTOWN': 'Philadelphia',
  'MT AIRY': 'Philadelphia',
  'MOUNT AIRY': 'Philadelphia',
  'CHESTNUT HILL': 'Philadelphia',
  'ROXBOROUGH': 'Philadelphia',
  'MANAYUNK': 'Philadelphia',
  'WISSAHICKON': 'Philadelphia',
  'EAST FALLS': 'Philadelphia',
  'STRAWBERRY MANSION': 'Philadelphia',
  'BREWERYTOWN': 'Philadelphia',
  'NORTH PHILADELPHIA': 'Philadelphia',
  'NORTH PHILLY': 'Philadelphia',
  'TEMPLE UNIVERSITY': 'Philadelphia',
  'TIOGA': 'Philadelphia',
  'NICETOWN': 'Philadelphia',
  'HUNTING PARK': 'Philadelphia',
  'WEST PHILADELPHIA': 'Philadelphia',
  'WEST PHILLY': 'Philadelphia',
  'UNIVERSITY CITY': 'Philadelphia',
  'POWELTON': 'Philadelphia',
  'SPRUCE HILL': 'Philadelphia',
  'CEDAR PARK': 'Philadelphia',
  'SQUIRREL HILL': 'Philadelphia',
  'COBBS CREEK': 'Philadelphia',
  'OVERBROOK': 'Philadelphia',
  'WYNNEFIELD': 'Philadelphia',
  'WYNNEFIELD HEIGHTS': 'Philadelphia',
  'PARKSIDE': 'Philadelphia',
  'HADDINGTON': 'Philadelphia',
  'CARROLL PARK': 'Philadelphia',
  'SOUTH PHILADELPHIA': 'Philadelphia',
  'SOUTH PHILLY': 'Philadelphia',
  'PASSYUNK': 'Philadelphia',
  'EAST PASSYUNK': 'Philadelphia',
  'PENNSPORT': 'Philadelphia',
  'QUEENS VILLAGE': 'Philadelphia',
  'BELLA VISTA': 'Philadelphia',
  'ITALIAN MARKET': 'Philadelphia',
  'HAWTHORNE': 'Philadelphia',
  'POINT BREEZE': 'Philadelphia',
  'GRAYS FERRY': 'Philadelphia',
  'SOUTHWEST PHILADELPHIA': 'Philadelphia',
  'SOUTHWEST PHILLY': 'Philadelphia',
  'EASTWICK': 'Philadelphia',
  'ELMWOOD': 'Philadelphia',
  'KINGSESSING': 'Philadelphia',
  'SOUTHWEST CENTER CITY': 'Philadelphia',
  'GRADUATE HOSPITAL': 'Philadelphia',
  'WHITMAN': 'Philadelphia',
  'GIRARD ESTATES': 'Philadelphia',
  'PACKER PARK': 'Philadelphia',
  'STADIUM DISTRICT': 'Philadelphia',

  // Separate cities in Philadelphia metro (normalize spelling)
  'CAMDEN': 'Camden', // NJ but commonly included
  'CHERRY HILL': 'Cherry Hill', // NJ
  'UPPER DARBY': 'Upper Darby',
  'CHESTER': 'Chester',
  'NORRISTOWN': 'Norristown',
  'KING OF PRUSSIA': 'King of Prussia',
  'CONSHOHOCKEN': 'Conshohocken',
  'ARDMORE': 'Ardmore',
  'BRYN MAWR': 'Bryn Mawr',
  'HAVERFORD': 'Haverford',
  'WAYNE': 'Wayne',
  'MEDIA': 'Media',
  'LANSDALE': 'Lansdale',
  'DOYLESTOWN': 'Doylestown',
  'WILLOW GROVE': 'Willow Grove',
  'JENKINTOWN': 'Jenkintown',
  'ABINGTON': 'Abington',
  'ELKINS PARK': 'Elkins Park',
  'BENSALEM': 'Bensalem',
  'BRISTOL': 'Bristol',
  'LEVITTOWN': 'Levittown',
  'NEWTOWN': 'Newtown',
  'WEST CHESTER': 'West Chester',
  'COATESVILLE': 'Coatesville',
  'EXTON': 'Exton',
  'MALVERN': 'Malvern',
  'PHOENIXVILLE': 'Phoenixville',
  'POTTSTOWN': 'Pottstown',
};

// ============================================================================
// METRO CONFIGURATIONS
// ============================================================================

const METRO_CONFIGS: Record<string, MetroConfig> = {
  NYC: {
    states: ['NY'],
    primaryCity: 'New York',
    mappings: NYC_CITY_MAPPINGS,
  },
  LA: {
    states: ['CA'],
    primaryCity: 'Los Angeles',
    mappings: LA_CITY_MAPPINGS,
  },
  CHICAGO: {
    states: ['IL'],
    primaryCity: 'Chicago',
    mappings: CHICAGO_CITY_MAPPINGS,
  },
  HOUSTON: {
    states: ['TX'],
    primaryCity: 'Houston',
    mappings: HOUSTON_CITY_MAPPINGS,
  },
  PHOENIX: {
    states: ['AZ'],
    primaryCity: 'Phoenix',
    mappings: PHOENIX_CITY_MAPPINGS,
  },
  PHILADELPHIA: {
    states: ['PA'],
    primaryCity: 'Philadelphia',
    mappings: PHILADELPHIA_CITY_MAPPINGS,
  },
};

// Map state codes to their metro configs
const STATE_TO_METRO: Record<string, MetroConfig> = {};
for (const config of Object.values(METRO_CONFIGS)) {
  for (const state of config.states) {
    STATE_TO_METRO[state] = config;
  }
}

// All supported states
const SUPPORTED_STATES = Object.keys(STATE_TO_METRO);

// ============================================================================
// CLEANUP PATTERNS
// ============================================================================

// Patterns to clean from city names before mapping
const CLEANUP_PATTERNS: [RegExp, string][] = [
  // Remove trailing state codes (common patterns)
  [/,\s*NY$/i, ''],
  [/,\s*CA$/i, ''],
  [/,\s*IL$/i, ''],
  [/,\s*TX$/i, ''],
  [/,\s*AZ$/i, ''],
  [/,\s*PA$/i, ''],
  [/,\s*NJ$/i, ''],
  [/\s+(NY|CA|IL|TX|AZ|PA|NJ)$/i, ''],
  [/,\s*NEW YORK$/i, ''],
  [/,\s*CALIFORNIA$/i, ''],
  [/,\s*ILLINOIS$/i, ''],
  [/,\s*TEXAS$/i, ''],
  [/,\s*ARIZONA$/i, ''],
  [/,\s*PENNSYLVANIA$/i, ''],
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

function normalizeCity(city: string, state: string): string | null {
  if (!city || !state) return null;

  const cleaned = cleanCityName(city);

  // Get the metro config for this state
  const metroConfig = STATE_TO_METRO[state.toUpperCase()];
  if (!metroConfig) return null;

  // Direct lookup in the state's metro mappings
  if (metroConfig.mappings[cleaned]) {
    return metroConfig.mappings[cleaned];
  }

  return null; // No normalization needed or unknown
}

/**
 * Exportable city normalization function for use in other scripts
 */
export function normalizeCityName(city: string, state: string): string {
  const normalized = normalizeCity(city, state);
  return normalized || city; // Return original if no normalization found
}

// ============================================================================
// MAIN SCRIPT
// ============================================================================

interface CityStats {
  city: string;
  state: string;
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
    state: string;
    count: number;
  }[];
  afterStats?: {
    totalRecords: number;
    uniqueCities: number;
    cities: CityStats[];
  };
}

async function analyzeCityData(pool: pg.Pool, states: string[]): Promise<NormalizationResult['beforeStats']> {
  const stateList = states.map(s => `'${s}'`).join(', ');
  console.log(`\n📊 Analyzing current city data for states: ${states.join(', ')}...\n`);

  const result = await pool.query(`
    SELECT city, state, COUNT(*) as count
    FROM providers
    WHERE state IN (${stateList})
    GROUP BY city, state
    ORDER BY count DESC
  `);

  const cities: CityStats[] = result.rows.map((row: { city: string; state: string; count: string }) => ({
    city: row.city,
    state: row.state,
    count: parseInt(row.count),
    normalizedTo: normalizeCity(row.city, row.state),
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
        state: city.state,
        count: city.count,
      });
    }
  }

  // Sort by state, then count descending
  changes.sort((a, b) => {
    if (a.state !== b.state) return a.state.localeCompare(b.state);
    return b.count - a.count;
  });

  return changes;
}

async function applyChanges(pool: pg.Pool, changes: NormalizationResult['changes']): Promise<number> {
  console.log('\n🔄 Applying changes in transaction...\n');

  const client = await pool.connect();
  let totalUpdated = 0;
  let currentState = '';

  try {
    await client.query('BEGIN');

    for (const change of changes) {
      // Print state header when it changes
      if (change.state !== currentState) {
        currentState = change.state;
        console.log(`\n  [${currentState}]`);
      }

      const result = await client.query(`
        UPDATE providers
        SET city = $1
        WHERE state = $2 AND city = $3
      `, [change.toCity, change.state, change.fromCity]);

      totalUpdated += result.rowCount || 0;
      console.log(`    ✓ "${change.fromCity}" → "${change.toCity}" (${result.rowCount} records)`);
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

function printStats(label: string, stats: NormalizationResult['beforeStats'], states: string[]) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`${label}`);
  console.log('='.repeat(80));
  console.log(`States: ${states.join(', ')}`);
  console.log(`Total records: ${stats.totalRecords.toLocaleString()}`);
  console.log(`Unique city/state combinations: ${stats.uniqueCities}`);
  console.log('\nTop 40 city names by frequency:');
  console.log('-'.repeat(70));

  const topCities = stats.cities.slice(0, 40);
  for (const city of topCities) {
    const normalized = city.normalizedTo && city.normalizedTo !== city.city
      ? ` → ${city.normalizedTo}`
      : '';
    const cityState = `${city.city} (${city.state})`;
    console.log(`  ${cityState.padEnd(40)} ${city.count.toLocaleString().padStart(8)}${normalized}`);
  }

  if (stats.cities.length > 40) {
    console.log(`  ... and ${stats.cities.length - 40} more unique city/state combinations`);
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

  // Group by state, then by target city
  const byState: Record<string, Record<string, typeof changes>> = {};
  for (const change of changes) {
    if (!byState[change.state]) {
      byState[change.state] = {};
    }
    if (!byState[change.state][change.toCity]) {
      byState[change.state][change.toCity] = [];
    }
    byState[change.state][change.toCity].push(change);
  }

  for (const [state, byTarget] of Object.entries(byState).sort()) {
    const stateTotal = Object.values(byTarget).flat().reduce((sum, c) => sum + c.count, 0);
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`[${state}] - ${stateTotal.toLocaleString()} records to update`);
    console.log('─'.repeat(60));

    for (const [target, sourceChanges] of Object.entries(byTarget)) {
      const totalForTarget = sourceChanges.reduce((sum, c) => sum + c.count, 0);
      console.log(`\n  → "${target}" (${totalForTarget.toLocaleString()} records):`);

      // Sort by count and show top entries
      const sorted = sourceChanges.sort((a, b) => b.count - a.count);
      const toShow = sorted.slice(0, 10);

      for (const change of toShow) {
        console.log(`      "${change.fromCity}" (${change.count.toLocaleString()})`);
      }

      if (sorted.length > 10) {
        console.log(`      ... and ${sorted.length - 10} more variations`);
      }
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const applyMode = args.includes('--apply');
  const helpMode = args.includes('--help') || args.includes('-h');

  // Parse --state argument
  const stateIndex = args.findIndex(a => a === '--state' || a === '-s');
  let targetStates: string[] = SUPPORTED_STATES;

  if (stateIndex !== -1 && args[stateIndex + 1]) {
    const requestedState = args[stateIndex + 1].toUpperCase();
    if (!SUPPORTED_STATES.includes(requestedState)) {
      console.error(`\n❌ Error: Unsupported state "${requestedState}"`);
      console.error(`   Supported states: ${SUPPORTED_STATES.join(', ')}`);
      process.exit(1);
    }
    targetStates = [requestedState];
  }

  if (helpMode) {
    console.log(`
City Name Normalization Script

Normalizes inconsistent city names in the providers table for major metro areas.

Usage:
  npx tsx scripts/normalize-city-names.ts [options]

Options:
  --apply           Apply changes (default is dry run)
  --state, -s STATE Only process specific state (e.g., --state NY)
  --help, -h        Show this help message

Supported States:
  ${SUPPORTED_STATES.join(', ')}

Examples:
  npx tsx scripts/normalize-city-names.ts                # Dry run for all states
  npx tsx scripts/normalize-city-names.ts --apply        # Apply changes for all states
  npx tsx scripts/normalize-city-names.ts --state CA     # Dry run for California only
  npx tsx scripts/normalize-city-names.ts -s TX --apply  # Apply changes for Texas only
`);
    process.exit(0);
  }

  console.log('\n' + '═'.repeat(80));
  console.log('CITY NAME NORMALIZATION SCRIPT');
  console.log('═'.repeat(80));
  console.log(`\nMetros: NYC, LA, Chicago, Houston, Phoenix, Philadelphia`);
  console.log(`Target states: ${targetStates.join(', ')}`);

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
    const beforeStats = await analyzeCityData(pool, targetStates);
    printStats('BEFORE NORMALIZATION', beforeStats, targetStates);

    // Calculate changes
    const changes = await previewChanges(beforeStats);
    printChanges(changes);

    if (applyMode && changes.length > 0) {
      // Apply changes
      await applyChanges(pool, changes);

      // Analyze after state
      const afterStats = await analyzeCityData(pool, targetStates);
      printStats('AFTER NORMALIZATION', afterStats, targetStates);

      // Summary
      console.log(`\n${'='.repeat(80)}`);
      console.log('SUMMARY');
      console.log('='.repeat(80));
      console.log(`  Unique city/state combos BEFORE: ${beforeStats.uniqueCities}`);
      console.log(`  Unique city/state combos AFTER:  ${afterStats.uniqueCities}`);
      console.log(`  Reduction: ${beforeStats.uniqueCities - afterStats.uniqueCities} fewer unique values`);

    } else if (!applyMode && changes.length > 0) {
      console.log(`\n${'='.repeat(80)}`);
      console.log('DRY RUN COMPLETE');
      console.log('='.repeat(80));
      const stateArg = targetStates.length === 1 ? ` --state ${targetStates[0]}` : '';
      console.log(`\nTo apply these changes, run:`);
      console.log(`  npx tsx scripts/normalize-city-names.ts${stateArg} --apply\n`);
    }

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
