import type { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Wraps an async Express route handler / middleware so that rejected
 * promises are forwarded to `next(err)` instead of becoming unhandled
 * rejections that crash the process.
 *
 * Express 4 does not natively catch async errors; this utility bridges
 * the gap until the project upgrades to Express 5.
 *
 * @example
 * ```ts
 * router.get('/foo', asyncHandler(async (req, res) => {
 *   const data = await someAsyncOp();
 *   res.json({ ok: true, data });
 * }));
 * ```
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
