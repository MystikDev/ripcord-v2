import type { Request, Response, NextFunction } from 'express';
import { ApiError } from '@ripcord/types';

/**
 * A minimal interface matching the Zod `.safeParse()` contract.
 *
 * Using this instead of importing `ZodSchema` directly avoids adding
 * `zod` as a direct dependency -- it's already a transitive dependency
 * via `@ripcord/types`.
 */
interface SafeParseable {
  safeParse(data: unknown): { success: true; data: unknown } | { success: false; error: { issues: unknown[] } };
}

/**
 * Generic Zod validation middleware factory.
 *
 * Returns an Express middleware that validates `req[source]` against the
 * provided schema. On success, the validated data replaces the original
 * value on `req[source]`. On failure, a 400 {@link ApiError} is thrown with
 * Zod issue details.
 *
 * @param schema - A Zod schema (or any object with a `.safeParse()` method).
 * @param source - Which part of the request to validate (body, params, or query).
 * @returns Express middleware function.
 */
export function validate(schema: SafeParseable, source: 'body' | 'params' | 'query' = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      throw ApiError.badRequest('Validation failed', result.error.issues);
    }

    // Replace with the parsed (and potentially transformed) data
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    (req as any)[source] = result.data;
    next();
  };
}
