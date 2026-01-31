/**
 * Cache Utility Module
 *
 * Provides a unified caching interface that works with both:
 * - In-memory cache (for single-instance deployments)
 * - Redis cache (for distributed deployments when REDIS_URL is set)
 *
 * Features:
 * - Automatic TTL expiration
 * - Cache statistics tracking (hits, misses, size)
 * - Graceful fallback to in-memory when Redis unavailable
 * - Search query key generation with normalization
 */

import { getRedisClient, isRedisConnected } from '../lib/redis';
import logger from './logger';

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_TTL_SECONDS = 300; // 5 minutes
const CACHE_PREFIX = 'cache:';
const SEARCH_CACHE_PREFIX = 'search:';

// ============================================================================
// In-Memory Cache Implementation
// ============================================================================

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

// In-memory cache store
const memoryCache: Map<string, CacheEntry<unknown>> = new Map();

// Cache statistics
interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  size: number;
  mode: 'redis' | 'memory';
}

const stats: CacheStats = {
  hits: 0,
  misses: 0,
  sets: 0,
  deletes: 0,
  size: 0,
  mode: 'memory',
};

// Periodic cleanup of expired entries (every 60 seconds)
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;

  memoryCache.forEach((entry, key) => {
    if (entry.expiresAt < now) {
      memoryCache.delete(key);
      cleaned++;
    }
  });

  if (cleaned > 0) {
    logger.debug({ cleaned }, 'Cache cleanup: removed expired entries');
  }

  stats.size = memoryCache.size;
}, 60000);

// ============================================================================
// Cache Operations
// ============================================================================

/**
 * Get a value from cache.
 *
 * @param key - Cache key
 * @returns Cached value or null if not found/expired
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const fullKey = CACHE_PREFIX + key;
  const redis = getRedisClient();

  // Try Redis first if available
  if (redis && isRedisConnected()) {
    try {
      const value = await redis.get(fullKey);
      if (value) {
        stats.hits++;
        stats.mode = 'redis';
        return JSON.parse(value) as T;
      }
      stats.misses++;
      return null;
    } catch (error) {
      logger.warn({ error, key }, 'Redis cache get failed, falling back to memory');
    }
  }

  // Fall back to in-memory cache
  stats.mode = 'memory';
  const entry = memoryCache.get(fullKey);

  if (!entry) {
    stats.misses++;
    return null;
  }

  if (entry.expiresAt < Date.now()) {
    memoryCache.delete(fullKey);
    stats.misses++;
    return null;
  }

  stats.hits++;
  return entry.value as T;
}

/**
 * Set a value in cache with TTL.
 *
 * @param key - Cache key
 * @param value - Value to cache (will be JSON serialized)
 * @param ttlSeconds - Time to live in seconds (default: 5 minutes)
 */
