import 'dotenv/config';
import { z } from 'zod';

/**
 * Zod schema defining all environment variables used across the Ripcord platform.
 *
 * Each variable is validated at startup. Defaults are provided where reasonable
 * so that local development works out of the box with minimal `.env` configuration.
 * Secrets (e.g. JWT_SECRET) intentionally have **no** default to force explicit setup.
 */
const envSchema = z.object({
  /* ------------------------------------------------------------------ */
  /*  General                                                           */
  /* ------------------------------------------------------------------ */

  /** Application environment. Controls logging, error detail, etc. */
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),

  /* ------------------------------------------------------------------ */
  /*  Data stores                                                       */
  /* ------------------------------------------------------------------ */

  /** PostgreSQL connection string. */
  DATABASE_URL: z
    .string()
    .default('postgres://ripcord:ripcord@localhost:5432/ripcord'),

  /** Redis connection string. */
  REDIS_URL: z.string().default('redis://localhost:6379'),

  /* ------------------------------------------------------------------ */
  /*  JWT / Authentication                                              */
  /* ------------------------------------------------------------------ */

  /** HMAC secret used to sign JWTs. Must be at least 32 characters. */
  JWT_SECRET: z.string().min(32),

  /** Access-token lifetime in seconds (default 15 min). */
  JWT_ACCESS_EXPIRES_SEC: z.coerce.number().default(900),

  /** Refresh-token lifetime in seconds (default 7 days). */
  JWT_REFRESH_EXPIRES_SEC: z.coerce.number().default(604800),

  /* ------------------------------------------------------------------ */
  /*  Service ports                                                     */
  /* ------------------------------------------------------------------ */

  /** Port for the main API server. */
  API_PORT: z.coerce.number().default(4000),

  /** Port for the WebSocket / realtime gateway. */
  GATEWAY_PORT: z.coerce.number().default(4001),

  /** Port for the authentication service. */
  AUTH_PORT: z.coerce.number().default(4002),

  /** Port for the key-management service. */
  KEY_SERVICE_PORT: z.coerce.number().default(4003),

  /* ------------------------------------------------------------------ */
  /*  WebAuthn                                                          */
  /* ------------------------------------------------------------------ */

  /** Relying-party identifier for WebAuthn (typically the domain). */
  WEBAUTHN_RP_ID: z.string().default('localhost'),

  /** Human-readable relying-party name shown during WebAuthn prompts. */
  WEBAUTHN_RP_NAME: z.string().default('Ripcord'),

  /** Expected origin for WebAuthn assertions (must match the client URL). */
  WEBAUTHN_ORIGIN: z.string().default('http://localhost:3000'),

  /* ------------------------------------------------------------------ */
  /*  LiveKit (optional -- voice / video)                               */
  /* ------------------------------------------------------------------ */

  /** LiveKit server API key. */
  LIVEKIT_API_KEY: z.string().optional(),

  /** LiveKit server API secret. */
  LIVEKIT_API_SECRET: z.string().optional(),

  /** LiveKit server WebSocket URL (e.g. wss://livekit.example.com). */
  LIVEKIT_URL: z.string().optional(),

  /** Public LiveKit URL returned to browsers (use when behind a tunnel/proxy). Falls back to LIVEKIT_URL. */
  LIVEKIT_PUBLIC_URL: z.string().optional(),

  /* ------------------------------------------------------------------ */
  /*  MinIO (S3-compatible object storage)                              */
  /* ------------------------------------------------------------------ */

  /** MinIO server hostname (used for server-to-MinIO communication). */
  MINIO_ENDPOINT: z.string().default('localhost'),

  /** MinIO server port. */
  MINIO_PORT: z.coerce.number().default(9000),

  /** Public MinIO URL returned to clients for presigned uploads/downloads.
   *  Must be reachable from the desktop app (e.g. http://your-vps:9000).
   *  Falls back to http://{MINIO_ENDPOINT}:{MINIO_PORT} if not set. */
  MINIO_PUBLIC_URL: z.string().optional(),

  /** MinIO access key (root user in development). */
  MINIO_ACCESS_KEY: z.string().default('minioadmin'),

  /** MinIO secret key (root password in development). */
  MINIO_SECRET_KEY: z.string().default('minioadmin'),

  /* ------------------------------------------------------------------ */
  /*  Rate limiting                                                     */
  /* ------------------------------------------------------------------ */

  /** Sliding-window duration in milliseconds for rate limiting. */
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60_000),

  /** Maximum number of requests allowed within the rate-limit window. */
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(300),

  /* ------------------------------------------------------------------ */
  /*  CORS                                                               */
  /* ------------------------------------------------------------------ */

  /** Comma-separated list of allowed CORS origins. */
  CORS_ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
});

/**
 * Strongly-typed environment object derived from {@link envSchema}.
 *
 * Use this type when you need to pass the config around without coupling
 * to the concrete `env` singleton.
 */
export type Env = z.infer<typeof envSchema>;

/**
 * Parsed and validated environment configuration.
 *
 * Importing this constant triggers an immediate parse of `process.env` against
 * {@link envSchema}. If any required variable is missing or fails validation
 * the process will exit with a descriptive error message.
 *
 * @example
 * ```ts
 * import { env } from '@ripcord/config';
 *
 * console.log(env.DATABASE_URL);
 * console.log(env.API_PORT); // number, not string
 * ```
 */
export const env: Env = (() => {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error(
      '❌  Invalid environment variables:\n',
      result.error.flatten().fieldErrors,
    );
    process.exit(1);
  }

  return result.data;
})();
