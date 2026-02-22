import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { env } from '@ripcord/config';

/**
 * JWT payload shape used throughout the Ripcord platform.
 *
 * Extends the standard JOSE {@link JWTPayload} with Ripcord-specific claims
 * that identify the user, their device, and the active session.
 */
export interface RipcordJwtPayload extends JWTPayload {
  /** User ID (maps to the standard `sub` claim). */
  sub: string;
  /** Device ID -- identifies which registered device issued the request. */
  did: string;
  /** Session ID -- ties the token to a specific refresh-token session. */
  sid: string;
}

/** HMAC key derived once from the configured secret. */
const secretKey = new TextEncoder().encode(env.JWT_SECRET);

/** Algorithm used for all Ripcord JWTs. */
const ALGORITHM = 'HS256' as const;

/** Issuer claim embedded in every token. */
const ISSUER = 'ripcord' as const;

/**
 * Create a signed access token (JWT) for an authenticated user.
 *
 * The token contains claims that downstream services use for authorization:
 * `sub` (user), `did` (device), and `sid` (session). It is signed with HS256
 * and expires according to {@link env.JWT_ACCESS_EXPIRES_SEC}.
 *
 * @param params - Identifiers to embed in the token.
 * @param params.userId    - The authenticated user's ID.
 * @param params.deviceId  - The device the user is authenticating from.
 * @param params.sessionId - The refresh-token session this access token belongs to.
 * @returns A compact JWS string (the signed JWT).
 *
 * @example
 * ```ts
 * const token = await signAccessToken({
 *   userId: 'usr_abc123',
 *   deviceId: 'dev_xyz789',
 *   sessionId: 'ses_def456',
 * });
 * // token === 'eyJhbGciOiJIUzI1NiIs...'
 * ```
 */
export async function signAccessToken(params: {
  userId: string;
  deviceId: string;
  sessionId: string;
}): Promise<string> {
  const { userId, deviceId, sessionId } = params;

  return new SignJWT({ did: deviceId, sid: sessionId })
    .setProtectedHeader({ alg: ALGORITHM })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${env.JWT_ACCESS_EXPIRES_SEC}s`)
    .sign(secretKey);
}

/**
 * Verify and decode an access token.
 *
 * Checks the HMAC signature, validates the `iss` claim matches {@link ISSUER},
 * and ensures the token was signed with {@link ALGORITHM}. Throws if any check
 * fails or the token is expired.
 *
 * @param token - The compact JWS string to verify.
 * @returns The decoded {@link RipcordJwtPayload}.
 * @throws If the token is invalid, expired, or signed with an unexpected algorithm.
 *
 * @example
 * ```ts
 * try {
 *   const payload = await verifyAccessToken(token);
 *   console.log(payload.sub); // user ID
 * } catch {
 *   // token invalid or expired
 * }
 * ```
 */
export async function verifyAccessToken(
  token: string,
): Promise<RipcordJwtPayload> {
  const { payload } = await jwtVerify(token, secretKey, {
    issuer: ISSUER,
    algorithms: [ALGORITHM],
  });

  return payload as RipcordJwtPayload;
}
