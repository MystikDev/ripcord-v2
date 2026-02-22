import { Redis } from 'ioredis';
import { env } from '@ripcord/config';
import { log } from './logger.js';

/**
 * Create an ioredis client with standard error/reconnect logging.
 */
function createClient(label: string): Redis {
  const client = new Redis(env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: null, // allow unlimited retries for pub/sub
  });

  client.on('connect', () => log.info({ label }, 'Redis connected'));
  client.on('error', (err: unknown) => log.error({ label, err }, 'Redis error'));
  client.on('reconnecting', () => log.warn({ label }, 'Redis reconnecting'));

  return client;
}

/**
 * Subscriber client -- enters subscribe mode and CANNOT issue regular commands.
 * Used exclusively for channel message fan-out (e.g. `ch:${channelId}`).
 */
export const redisSub = createClient('sub');

/**
 * Publisher client -- used to publish presence updates and other events.
 */
export const redisPub = createClient('pub');

/**
 * Regular command client -- used for SET/GET/DEL operations (presence keys, etc.).
 */
export const redis = createClient('cmd');

/**
 * Connect all three Redis clients. Call once at startup.
 */
export async function connectRedis(): Promise<void> {
  await Promise.all([
    redisSub.connect(),
    redisPub.connect(),
    redis.connect(),
  ]);
  log.info('All Redis clients connected');
}

/**
 * Gracefully disconnect all Redis clients. Call during shutdown.
 */
export async function disconnectRedis(): Promise<void> {
  redisSub.disconnect();
  redisPub.disconnect();
  redis.disconnect();
  log.info('All Redis clients disconnected');
}
