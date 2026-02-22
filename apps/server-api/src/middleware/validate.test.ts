import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { validate } from './validate.js';
import { ApiError } from '@ripcord/types';

const schema = z.object({ name: z.string() });

function mockReqResNext(overrides: Record<string, unknown> = {}) {
  const req = { body: {}, params: {}, query: {}, ...overrides } as any;
  const res = {} as any;
  const next = vi.fn();
  return { req, res, next };
}

describe('validate middleware', () => {
  it('calls next() when body is valid', () => {
    const { req, res, next } = mockReqResNext({ body: { name: 'Alice' } });
    const middleware = validate(schema);
    middleware(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledWith();
  });

  it('replaces req.body with parsed data', () => {
    const { req, res, next } = mockReqResNext({ body: { name: 'Alice', extra: 'ignored' } });
    const middleware = validate(schema);
    middleware(req, res, next);
    // Zod strips unknown keys by default
    expect(req.body).toEqual({ name: 'Alice' });
  });

  it('throws ApiError with status 400 when body is invalid', () => {
    const { req, res, next } = mockReqResNext({ body: { name: 123 } });
    const middleware = validate(schema);
    let thrown: ApiError | undefined;
    try {
      middleware(req, res, next);
    } catch (err) {
      thrown = err as ApiError;
    }
    expect(thrown).toBeInstanceOf(ApiError);
    expect(thrown!.statusCode).toBe(400);
    expect(thrown!.code).toBe('BAD_REQUEST');
    expect(thrown!.message).toBe('Validation failed');
  });

  it('works with params source', () => {
    const { req, res, next } = mockReqResNext({ params: { name: 'Bob' } });
    const middleware = validate(schema, 'params');
    middleware(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.params).toEqual({ name: 'Bob' });
  });
});
