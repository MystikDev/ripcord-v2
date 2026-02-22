import { Redis } from 'ioredis';
import { env } from '@ripcord/config';

/**
 * Shared Redis client used for rate limiting, WebAuthn challenge storage,
 * and other ephemeral state in the auth service.
 *
 * Connects using {@link env.REDIS_URL} from `@ripcord/config`.
 */
export const redis = new Redis(env.REDIS_URL);
