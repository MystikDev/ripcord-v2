import { randomUUID } from 'node:crypto';
import {
  signAccessToken,
  generateRefreshToken,
  hashRefreshToken,
} from '@ripcord/crypto';
import { env } from '@ripcord/config';
import { ApiError, AuditAction, type TokenPair, type SessionInfo } from '@ripcord/types';
import * as sessionRepo from '../repositories/session.repo.js';
import * as auditRepo from '../repositories/audit.repo.js';
import { logger } from '../logger.js';

/** Result returned by session creation and refresh operations. */
export interface SessionResult {
  tokenPair: TokenPair;
  session: SessionInfo;
}

/**
 * Create a new authenticated session for a user + device pair.
 *
 * Generates a fresh refresh token, hashes it for storage, creates a
 * new token family for rotation tracking, and signs an access JWT.
 *
 * @param userId   - Authenticated user's ID.
 * @param deviceId - Device the session is bound to.
 * @returns A token pair and session metadata.
 */
export async function createSession(
  userId: string,
  deviceId: string,
): Promise<SessionResult> {
  const rawRefreshToken = generateRefreshToken();
  const refreshHash = hashRefreshToken(rawRefreshToken);
  const tokenFamily = randomUUID();
  const expiresAt = new Date(Date.now() + env.JWT_REFRESH_EXPIRES_SEC * 1000);

  const session = await sessionRepo.create(
    userId,
    deviceId,
    refreshHash,
    expiresAt,
    tokenFamily,
  );

  const accessToken = await signAccessToken({
    userId,
    deviceId,
    sessionId: session.id,
  });

  // Audit: session created
  await auditRepo.create(
    userId,
    deviceId,
    AuditAction.SESSION_CREATED,
    'session',
    session.id,
    {},
  );

  return {
    tokenPair: {
      accessToken,
      refreshToken: rawRefreshToken,
      expiresIn: env.JWT_ACCESS_EXPIRES_SEC,
    },
    session: {
      sessionId: session.id,
      userId: session.user_id,
      deviceId: session.device_id ?? deviceId,
      createdAt: session.created_at.toISOString(),
      expiresAt: session.expires_at.toISOString(),
    },
  };
}

/**
 * Refresh a session using a raw refresh token.
 *
 * Implements token-family rotation detection:
 * 1. Hash the provided token and look up the session.
 * 2. If not found, the token is unknown -- return 401.
 * 3. If the session is revoked, this is a REUSE ATTACK. Revoke the
 *    entire token family and log an audit event.
 * 4. If the session is expired, return 401.
 * 5. Generate a new refresh token, rotate the session, and issue
 *    a new access token.
 *
 * @param rawRefreshToken - The plaintext refresh token from the client.
 * @returns A fresh token pair and updated session metadata.
 * @throws {ApiError} 401 on invalid, reused, or expired tokens.
 */
export async function refreshSession(rawRefreshToken: string): Promise<SessionResult> {
  const hash = hashRefreshToken(rawRefreshToken);
  const session = await sessionRepo.findByRefreshHash(hash);

  if (!session) {
    throw ApiError.unauthorized('Invalid refresh token');
  }

  // REUSE DETECTION: if the session has been revoked but we're seeing
  // its old token again, an attacker is replaying a stolen token.
  if (session.revoked_at) {
    logger.warn(
      { sessionId: session.id, tokenFamily: session.token_family },
      'Refresh token reuse detected — revoking entire token family',
    );

    await sessionRepo.revokeByTokenFamily(session.token_family);

    await auditRepo.create(
      session.user_id,
      session.device_id,
      AuditAction.SESSION_REUSE_DETECTED,
      'session',
      session.id,
      { tokenFamily: session.token_family, generation: session.generation },
    );

    throw ApiError.unauthorized('Refresh token has been revoked (possible token theft)');
  }

  // Expiry check
  if (new Date(session.expires_at) <= new Date()) {
    throw ApiError.unauthorized('Refresh token has expired');
  }

  // Generate new refresh token and rotate
  const newRawRefreshToken = generateRefreshToken();
  const newRefreshHash = hashRefreshToken(newRawRefreshToken);
  const newGeneration = session.generation + 1;

  await sessionRepo.rotateRefreshToken(session.id, newRefreshHash, newGeneration);

  // Sign new access token
  const accessToken = await signAccessToken({
    userId: session.user_id,
    deviceId: session.device_id ?? '',
    sessionId: session.id,
  });

  return {
    tokenPair: {
      accessToken,
      refreshToken: newRawRefreshToken,
      expiresIn: env.JWT_ACCESS_EXPIRES_SEC,
    },
    session: {
      sessionId: session.id,
      userId: session.user_id,
      deviceId: session.device_id ?? '',
      createdAt: session.created_at.toISOString(),
      expiresAt: session.expires_at.toISOString(),
    },
  };
}

/**
 * Revoke a specific session.
 *
 * Marks the session as revoked and creates an audit event.
 *
 * @param sessionId    - Session to revoke.
 * @param actorUserId  - User performing the revocation.
 * @param actorDeviceId - Device the actor is using.
 */
export async function revokeSession(
  sessionId: string,
  actorUserId: string,
  actorDeviceId: string | null,
): Promise<void> {
  await sessionRepo.revokeById(sessionId);

  await auditRepo.create(
    actorUserId,
    actorDeviceId,
    AuditAction.SESSION_REVOKED,
    'session',
    sessionId,
    {},
  );

  logger.debug({ sessionId, actorUserId }, 'Session revoked');
}

/**
 * Retrieve all active (non-revoked, non-expired) sessions for a user.
 *
 * @param userId - User whose sessions to retrieve.
 * @returns Array of active session metadata.
 */
export async function getActiveSessions(userId: string): Promise<SessionInfo[]> {
  const sessions = await sessionRepo.findActiveByUserId(userId);

  return sessions.map((s) => ({
    sessionId: s.id,
    userId: s.user_id,
    deviceId: s.device_id ?? '',
    createdAt: s.created_at.toISOString(),
    expiresAt: s.expires_at.toISOString(),
  }));
}
