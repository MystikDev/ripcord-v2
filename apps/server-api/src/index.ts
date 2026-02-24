import express, { type Express } from 'express';
import cors from 'cors';
import { env } from '@ripcord/config';
import { closePool } from '@ripcord/db';
import { securityHeaders } from './middleware/security-headers.js';
import { errorHandler } from './middleware/error-handler.js';
import { healthRouter } from './routes/health.js';
import { hubsRouter } from './routes/servers.js';
import { channelsRouter } from './routes/channels.js';
import { messagesRouter } from './routes/messages.js';
import { voiceRouter } from './routes/voice.js';
import { readStatesRouter } from './routes/read-states.js';
import { attachmentsRouter } from './routes/attachments.js';
import { auditRouter } from './routes/audit.js';
import { membersRouter } from './routes/members.js';
import { rolesRouter } from './routes/roles.js';
import { invitesRouter } from './routes/invites.js';
import { usersRouter } from './routes/users.js';
import { redis } from './redis.js';
import { logger } from './logger.js';
import { rateLimit } from './middleware/rate-limit.js';
import { requestLogger } from './middleware/request-logger.js';
import { ensureBucket } from './services/storage.service.js';

/**
 * Ripcord API Service
 *
 * Core REST API for hub, channel, message, and voice management.
 * Handles permission resolution, message persistence with Redis pub/sub
 * for gateway fanout, and LiveKit voice token generation.
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
    // Allow requests with no origin (non-browser clients, same-origin, etc.)
    if (!origin) return callback(null, true);
    // Explicitly listed origins
    const allowed = env.CORS_ALLOWED_ORIGINS.split(',').map(s => s.trim());
    if (allowed.includes(origin)) return callback(null, true);
    // Tauri desktop app origins (Windows = https://tauri.localhost, macOS/Linux = tauri://localhost)
    if (origin === 'https://tauri.localhost' || origin === 'tauri://localhost') return callback(null, true);
    // Localhost on any port (development)
    try {
      const url = new URL(origin);
      if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return callback(null, true);
    } catch {
      // malformed origin
    }
    callback(new Error('CORS: origin not allowed'));
  },
  credentials: true,
}));
// Parse raw binary bodies for image uploads (must come BEFORE express.json)
app.use('/v1/hubs', express.raw({
  type: ['image/jpeg', 'image/png', 'image/gif'],
  limit: '512kb',
}));
app.use('/v1/users', express.raw({
  type: ['image/jpeg', 'image/png', 'image/gif'],
  limit: '512kb',
}));
app.use(express.json({
  limit: '16kb',
  type: (req) => {
    // Skip JSON parsing for binary uploads (e.g., icon images).
    // Leaves the body stream unconsumed so route handlers can read it.
    const ct = req.headers['content-type'] ?? '';
    if (ct.startsWith('image/')) return false;
    return ct.includes('json') || !ct;
  },
}));

// Reject non-JSON, non-image mutation requests to prevent CSRF via form submissions
app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    const ct = req.headers['content-type'] ?? '';
    // Allow binary blob uploads (encrypted file bytes proxied to MinIO)
    const isBlobUpload = req.method === 'PUT' && /\/attachments\/[^/]+\/blob/.test(req.path);
    // Allow image uploads, JSON requests, and blob uploads; reject everything else
    if (!ct.includes('application/json') && !ct.startsWith('image/') && !isBlobUpload) {
      res.status(415).json({ ok: false, error: 'Content-Type must be application/json' });
      return;
    }
  }
  next();
});

// Global rate limiter: 100 requests per 60 seconds per IP
app.use(rateLimit({ windowMs: 60_000, max: 100, keyPrefix: 'rl:global' }));

// ---------------------------------------------------------------------------
// Health check (unauthenticated)
// ---------------------------------------------------------------------------

app.use('/health', healthRouter);

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

app.use('/v1/hubs', hubsRouter);
app.use('/v1/hubs/:hubId/channels', channelsRouter);
app.use('/v1/messages', messagesRouter);
app.use('/v1', messagesRouter); // Mount GET /v1/channels/:channelId/messages
app.use('/v1/voice', voiceRouter);
app.use('/v1', readStatesRouter);
app.use('/v1', attachmentsRouter);
app.use('/v1/hubs/:hubId/audit-log', auditRouter);
app.use('/v1', membersRouter);
app.use('/v1', rolesRouter);
app.use('/v1', invitesRouter);
app.use('/v1/users', usersRouter);

// ---------------------------------------------------------------------------
// Error handler (must be last)
// ---------------------------------------------------------------------------

app.use(errorHandler);

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

let server: ReturnType<typeof app.listen>;

(async () => {
  // Ensure the S3/MinIO bucket exists and CORS is configured before accepting requests
  try {
    await ensureBucket();
  } catch (err) {
    logger.error({ err }, 'Failed to initialise storage bucket -- continuing anyway');
  }

  server = app.listen(env.API_PORT, () => {
    logger.info(
      { port: env.API_PORT, env: env.NODE_ENV },
      'API service listening',
    );
  });

  // Register shutdown handlers after server is created
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
})();

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

async function shutdown(signal: string) {
  logger.info({ signal }, 'Shutdown signal received -- draining connections');

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
    logger.error('Graceful shutdown timed out -- forcing exit');
    process.exit(1);
  }, 10_000).unref();
}

export { app };
