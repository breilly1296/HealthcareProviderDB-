import { Request, Response, NextFunction } from 'express';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitStore {
  [key: string]: RateLimitEntry;
}

interface RateLimiterOptions {
  windowMs: number;
  maxRequests: number;
  name?: string; // Unique name for this limiter's store
  message?: string;
  keyGenerator?: (req: Request) => string;
  skip?: (req: Request) => boolean;
}

/**
 * In-memory rate limit store
 * In production, use Redis for distributed rate limiting
 */
const stores: Map<string, RateLimitStore> = new Map();

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now();
  stores.forEach((store) => {
    Object.keys(store).forEach((key) => {
      if (store[key].resetAt < now) {
        delete store[key];
      }
    });
  });
}, 60000); // Cleanup every minute

/**
 * Create a rate limiter middleware
 */
export function createRateLimiter(options: RateLimiterOptions) {
  const {
    windowMs,
    maxRequests,
    name,
    message = 'Too many requests, please try again later.',
    keyGenerator = (req: Request) => req.ip || 'unknown',
    skip = () => false,
  } = options;

  const storeName = name || `${windowMs}-${maxRequests}`;
  if (!stores.has(storeName)) {
    stores.set(storeName, {});
  }
  const store = stores.get(storeName)!;

  return (req: Request, res: Response, next: NextFunction): void => {
    if (skip(req)) {
      next();
      return;
    }

    const key = keyGenerator(req);
    const now = Date.now();

    // Get or create entry
    let entry = store[key];
    if (!entry || entry.resetAt < now) {
      entry = {
        count: 0,
        resetAt: now + windowMs,
      };
      store[key] = entry;
    }

    entry.count++;

    // Set rate limit headers
    const remaining = Math.max(0, maxRequests - entry.count);
    const resetTimestamp = Math.ceil(entry.resetAt / 1000); // Unix timestamp
    const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000);

    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', resetTimestamp);

    if (entry.count > maxRequests) {
      res.setHeader('Retry-After', retryAfterSeconds);
      res.status(429).json({
        error: 'Too many requests',
        message: message,
        retryAfter: retryAfterSeconds,
      });
      return;
    }

    next();
  };
}

/**
 * Default rate limiter for general GET routes: 200 requests per hour
 */
export const defaultRateLimiter = createRateLimiter({
  name: 'default',
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 200,
  message: 'Too many requests. Please try again in 1 hour.',
});

/**
 * Strict rate limiter for verification endpoints: 10 requests per hour
 */
export const verificationRateLimiter = createRateLimiter({
  name: 'verification',
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 10,
  message: "You've submitted too many verifications. Please try again in 1 hour.",
});

/**
 * Strict rate limiter for vote endpoints: 10 requests per hour
 */
export const voteRateLimiter = createRateLimiter({
  name: 'vote',
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 10,
  message: "You've submitted too many votes. Please try again in 1 hour.",
});

/**
 * Search rate limiter: 100 requests per hour
 */
export const searchRateLimiter = createRateLimiter({
  name: 'search',
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 100,
  message: 'Too many search requests. Please try again in 1 hour.',
});
