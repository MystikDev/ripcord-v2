import type { Request, Response, NextFunction } from 'express';
import { createHash } from 'node:crypto';
import { redis } from '../redis.js';
import { ApiError } from '@ripcord/types';
import { logger } from '../logger.js';

/** Configuration for the sliding-window rate limiter. */
export interface RateLimitOptions {
  /** Duration of the sliding window in milliseconds. */
  windowMs: number;
  /** Maximum number of requests allowed within the window. */
  max: number;
  /** Redis key prefix to namespace different limiters. */
  keyPrefix: string;
  /**
   * Function that extracts the rate-limit key from the request.
   * Defaults to a SHA-256 hash of the client IP address.
   */
  keyExtractor?: (req: Request) => string;
}

/**
 * Hash a string with SHA-256 and return a hex digest.
 *
 * Used to hash IP addresses so raw IPs are never stored in Redis.
 */
function hashValue(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Default key extractor: returns a SHA-256 hash of the client IP.
 *
 * Uses `req.ip` which respects proxy trust settings.
 */
function defaultKeyExtractor(req: Request): string {
  const cfIp = req.headers['cf-connecting-ip'];
  const ip = (typeof cfIp === 'string' ? cfIp : null)
    ?? req.ip
    ?? req.socket.remoteAddress
    ?? 'unknown';
  return hashValue(ip);
}

/**
 * Create a Redis sliding-window rate limiter middleware.
 *
 * Uses the ZADD + ZREMRANGEBYSCORE + ZCARD pattern for an accurate
 * per-key sliding window. When the limit is exceeded, a 429 response
 * is returned with a `Retry-After` header.
 *
 * @param options - Rate limiter configuration.
 * @returns Express middleware function.
 */
export function rateLimit(options: RateLimitOptions) {
  const { windowMs, max, keyPrefix, keyExtractor = defaultKeyExtractor } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const key = `rl:${keyPrefix}:${keyExtractor(req)}`;
    const now = Date.now();
    const windowStart = now - windowMs;

    try {
      const pipeline = redis.pipeline();
      // Remove entries outside the current window
      pipeline.zremrangebyscore(key, 0, windowStart);
      // Add current request with timestamp as score and unique member
      pipeline.zadd(key, now, `${now}:${Math.random().toString(36).slice(2)}`);
      // Count entries in the window
      pipeline.zcard(key);
      // Set TTL to auto-expire the key after the window passes
      pipeline.pexpire(key, windowMs);

      const results = await pipeline.exec();
      // ZCARD result is the third command (index 2)
      const count = results?.[2]?.[1] as number | undefined;

      if (count != null && count > max) {
        const retryAfterSec = Math.ceil(windowMs / 1000);
        res.set('Retry-After', String(retryAfterSec));
        throw ApiError.tooManyRequests('Rate limit exceeded');
      }

      next();
    } catch (err) {
      if (err instanceof ApiError) {
        next(err);
        return;
      }
      // Redis failure should not block requests — log and allow through
      logger.error({ err, key }, 'Rate limiter Redis error — allowing request');
      next();
    }
  };
}
