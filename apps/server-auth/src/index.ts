import express, { type Express } from 'express';
import cors from 'cors';
import { env } from '@ripcord/config';
import { closePool, query } from '@ripcord/db';
import { securityHeaders } from './middleware/security-headers.js';
import { errorHandler } from './middleware/error-handler.js';
import { registerRouter } from './routes/register.js';
import { loginRouter } from './routes/login.js';
import { refreshRouter } from './routes/refresh.js';
import { logoutRouter } from './routes/logout.js';
import { sessionsRouter } from './routes/sessions.js';
import { passwordRegisterRouter } from './routes/password-register.js';
import { passwordLoginRouter } from './routes/password-login.js';
import { verifyEmailRouter } from './routes/verify-email.js';
import { passwordResetRouter } from './routes/password-reset.js';
import { redis } from './redis.js';
import { logger } from './logger.js';
import { requestLogger } from './middleware/request-logger.js';

/**
 * Ripcord Auth Service (v2)
 *
 * Handles user registration, WebAuthn-based authentication, session
 * management with refresh-token rotation, and logout. This is the most
 * security-critical service in the platform.
 */

const app: Express = express();

// ---------------------------------------------------------------------------
// Global middleware
// ---------------------------------------------------------------------------

app.set('trust proxy', 1);
app.use(securityHeaders);
app.use(requestLogger);
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const allowed = env.CORS_ALLOWED_ORIGINS.split(',').map(s => s.trim());
    if (allowed.includes(origin)) return callback(null, true);
    if (origin === 'https://tauri.localhost' || origin === 'tauri://localhost') return callback(null, true);
    try {
      const url = new URL(origin);
      if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return callback(null, true);
    } catch { /* malformed origin */ }
    callback(new Error('CORS: origin not allowed'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '16kb' }));

// Reject non-JSON POST/PUT/DELETE requests to prevent CSRF via form submissions
app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    const ct = req.headers['content-type'] ?? '';
    if (!ct.includes('application/json')) {
      res.status(415).json({ ok: false, error: 'Content-Type must be application/json' });
      return;
    }
  }
  next();
});

// ---------------------------------------------------------------------------
// Health check (unauthenticated)
// ---------------------------------------------------------------------------

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'auth', timestamp: new Date().toISOString() });
});

/**
 * GET /health/deep
 *
 * Deep health check that verifies connectivity to backing services:
 * DB (Postgres) and Redis. Each check is independent.
 *
 * Returns 200 if all services are reachable, 503 otherwise.
 */
app.get('/health/deep', async (_req, res) => {
  const services: Record<string, 'ok' | 'error'> = { db: 'error', redis: 'error' };

  try {
    await query<{ result: number }>('SELECT 1 AS result');
    services.db = 'ok';
  } catch { /* leave as error */ }

  try {
    await redis.ping();
    services.redis = 'ok';
  } catch { /* leave as error */ }

  const ok = Object.values(services).every((v) => v === 'ok');

  res.status(ok ? 200 : 503).json({
    ok,
    services,
    timestamp: new Date().toISOString(),
  });
});

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

app.use('/v1/auth/register', registerRouter);
app.use('/v1/auth/login', loginRouter);
app.use('/v1/auth/refresh', refreshRouter);
app.use('/v1/auth/logout', logoutRouter);
app.use('/v1/auth/sessions', sessionsRouter);
app.use('/v1/auth/password/register', passwordRegisterRouter);
app.use('/v1/auth/password/login', passwordLoginRouter);
app.use('/v1/auth/verify-email', verifyEmailRouter);
app.use('/v1/auth/password-reset', passwordResetRouter);

// ---------------------------------------------------------------------------
// Error handler (must be last)
// ---------------------------------------------------------------------------

app.use(errorHandler);

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

const server = app.listen(env.AUTH_PORT, () => {
  logger.info(
    { port: env.AUTH_PORT, env: env.NODE_ENV },
    'Auth service listening',
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

    try {
      redis.disconnect();
      logger.info('Redis connection closed');
    } catch (err) {
      logger.error({ err }, 'Error closing Redis connection');
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
