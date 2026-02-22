import type { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import { generateRequestId } from '@ripcord/crypto';

/**
 * Helmet middleware configured with strict security defaults for the auth service.
 *
 * Disables all CSP directives (API-only, no HTML), enables HSTS,
 * and removes X-Powered-By.
 */
const helmetMiddleware = helmet({
  contentSecurityPolicy: false, // API-only service — no HTML content
  crossOriginEmbedderPolicy: false,
  hsts: { maxAge: 31536000, includeSubDomains: true },
});

/**
 * Security headers middleware.
 *
 * Applies helmet, adds a unique X-Request-Id to every response for
 * distributed tracing, and sets Cache-Control: no-store on all auth
 * responses to prevent token caching.
 */
export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  // Attach unique request ID
  const requestId = generateRequestId();
  req.headers['x-request-id'] = requestId;
  res.setHeader('X-Request-Id', requestId);

  // Auth responses must never be cached
  res.setHeader('Cache-Control', 'no-store');

  // Delegate to helmet for the rest
  helmetMiddleware(req, res, next);
}
