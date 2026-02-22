import { Router, type Request, type Response } from 'express';
import { query } from '@ripcord/db';
import { redis } from '../redis.js';
import { ensureBucket } from '../services/storage.service.js';

export const healthRouter: Router = Router();

/**
 * GET /health
 *
 * Unauthenticated health check endpoint. Returns a simple JSON response
 * indicating the API service is running.
 */
healthRouter.get('/', (_req: Request, res: Response) => {
  res.json({ ok: true, service: 'api', timestamp: new Date().toISOString() });
});

/**
 * GET /health/deep
 *
 * Deep health check that verifies connectivity to all backing services:
 * DB (Postgres), Redis, and MinIO. Each check is independent — one failing
 * does not prevent the others from being tested.
 *
 * Returns 200 if all services are reachable, 503 otherwise.
 */
healthRouter.get('/deep', async (_req: Request, res: Response) => {
  const services: Record<string, 'ok' | 'error'> = { db: 'error', redis: 'error', minio: 'error' };

  // DB check
  try {
    await query<{ result: number }>('SELECT 1 AS result');
    services.db = 'ok';
  } catch { /* leave as error */ }

  // Redis check
  try {
    await redis.ping();
    services.redis = 'ok';
  } catch { /* leave as error */ }

  // MinIO check (ensureBucket issues HeadBucket / CreateBucket)
  try {
    await ensureBucket();
    services.minio = 'ok';
  } catch { /* leave as error */ }

  const ok = Object.values(services).every((v) => v === 'ok');

  res.status(ok ? 200 : 503).json({
    ok,
    services,
    timestamp: new Date().toISOString(),
  });
});
