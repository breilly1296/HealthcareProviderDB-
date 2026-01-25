import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../lib/api';
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
    // No pinned cities for this state, return alphabetically sorted
    return [...cities].sort((a, b) => a.city.localeCompare(b.city));
  }

  // Create a set of city names for quick lookup
  const citySet = new Set(cities.map(c => c.city));

  // Get pinned cities that exist in the fetched list
  const pinnedCities: CityData[] = [];
  for (const cityName of pinnedList) {
    if (citySet.has(cityName)) {
      pinnedCities.push({ city: cityName, state });
    }
  }

  // Get remaining cities (not in pinned list), sorted alphabetically
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

  // Check if all 5 NYC boroughs exist in the city list
  const cityNames = new Set(cities.map(c => c.city));
  const hasAllBoroughs = NYC_BOROUGHS.every(borough => cityNames.has(borough));

  if (!hasAllBoroughs) {
    return cities;
  }

  // Inject the special option at position 0
  return [{ city: NYC_ALL_BOROUGHS_VALUE, state }, ...cities];
}

// ============================================================================
// Cache Configuration
// ============================================================================

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  cities: CityData[];
  timestamp: number;
}

// Module-level cache and pending requests tracker
const citiesCache = new Map<string, CacheEntry>();
const pendingRequests = new Map<string, Promise<CityData[]>>();

// ============================================================================
// Cache Utilities
// ============================================================================

/**
 * Clear all cached cities data
 */
export function clearCitiesCache(): void {
  citiesCache.clear();
}

/**
 * Prefetch cities for a state (useful for preloading on hover)
 */
export async function prefetchCities(state: string): Promise<CityData[]> {
  if (!state) return [];

  const cacheKey = state.toUpperCase();

  // Check cache first
  const cached = citiesCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.cities;
  }

  // Check if request is already in flight
  const pending = pendingRequests.get(cacheKey);
  if (pending) {
    return pending;
  }

  // Make the request
  const requestPromise = (async () => {
    try {
      const response = await api.providers.getCities(state);
      const rawCities: CityData[] = response.cities.map((city) => ({
        city,
        state,
      }));

      // Reorder with pinned cities first
      const reorderedCities = reorderCitiesWithPinned(rawCities, state);

      // Inject NYC All Boroughs option for NY state
      const cities = injectNycAllBoroughsOption(reorderedCities, state);

      // Cache the result
      citiesCache.set(cacheKey, {
        cities,
        timestamp: Date.now(),
      });

      return cities;
    } finally {
      // Clean up pending request
      pendingRequests.delete(cacheKey);
    }
  })();

  pendingRequests.set(cacheKey, requestPromise);
  return requestPromise;
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
  const [cities, setCities] = useState<CityData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Track the current state to handle race conditions
  const currentStateRef = useRef<string | undefined>(state);
  currentStateRef.current = state;

  const fetchCities = useCallback(async (forceRefresh = false) => {
    const stateToFetch = currentStateRef.current;

    if (!stateToFetch) {
      setCities([]);
      setError(null);
      return;
    }

    const cacheKey = stateToFetch.toUpperCase();

    // Check cache unless forcing refresh
    if (!forceRefresh) {
      const cached = citiesCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        setCities(cached.cities);
        setError(null);
        return;
      }
    }

    // Check if request is already in flight
    const pending = pendingRequests.get(cacheKey);
    if (pending) {
      setIsLoading(true);
      try {
        const result = await pending;
        // Only update if state hasn't changed
        if (currentStateRef.current === stateToFetch) {
          setCities(result);
          setError(null);
        }
      } catch (err) {
        if (currentStateRef.current === stateToFetch) {
          setError(err instanceof Error ? err : new Error('Failed to fetch cities'));
        }
      } finally {
        if (currentStateRef.current === stateToFetch) {
          setIsLoading(false);
        }
      }
      return;
    }

    // Make new request
    setIsLoading(true);
    setError(null);

    const requestPromise = (async () => {
      const response = await api.providers.getCities(stateToFetch);
      const rawCities: CityData[] = response.cities.map((city) => ({
        city,
        state: stateToFetch,
      }));

      // Reorder with pinned cities first
      const reorderedCities = reorderCitiesWithPinned(rawCities, stateToFetch);

      // Inject NYC All Boroughs option for NY state
      const cityData = injectNycAllBoroughsOption(reorderedCities, stateToFetch);

      // Cache the result
      citiesCache.set(cacheKey, {
        cities: cityData,
        timestamp: Date.now(),
      });

      return cityData;
    })();

    pendingRequests.set(cacheKey, requestPromise);

    try {
      const result = await requestPromise;
      // Only update if state hasn't changed during request
      if (currentStateRef.current === stateToFetch) {
        setCities(result);
        setError(null);
      }
    } catch (err) {
      if (currentStateRef.current === stateToFetch) {
        setError(err instanceof Error ? err : new Error('Failed to fetch cities'));
        setCities([]);
      }
    } finally {
      pendingRequests.delete(cacheKey);
      if (currentStateRef.current === stateToFetch) {
        setIsLoading(false);
      }
    }
  }, []);

  // Fetch when state changes
  useEffect(() => {
    fetchCities();
  }, [state, fetchCities]);

  const refetch = useCallback(async () => {
    await fetchCities(true);
  }, [fetchCities]);

  return {
    cities,
    isLoading,
    error,
    refetch,
  };
}

export default useCities;
