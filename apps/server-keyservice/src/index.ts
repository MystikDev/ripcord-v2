import express, { type Express } from 'express';
import cors from 'cors';
import { env } from '@ripcord/config';
import { closePool } from '@ripcord/db';
import { securityHeaders } from './middleware/security-headers.js';
import { errorHandler } from './middleware/error-handler.js';
import { bundlesRouter } from './routes/bundles.js';
import { prekeysRouter } from './routes/prekeys.js';
import { logger } from './logger.js';

/**
 * Ripcord Key Service
 *
 * Manages X3DH key bundles and one-time pre-keys for end-to-end
 * encrypted messaging. Handles bundle upload, retrieval, rotation,
 * and atomic pre-key claiming.
 */

const app: Express = express();

// ---------------------------------------------------------------------------
// Global middleware
// ---------------------------------------------------------------------------

app.set('trust proxy', 1);
app.use(securityHeaders);
app.use(cors());
app.use(express.json({ limit: '16kb' }));

// ---------------------------------------------------------------------------
// Health check (unauthenticated)
// ---------------------------------------------------------------------------

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'keyservice', timestamp: new Date().toISOString() });
});

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

app.use('/v1/keys/bundles', bundlesRouter);
app.use('/v1/keys/prekeys', prekeysRouter);

// ---------------------------------------------------------------------------
// Error handler (must be last)
// ---------------------------------------------------------------------------

app.use(errorHandler);

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

const server = app.listen(env.KEY_SERVICE_PORT, () => {
  logger.info(
    { port: env.KEY_SERVICE_PORT, env: env.NODE_ENV },
    'Key service listening',
  );
});

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

async function shutdown(signal: string) {
  logger.info({ signal }, 'Shutdown signal received — draining connections');

  server.close(async () => {
    try {
      await closePool();
      logger.info('Database pool closed');
    } catch (err) {
      logger.error({ err }, 'Error closing database pool');
    }

    process.exit(0);
  });

  // Force exit after 10 seconds if graceful shutdown stalls
  setTimeout(() => {
    logger.error('Graceful shutdown timed out — forcing exit');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export { app };
