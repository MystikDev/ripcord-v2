import type { Request, Response, NextFunction } from 'express';
import { ApiError, type ApiResponse } from '@ripcord/types';
import { logger } from '../logger.js';

/**
 * Global error handler middleware.
 *
 * Catches all errors bubbling up from route handlers:
 * - {@link ApiError} instances are serialised into a typed {@link ApiResponse}
 *   with the appropriate HTTP status code.
 * - Unknown errors produce a generic 500 response. The original error is
 *   logged but never leaked to the client.
 *
 * Sensitive data (tokens, credentials, etc.) is never included in log output.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ApiError) {
    const body: ApiResponse = {
      ok: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    };
    res.status(err.statusCode).json(body);
    return;
  }

  // Unknown / unexpected error — log full details, return generic message
  logger.error({ err }, 'Unhandled error');

  const body: ApiResponse = {
    ok: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    },
  };
  res.status(500).json(body);
}
