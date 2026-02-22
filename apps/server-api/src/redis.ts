import { Redis } from 'ioredis';
import { env } from '@ripcord/config';
import { logger } from './logger.js';

/**
 * Shared Redis client used for rate limiting, permission caching,
 * and message pub/sub in the API service.
 */
export const redis = new Redis(env.REDIS_URL);

redis.on('error', (err) => {
  logger.error({ err }, 'Redis client error');
});

redis.on('reconnecting', () => {
  logger.warn('Redis client reconnecting');
});