export async function cacheSet<T>(
  key: string,
  value: T,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): Promise<void> {
  const fullKey = CACHE_PREFIX + key;
  const redis = getRedisClient();

  stats.sets++;

  // Try Redis first if available
  if (redis && isRedisConnected()) {
    try {
      await redis.setex(fullKey, ttlSeconds, JSON.stringify(value));
      stats.mode = 'redis';
      return;
    } catch (error) {
      logger.warn({ error, key }, 'Redis cache set failed, falling back to memory');
    }
  }

  // Fall back to in-memory cache
  stats.mode = 'memory';
  memoryCache.set(fullKey, {
    value,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
  stats.size = memoryCache.size;
}

/**
 * Delete a value from cache.
 *
 * @param key - Cache key
 */
export async function cacheDelete(key: string): Promise<void> {
  const fullKey = CACHE_PREFIX + key;
  const redis = getRedisClient();

  stats.deletes++;

  // Delete from Redis if available
  if (redis && isRedisConnected()) {
    try {
      await redis.del(fullKey);
    } catch (error) {
      logger.warn({ error, key }, 'Redis cache delete failed');
    }
  }

  // Also delete from memory cache
  memoryCache.delete(fullKey);
  stats.size = memoryCache.size;
}

/**
 * Delete all cache entries matching a pattern.
 * For Redis: uses SCAN to find and delete matching keys
 * For memory: iterates through all keys
 *
 * @param pattern - Key pattern (e.g., "search:*")
 * @returns Number of keys deleted
 */
export async function cacheDeletePattern(pattern: string): Promise<number> {
  const fullPattern = CACHE_PREFIX + pattern;
  const redis = getRedisClient();
  let deleted = 0;

  // Delete from Redis if available
  if (redis && isRedisConnected()) {
    try {
      // Use SCAN to find keys (safer than KEYS for production)
      let cursor = '0';
      do {
        const [newCursor, keys] = await redis.scan(
          cursor,
          'MATCH',
          fullPattern,
          'COUNT',
          100
        );
        cursor = newCursor;

        if (keys.length > 0) {
          await redis.del(...keys);
          deleted += keys.length;
        }
      } while (cursor !== '0');
    } catch (error) {
      logger.warn({ error, pattern }, 'Redis cache pattern delete failed');
    }
  }

  // Also delete from memory cache
  const memoryPattern = new RegExp(
    '^' + fullPattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
  );

  memoryCache.forEach((_, key) => {
    if (memoryPattern.test(key)) {
      memoryCache.delete(key);
      deleted++;
    }
  });

  stats.size = memoryCache.size;
  stats.deletes += deleted;

  logger.info({ pattern, deleted }, 'Cache pattern delete completed');
  return deleted;
}

/**
 * Clear all cache entries.
 *
 * @returns Number of keys deleted
 */
export async function cacheClear(): Promise<number> {
  const redis = getRedisClient();
  let deleted = 0;

  // Clear Redis cache
  if (redis && isRedisConnected()) {
    try {
      deleted = await cacheDeletePattern('*');
    } catch (error) {
      logger.warn({ error }, 'Redis cache clear failed');
    }
  }

  // Clear memory cache
  const memorySize = memoryCache.size;
  memoryCache.clear();
  deleted += memorySize;

  stats.size = 0;
  logger.info({ deleted }, 'Cache cleared');

  return deleted;
}

/**
 * Get cache statistics.
 */
export function getCacheStats(): CacheStats {
  stats.size = memoryCache.size;
  return { ...stats };
}

/**
 * Reset cache statistics.
 */
export function resetCacheStats(): void {
  stats.hits = 0;
  stats.misses = 0;
  stats.sets = 0;
  stats.deletes = 0;
}

// ============================================================================
// Search Cache Key Generation
// ============================================================================

interface SearchParams {
  state?: string;
  city?: string;
  cities?: string;
  zipCode?: string;
  healthSystem?: string;
  specialty?: string;
  name?: string;
  npi?: string;
  entityType?: string;
  insurancePlanId?: string;
  page?: number;
  limit?: number;
}

/**
 * Generate a normalized, deterministic cache key for search queries.
 *
 * Key format: search:<state>:<city>:<specialty>:<page>:<limit>:<hash>
 *
 * All string values are lowercased and trimmed for consistency.
 * Additional params are hashed to keep key length manageable.
 *
 * @param params - Search parameters
 * @returns Normalized cache key
 */
export function generateSearchCacheKey(params: SearchParams): string {
  // Normalize string values
  const normalize = (value: string | undefined): string => {
    return value ? value.toLowerCase().trim() : '';
  };

  // Build key components
  const components = [
    SEARCH_CACHE_PREFIX.slice(0, -1), // Remove trailing colon
    normalize(params.state) || '_',
    normalize(params.city) || '_',
    normalize(params.specialty) || '_',
    String(params.page || 1),
    String(params.limit || 20),
  ];

  // Add additional params as a simple hash if present
  const additionalParams: string[] = [];

  if (params.cities) additionalParams.push(`cities:${normalize(params.cities)}`);
  if (params.zipCode) additionalParams.push(`zip:${normalize(params.zipCode)}`);
  if (params.healthSystem) additionalParams.push(`hs:${normalize(params.healthSystem)}`);
  if (params.name) additionalParams.push(`name:${normalize(params.name)}`);
  if (params.npi) additionalParams.push(`npi:${params.npi}`);
  if (params.entityType) additionalParams.push(`et:${normalize(params.entityType)}`);
  if (params.insurancePlanId) additionalParams.push(`plan:${normalize(params.insurancePlanId)}`);

  if (additionalParams.length > 0) {
    // Simple hash for additional params
    const hash = additionalParams.join('|');
    components.push(simpleHash(hash));
  }

  return components.join(':');
}

/**
 * Simple string hash function for cache key generation.
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Invalidate all search cache entries.
 * Called when verifications are submitted to ensure fresh data.
 */
export async function invalidateSearchCache(): Promise<number> {
  return cacheDeletePattern(SEARCH_CACHE_PREFIX + '*');
}
