/**
 * Rate Limiting Middleware
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * DUAL-MODE RATE LIMITING
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This middleware supports two modes:
 *
 * 1. REDIS MODE (distributed) - Used when REDIS_URL is configured
 *    - Shared state across all application instances
 *    - Enables true horizontal scaling
 *    - Uses sliding window algorithm with sorted sets
 *
 * 2. IN-MEMORY MODE (process-local) - Fallback when Redis unavailable
 *    - Each instance maintains independent counters
 *    - Only safe for single-instance deployments
 *    - Used automatically when REDIS_URL is not set
 *
 * FAIL-OPEN BEHAVIOR:
 *   If Redis becomes unavailable during operation, requests are ALLOWED
 *   with a warning logged. This prioritizes availability over strict
 *   rate limiting. The in-memory limiter is NOT used as fallback mid-request
 *   to avoid inconsistent state.
 *
 * Environment Variables:
 *   REDIS_URL - Redis connection string (enables distributed mode)
 *
 * See: docs/SCALING.md for deployment considerations
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { Request, Response, NextFunction } from 'express';
import { getRedisClient, isRedisConnected } from '../lib/redis';
import logger from '../utils/logger';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Sliding window store: Map of client keys to arrays of request timestamps.
 * Each timestamp represents when a request was made within the current window.
 */
type SlidingWindowStore = Map<string, number[]>;

interface RateLimiterOptions {
  windowMs: number;
  maxRequests: number;
  name?: string;
  message?: string;
  keyGenerator?: (req: Request) => string;
  skip?: (req: Request) => boolean;
}

type RateLimiterMiddleware = (req: Request, res: Response, next: NextFunction) => void | Promise<void>;

// ============================================================================
// IN-MEMORY RATE LIMITER (fallback for single-instance deployments)
// ============================================================================

/**
 * In-memory sliding window rate limit stores.
 *
 * SLIDING WINDOW ALGORITHM:
 * ─────────────────────────
 * Unlike fixed windows which reset at specific intervals (allowing burst attacks
 * at window boundaries), sliding windows track individual request timestamps.
 *
 * For each request:
 * 1. Filter out timestamps older than (now - windowMs)
 * 2. Count remaining timestamps in the window
 * 3. If count < maxRequests, add current timestamp and allow request
 * 4. If count >= maxRequests, reject request
 *
 * Example with 10 req/hour limit:
 * - Fixed window: User sends 10 requests at 12:59, window resets at 13:00,
 *   user sends 10 more = 20 requests in 2 minutes (vulnerability)
 * - Sliding window: Each request is tracked individually, so the 11th request
 *   within ANY 60-minute period is rejected (secure)
 *
 * Trade-off: Sliding windows use more memory (O(n) per client where n = maxRequests)
 * but provide more accurate rate limiting.
 */
const memoryStores: Map<string, SlidingWindowStore> = new Map();

// Cleanup old entries periodically (every minute)
setInterval(() => {
  const now = Date.now();
  memoryStores.forEach((store, storeName) => {
    // Get the window duration for this store (stored in limiter options)
    // For cleanup, we use a conservative 1 hour max to catch most cases
    const maxWindowMs = 60 * 60 * 1000; // 1 hour

    store.forEach((timestamps, clientKey) => {
      // Filter out timestamps older than the max window
      const validTimestamps = timestamps.filter(ts => ts > now - maxWindowMs);

      if (validTimestamps.length === 0) {
        // No valid timestamps, remove the client entry entirely
        store.delete(clientKey);
      } else if (validTimestamps.length < timestamps.length) {
        // Update with filtered timestamps
        store.set(clientKey, validTimestamps);
      }
    });
  });
}, 60000);

/**
 * Create an in-memory rate limiter using sliding window algorithm.
 * Used when Redis is not available (single-instance deployments).
 *
 * This implementation mirrors the Redis sliding window approach but stores
 * timestamps in memory instead of Redis sorted sets.
 */
function createInMemoryRateLimiter(options: RateLimiterOptions): RateLimiterMiddleware {
  const {
    windowMs,
    maxRequests,
    name,
    message = 'Too many requests, please try again later.',
    keyGenerator = (req: Request) => req.ip || 'unknown',
    skip = () => false,
  } = options;

  const storeName = name || `${windowMs}-${maxRequests}`;
  if (!memoryStores.has(storeName)) {
    memoryStores.set(storeName, new Map());
  }
  const store = memoryStores.get(storeName)!;

  return (req: Request, res: Response, next: NextFunction): void => {
    if (skip(req)) {
      next();
      return;
    }

    const clientKey = keyGenerator(req);
    const now = Date.now();
    const windowStart = now - windowMs;

    // Get existing timestamps for this client, or initialize empty array
    let timestamps = store.get(clientKey) || [];

    // Sliding window: filter out timestamps outside the current window
    timestamps = timestamps.filter(ts => ts > windowStart);

    // Count requests in current window
    const requestCount = timestamps.length;

    // Calculate rate limit headers
    // For sliding window, "reset" is approximately when the oldest request expires
    const oldestTimestamp = timestamps.length > 0 ? Math.min(...timestamps) : now;
    const resetTimestamp = Math.ceil((oldestTimestamp + windowMs) / 1000);
    const remaining = Math.max(0, maxRequests - requestCount);
    const retryAfterSeconds = Math.ceil(windowMs / 1000);

    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', resetTimestamp);

    if (requestCount >= maxRequests) {
      res.setHeader('Retry-After', retryAfterSeconds);
      res.status(429).json({
        error: 'Too many requests',
        message: message,
        retryAfter: retryAfterSeconds,
      });
      return;
    }

    // Add current request timestamp to the window
    timestamps.push(now);
    store.set(clientKey, timestamps);

    next();
  };
}

