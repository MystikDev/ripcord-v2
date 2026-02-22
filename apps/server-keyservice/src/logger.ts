import pino from 'pino';
import { env } from '@ripcord/config';

/**
 * Shared pino logger instance for the key service.
 *
 * In development mode, log output is pretty-printed for readability.
 * In production, structured JSON is emitted for log aggregation.
 */
export const logger = pino({
  name: 'ripcord-keyservice',
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  ...(env.NODE_ENV === 'development' && {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true },
    },
  }),
});
