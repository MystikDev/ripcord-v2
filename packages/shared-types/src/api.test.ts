import { describe, it, expect } from 'vitest';
import { ApiError } from './api.js';

describe('ApiError', () => {
  it('badRequest() returns statusCode 400 and code BAD_REQUEST', () => {
    const err = ApiError.badRequest('invalid input');
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('BAD_REQUEST');
    expect(err.message).toBe('invalid input');
  });

  it('unauthorized() returns statusCode 401 and code UNAUTHORIZED', () => {
    const err = ApiError.unauthorized();
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('UNAUTHORIZED');
    expect(err.message).toBe('Authentication required');
  });

  it('forbidden() returns statusCode 403 and code FORBIDDEN', () => {
    const err = ApiError.forbidden();
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('FORBIDDEN');
    expect(err.message).toBe('Insufficient permissions');
  });

  it('notFound() returns statusCode 404 and code NOT_FOUND', () => {
    const err = ApiError.notFound();
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toBe('Resource not found');
  });

  it('tooManyRequests() returns statusCode 429 and code TOO_MANY_REQUESTS', () => {
    const err = ApiError.tooManyRequests();
    expect(err.statusCode).toBe(429);
    expect(err.code).toBe('TOO_MANY_REQUESTS');
    expect(err.message).toBe('Rate limit exceeded');
  });

  it('internal() returns statusCode 500 and code INTERNAL_ERROR', () => {
    const err = ApiError.internal();
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe('INTERNAL_ERROR');
    expect(err.message).toBe('Internal server error');
  });

  it('constructor preserves details', () => {
    const details = { field: 'email', reason: 'invalid format' };
    const err = ApiError.badRequest('Validation failed', details);
    expect(err.details).toEqual(details);
  });

  it('extends Error', () => {
    const err = ApiError.badRequest('test');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.name).toBe('ApiError');
  });
});