// ============================================================================
// REDIS RATE LIMITER (distributed for horizontal scaling)
// ============================================================================

/**
 * Create a Redis-based rate limiter using sliding window algorithm.
 * Uses sorted sets to track requests within the time window.
 */
function createRedisRateLimiter(options: RateLimiterOptions): RateLimiterMiddleware {
  const {
    windowMs,
    maxRequests,
    name = 'default',
    message = 'Too many requests, please try again later.',
    keyGenerator = (req: Request) => req.ip || 'unknown',
    skip = () => false,
  } = options;

  const redis = getRedisClient();

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (skip(req)) {
      next();
      return;
    }

    // If Redis is not connected, fail open (allow request with warning)
    if (!redis || !isRedisConnected()) {
      logger.warn({ limiter: name }, 'Rate limiter Redis unavailable, allowing request (fail-open)');
      res.setHeader('X-RateLimit-Status', 'degraded');
      next();
      return;
    }

    const clientKey = keyGenerator(req);
    const redisKey = `ratelimit:${name}:${clientKey}`;
    const now = Date.now();
    const windowStart = now - windowMs;

    try {
      // Sliding window using Redis sorted set
      // Score = timestamp, Member = unique request ID
      const multi = redis.multi();

      // 1. Remove entries outside the current window
      multi.zremrangebyscore(redisKey, 0, windowStart);

      // 2. Add current request with timestamp as score
      // Use timestamp + random suffix to ensure uniqueness
      const requestId = `${now}-${Math.random().toString(36).substring(2, 9)}`;
      multi.zadd(redisKey, now, requestId);

      // 3. Count requests in current window
      multi.zcard(redisKey);

      // 4. Set key expiration (cleanup after window passes)
      multi.expire(redisKey, Math.ceil(windowMs / 1000) + 1);

      const results = await multi.exec();

      if (!results) {
        // Transaction failed, fail open
        logger.warn({ limiter: name }, 'Rate limiter Redis transaction failed, allowing request');
        res.setHeader('X-RateLimit-Status', 'degraded');
        next();
        return;
      }

      // Extract count from ZCARD result (3rd command, index 2)
      const zcardResult = results[2];
      const requestCount = (zcardResult && zcardResult[1] as number) || 0;

      // Calculate rate limit headers
      const remaining = Math.max(0, maxRequests - requestCount);
      const resetTimestamp = Math.ceil((now + windowMs) / 1000);
      const retryAfterSeconds = Math.ceil(windowMs / 1000);

      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', remaining);
      res.setHeader('X-RateLimit-Reset', resetTimestamp);

      if (requestCount > maxRequests) {
        res.setHeader('Retry-After', retryAfterSeconds);
        res.status(429).json({
          error: 'Too many requests',
          message,
          retryAfter: retryAfterSeconds,
        });
        return;
      }

      next();
    } catch (error) {
      // Redis error - fail open to prioritize availability
      logger.error({ limiter: name, error }, 'Rate limiter Redis error, allowing request');
      res.setHeader('X-RateLimit-Status', 'degraded');
      next();
    }
  };
}

// ============================================================================
// AUTO-SELECTING RATE LIMITER FACTORY
// ============================================================================

// Track which mode was selected for each limiter (for logging)
const limiterModes: Map<string, 'redis' | 'memory'> = new Map();

/**
 * Create a rate limiter middleware.
 *
 * Automatically selects the appropriate implementation:
 * - Redis-based if REDIS_URL is configured
 * - In-memory fallback otherwise
 *
 * @param options - Rate limiter configuration
 * @returns Express middleware function
 */
export function createRateLimiter(options: RateLimiterOptions): RateLimiterMiddleware {
  const name = options.name || 'unnamed';
  const redis = getRedisClient();

  // Only log mode selection once per limiter
  if (!limiterModes.has(name)) {
    if (redis) {
      logger.info({ limiter: name, mode: 'redis' }, 'Rate limiter using Redis (distributed mode)');
      limiterModes.set(name, 'redis');
    } else {
      logger.info({ limiter: name, mode: 'memory' }, 'Rate limiter using in-memory (single-instance mode)');
      limiterModes.set(name, 'memory');
    }
  }

  if (redis) {
    return createRedisRateLimiter(options);
  }

  return createInMemoryRateLimiter(options);
}

// ============================================================================
// PRE-CONFIGURED RATE LIMITERS
// ============================================================================

/**
 * Default rate limiter for general API routes.
 * Limit: 200 requests per hour
 */
export const defaultRateLimiter = createRateLimiter({
  name: 'default',
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 200,
  message: 'Too many requests. Please try again in 1 hour.',
});

/**
 * Strict rate limiter for verification submission endpoints.
 * Limit: 10 requests per hour
 */
export const verificationRateLimiter = createRateLimiter({
  name: 'verification',
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 10,
  message: "You've submitted too many verifications. Please try again in 1 hour.",
});

/**
 * Strict rate limiter for vote endpoints.
 * Limit: 10 requests per hour
 */
export const voteRateLimiter = createRateLimiter({
  name: 'vote',
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 10,
  message: "You've submitted too many votes. Please try again in 1 hour.",
});

/**
 * Rate limiter for search endpoints.
 * Limit: 100 requests per hour
 */
export const searchRateLimiter = createRateLimiter({
  name: 'search',
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 100,
  message: 'Too many search requests. Please try again in 1 hour.',
});

/**
 * Rate limiter for magic link requests.
 * Limit: 5 requests per 15 minutes per IP
 */
export const magicLinkRateLimiter = createRateLimiter({
  name: 'magic-link',
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5,
  message: 'Too many login requests. Please try again in 15 minutes.',
});
