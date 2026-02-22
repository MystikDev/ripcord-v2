import pino from 'pino';
import { env } from '@ripcord/config';

/**
 * Pre-configured pino logger for the Ripcord gateway service.
 *
 * Uses pretty-printing in development for human-readable output and
 * structured JSON in production for log aggregation.
 */
export const log = pino({
  name: 'ripcord-gateway',
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  transport:
    env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
});
