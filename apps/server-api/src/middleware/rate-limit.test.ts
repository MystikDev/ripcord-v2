import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../redis.js', () => ({
  redis: {
    pipeline: vi.fn(() => ({
      zremrangebyscore: vi.fn().mockReturnThis(),
      zadd: vi.fn().mockReturnThis(),
      zcard: vi.fn().mockReturnThis(),
      pexpire: vi.fn().mockReturnThis(),
      exec: vi.fn(),
    })),
  },
}));

vi.mock('../logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { rateLimit } from './rate-limit.js';
import { redis } from '../redis.js';
import { ApiError } from '@ripcord/types';

function createMocks() {
  const req = { ip: '127.0.0.1', socket: { remoteAddress: '127.0.0.1' } } as any;
  const res = { set: vi.fn() } as any;
  const next = vi.fn();
  return { req, res, next };
}

describe('rateLimit middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows request when under limit', async () => {
    const pipelineMock = {
      zremrangebyscore: vi.fn().mockReturnThis(),
      zadd: vi.fn().mockReturnThis(),
      zcard: vi.fn().mockReturnThis(),
      pexpire: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([
        [null, 0],   // zremrangebyscore
        [null, 1],   // zadd
        [null, 3],   // zcard: 3 requests, under limit of 10
        [null, 1],   // pexpire
      ]),
    };
    vi.mocked(redis.pipeline).mockReturnValue(pipelineMock as any);

    const { req, res, next } = createMocks();
    const middleware = rateLimit({ windowMs: 60000, max: 10, keyPrefix: 'test' });

    await middleware(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('blocks request with 429 when over limit', async () => {
    const pipelineMock = {
      zremrangebyscore: vi.fn().mockReturnThis(),
      zadd: vi.fn().mockReturnThis(),
      zcard: vi.fn().mockReturnThis(),
      pexpire: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([
        [null, 0],
        [null, 1],
        [null, 11],  // zcard: 11 requests, over limit of 10
        [null, 1],
      ]),
    };
    vi.mocked(redis.pipeline).mockReturnValue(pipelineMock as any);

    const { req, res, next } = createMocks();
    const middleware = rateLimit({ windowMs: 60000, max: 10, keyPrefix: 'test' });

    await middleware(req, res, next);
    // The middleware catches the ApiError and passes it to next()
    expect(next).toHaveBeenCalledWith(expect.any(ApiError));
    const err = next.mock.calls[0]![0] as ApiError;
    expect(err.statusCode).toBe(429);
  });

  it('sets Retry-After header when rate limited', async () => {
    const pipelineMock = {
      zremrangebyscore: vi.fn().mockReturnThis(),
      zadd: vi.fn().mockReturnThis(),
      zcard: vi.fn().mockReturnThis(),
      pexpire: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([
        [null, 0],
        [null, 1],
        [null, 11],
        [null, 1],
      ]),
    };
    vi.mocked(redis.pipeline).mockReturnValue(pipelineMock as any);

    const { req, res, next } = createMocks();
    const middleware = rateLimit({ windowMs: 60000, max: 10, keyPrefix: 'test' });

    await middleware(req, res, next);
    expect(res.set).toHaveBeenCalledWith('Retry-After', '60');
  });

  it('allows request through when Redis pipeline throws an error', async () => {
    const pipelineMock = {
      zremrangebyscore: vi.fn().mockReturnThis(),
      zadd: vi.fn().mockReturnThis(),
      zcard: vi.fn().mockReturnThis(),
      pexpire: vi.fn().mockReturnThis(),
      exec: vi.fn().mockRejectedValue(new Error('Redis connection lost')),
    };
    vi.mocked(redis.pipeline).mockReturnValue(pipelineMock as any);

    const { req, res, next } = createMocks();
    const middleware = rateLimit({ windowMs: 60000, max: 10, keyPrefix: 'test' });

    await middleware(req, res, next);
    // Should call next() without an error (allow through on Redis failure)
    expect(next).toHaveBeenCalledWith();
  });
});
