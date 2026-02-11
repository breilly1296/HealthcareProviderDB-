import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { queryClient } from '../lib/queryClient';
import type { CityData } from '../types';

// ============================================================================
// NYC All Boroughs Configuration
// ============================================================================

/**
 * Special value for selecting all NYC boroughs at once
 */
export const NYC_ALL_BOROUGHS_VALUE = 'NYC_ALL_BOROUGHS';

/**
 * The 5 NYC boroughs
 */
export const NYC_BOROUGHS = ['New York', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island'];

// ============================================================================
// Pinned Cities Configuration
// ============================================================================

/**
 * Major cities to pin to the top of the dropdown for each state.
 * These appear first (in order specified), followed by remaining cities alphabetically.
 */
const PINNED_CITIES: Record<string, string[]> = {
  'NY': ['New York', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island', 'Buffalo', 'Rochester', 'Albany'],
  'CA': ['Los Angeles', 'San Francisco', 'San Diego', 'San Jose', 'Sacramento', 'Oakland', 'Fresno'],
  'FL': ['Miami', 'Orlando', 'Tampa', 'Jacksonville', 'Fort Lauderdale', 'West Palm Beach', 'St. Petersburg'],
  'TX': ['Houston', 'Dallas', 'Austin', 'San Antonio', 'Fort Worth', 'El Paso', 'Arlington'],
  'PA': ['Philadelphia', 'Pittsburgh', 'Allentown', 'Erie', 'Reading', 'Scranton'],
  'IL': ['Chicago', 'Aurora', 'Naperville', 'Rockford', 'Joliet', 'Springfield'],
  'OH': ['Columbus', 'Cleveland', 'Cincinnati', 'Toledo', 'Akron', 'Dayton'],
  'GA': ['Atlanta', 'Augusta', 'Columbus', 'Savannah', 'Athens', 'Macon'],
  'NC': ['Charlotte', 'Raleigh', 'Greensboro', 'Durham', 'Winston-Salem', 'Fayetteville'],
  'MI': ['Detroit', 'Grand Rapids', 'Warren', 'Sterling Heights', 'Ann Arbor', 'Lansing'],
  'NJ': ['Newark', 'Jersey City', 'Paterson', 'Elizabeth', 'Trenton', 'Camden'],
  'VA': ['Virginia Beach', 'Norfolk', 'Chesapeake', 'Richmond', 'Newport News', 'Alexandria'],
  'WA': ['Seattle', 'Spokane', 'Tacoma', 'Vancouver', 'Bellevue', 'Everett'],
  'AZ': ['Phoenix', 'Tucson', 'Mesa', 'Chandler', 'Scottsdale', 'Glendale'],
  'MA': ['Boston', 'Worcester', 'Springfield', 'Cambridge', 'Lowell', 'Brockton'],
  'TN': ['Nashville', 'Memphis', 'Knoxville', 'Chattanooga', 'Clarksville', 'Murfreesboro'],
  'IN': ['Indianapolis', 'Fort Wayne', 'Evansville', 'South Bend', 'Carmel', 'Bloomington'],
  'MO': ['Kansas City', 'St. Louis', 'Springfield', 'Columbia', 'Independence'],
  'MD': ['Baltimore', 'Frederick', 'Rockville', 'Gaithersburg', 'Bowie', 'Hagerstown'],
  'WI': ['Milwaukee', 'Madison', 'Green Bay', 'Kenosha', 'Racine', 'Appleton'],
  'CO': ['Denver', 'Colorado Springs', 'Aurora', 'Fort Collins', 'Lakewood', 'Boulder'],
  'MN': ['Minneapolis', 'St. Paul', 'Rochester', 'Duluth', 'Bloomington', 'Brooklyn Park'],
  'SC': ['Charleston', 'Columbia', 'North Charleston', 'Mount Pleasant', 'Rock Hill', 'Greenville'],
  'AL': ['Birmingham', 'Montgomery', 'Huntsville', 'Mobile', 'Tuscaloosa', 'Hoover'],
  'LA': ['New Orleans', 'Baton Rouge', 'Shreveport', 'Metairie', 'Lafayette', 'Lake Charles'],
  'KY': ['Louisville', 'Lexington', 'Bowling Green', 'Owensboro', 'Covington'],
  'OR': ['Portland', 'Salem', 'Eugene', 'Gresham', 'Hillsboro', 'Beaverton'],
  'OK': ['Oklahoma City', 'Tulsa', 'Norman', 'Broken Arrow', 'Edmond', 'Lawton'],
  'CT': ['Bridgeport', 'New Haven', 'Stamford', 'Hartford', 'Waterbury', 'Norwalk'],
  'UT': ['Salt Lake City', 'West Valley City', 'Provo', 'West Jordan', 'Orem', 'Sandy'],
  'NV': ['Las Vegas', 'Henderson', 'Reno', 'North Las Vegas', 'Sparks', 'Carson City'],
  'AR': ['Little Rock', 'Fort Smith', 'Fayetteville', 'Springdale', 'Jonesboro'],
  'MS': ['Jackson', 'Gulfport', 'Southaven', 'Hattiesburg', 'Biloxi'],
  'KS': ['Wichita', 'Overland Park', 'Kansas City', 'Olathe', 'Topeka', 'Lawrence'],
  'NM': ['Albuquerque', 'Las Cruces', 'Rio Rancho', 'Santa Fe', 'Roswell'],
  'NE': ['Omaha', 'Lincoln', 'Bellevue', 'Grand Island', 'Kearney'],
  'ID': ['Boise', 'Meridian', 'Nampa', 'Idaho Falls', 'Pocatello'],
  'WV': ['Charleston', 'Huntington', 'Morgantown', 'Parkersburg', 'Wheeling'],
  'HI': ['Honolulu', 'Pearl City', 'Hilo', 'Kailua', 'Waipahu'],
  'NH': ['Manchester', 'Nashua', 'Concord', 'Derry', 'Dover'],
  'ME': ['Portland', 'Lewiston', 'Bangor', 'South Portland', 'Auburn'],
  'RI': ['Providence', 'Warwick', 'Cranston', 'Pawtucket', 'East Providence'],
  'MT': ['Billings', 'Missoula', 'Great Falls', 'Bozeman', 'Butte'],
  'DE': ['Wilmington', 'Dover', 'Newark', 'Middletown', 'Smyrna'],
  'SD': ['Sioux Falls', 'Rapid City', 'Aberdeen', 'Brookings', 'Watertown'],
  'ND': ['Fargo', 'Bismarck', 'Grand Forks', 'Minot', 'West Fargo'],
  'AK': ['Anchorage', 'Fairbanks', 'Juneau', 'Sitka', 'Ketchikan'],
  'VT': ['Burlington', 'South Burlington', 'Rutland', 'Barre', 'Montpelier'],
  'WY': ['Cheyenne', 'Casper', 'Laramie', 'Gillette', 'Rock Springs'],
};

/**
 * Reorder cities to put pinned cities first, followed by remaining cities alphabetically.
 * Only includes pinned cities that exist in the fetched list.
 */
function reorderCitiesWithPinned(cities: CityData[], state: string): CityData[] {
  const stateKey = state.toUpperCase();
  const pinnedList = PINNED_CITIES[stateKey] || [];

  if (pinnedList.length === 0) {
    return [...cities].sort((a, b) => a.city.localeCompare(b.city));
  }

  const citySet = new Set(cities.map(c => c.city));

  const pinnedCities: CityData[] = [];
  for (const cityName of pinnedList) {
    if (citySet.has(cityName)) {
      pinnedCities.push({ city: cityName, state });
    }
  }

  const pinnedSet = new Set(pinnedList);
  const remainingCities = cities
    .filter(c => !pinnedSet.has(c.city))
    .sort((a, b) => a.city.localeCompare(b.city));

  return [...pinnedCities, ...remainingCities];
}

/**
 * Inject NYC All Boroughs option at position 0 for NY state
 */
function injectNycAllBoroughsOption(cities: CityData[], state: string): CityData[] {
  if (state.toUpperCase() !== 'NY') {
    return cities;
  }

  const cityNames = new Set(cities.map(c => c.city));
  const hasAllBoroughs = NYC_BOROUGHS.every(borough => cityNames.has(borough));

  if (!hasAllBoroughs) {
    return cities;
  }

  return [{ city: NYC_ALL_BOROUGHS_VALUE, state }, ...cities];
}

// ============================================================================
// Query Key Factory
// ============================================================================

export const cityKeys = {
  all: ['cities'] as const,
  list: (state?: string) => [...cityKeys.all, state?.toUpperCase() || ''] as const,
};

// ============================================================================
// Query Function
// ============================================================================

async function fetchCities(state: string): Promise<CityData[]> {
  const response = await api.providers.getCities(state);
  const rawCities: CityData[] = response.cities.map((city) => ({
    city,
    state,
  }));

  const reorderedCities = reorderCitiesWithPinned(rawCities, state);
  return injectNycAllBoroughsOption(reorderedCities, state);
}

// ============================================================================
// Cache Utilities
// ============================================================================

/**
 * Clear all cached cities data
 */
export function clearCitiesCache(): void {
  queryClient.invalidateQueries({ queryKey: cityKeys.all });
}

/**
 * Prefetch cities for a state (useful for preloading on hover)
 */
export async function prefetchCities(state: string): Promise<CityData[]> {
  if (!state) return [];
  return queryClient.fetchQuery({
    queryKey: cityKeys.list(state),
    queryFn: () => fetchCities(state),
  });
}

// ============================================================================
// Hook
// ============================================================================

interface UseCitiesResult {
  cities: CityData[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useCities(state: string | undefined): UseCitiesResult {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<CityData[], Error>({
    queryKey: cityKeys.list(state),
    queryFn: () => fetchCities(state!),
    enabled: !!state,
  });

  return {
    cities: data ?? [],
    isLoading,
    error: error ?? null,
    refetch: async () => {
      await queryClient.invalidateQueries({ queryKey: cityKeys.list(state) });
    },
  };
}

export default useCities;
