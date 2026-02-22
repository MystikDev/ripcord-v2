import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type VerifiedRegistrationResponse,
  type VerifiedAuthenticationResponse,
} from '@simplewebauthn/server';
import type { AuthenticatorTransportFuture, RegistrationResponseJSON, AuthenticationResponseJSON } from '@simplewebauthn/types';
import { env } from '@ripcord/config';
import { ApiError } from '@ripcord/types';
import { redis } from '../redis.js';
import { logger } from '../logger.js';
import type { CredentialRow } from '../repositories/credential.repo.js';

/** Time-to-live for WebAuthn challenges in Redis (5 minutes). */
const CHALLENGE_TTL_SEC = 300;

/**
 * Generate WebAuthn registration options for a new user.
 *
 * Stores the generated challenge in Redis so it can be verified when
 * the client completes the attestation ceremony.
 *
 * @param handle                - The user's display handle (used as userName).
 * @param existingCredentialIds - Credential IDs already registered by this user,
 *                                to prevent re-registration of the same authenticator.
 * @returns PublicKeyCredentialCreationOptionsJSON to pass to the client.
 */
export async function genRegistrationOptions(
  handle: string,
  existingCredentialIds: string[],
) {
  const options = await generateRegistrationOptions({
    rpName: env.WEBAUTHN_RP_NAME,
    rpID: env.WEBAUTHN_RP_ID,
    userName: handle,
    attestationType: 'none',
    excludeCredentials: existingCredentialIds.map((id) => ({
      id,
      transports: ['internal', 'hybrid'] as AuthenticatorTransportFuture[],
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  });

  // Store challenge in Redis for verification
  await redis.set(
    `webauthn:reg:${handle}`,
    options.challenge,
    'EX',
    CHALLENGE_TTL_SEC,
  );

  logger.debug({ handle }, 'Generated WebAuthn registration options');
  return options;
}

/**
 * Verify a WebAuthn registration (attestation) response.
 *
 * Retrieves the expected challenge from Redis and validates the
 * authenticator's attestation. The challenge is consumed (deleted)
 * regardless of success to prevent replay.
 *
 * @param handle   - The handle used during option generation.
 * @param response - The RegistrationResponseJSON from the client.
 * @returns The verified registration response with credential info.
 * @throws {ApiError} 400 if the challenge is missing or verification fails.
 */
export async function verifyRegistration(
  handle: string,
  response: RegistrationResponseJSON,
): Promise<VerifiedRegistrationResponse> {
  const expectedChallenge = await redis.get(`webauthn:reg:${handle}`);
  if (!expectedChallenge) {
    throw ApiError.badRequest('Registration challenge expired or not found');
  }

  // Consume the challenge immediately to prevent replay
  await redis.del(`webauthn:reg:${handle}`);

  try {
    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: env.WEBAUTHN_ORIGIN,
      expectedRPID: env.WEBAUTHN_RP_ID,
    });

    if (!verification.verified || !verification.registrationInfo) {
      throw ApiError.badRequest('WebAuthn registration verification failed');
    }

    logger.debug({ handle }, 'WebAuthn registration verified');
    return verification;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    logger.error({ err, handle }, 'WebAuthn registration verification error');
    throw ApiError.badRequest('WebAuthn registration verification failed');
  }
}

/**
 * Generate WebAuthn authentication options for an existing user.
 *
 * Stores the challenge in Redis keyed by userId so the response
 * can be verified.
 *
 * @param userId      - The user's ID.
 * @param credentials - The user's registered credentials from the database.
 * @returns PublicKeyCredentialRequestOptionsJSON to pass to the client.
 */
export async function genAuthenticationOptions(
  userId: string,
  credentials: CredentialRow[],
) {
  const options = await generateAuthenticationOptions({
    rpID: env.WEBAUTHN_RP_ID,
    allowCredentials: credentials.map((cred) => ({
      id: cred.credential_id,
      transports: (cred.transports ?? ['internal', 'hybrid']) as AuthenticatorTransportFuture[],
    })),
    userVerification: 'preferred',
  });

  await redis.set(
    `webauthn:auth:${userId}`,
    options.challenge,
    'EX',
    CHALLENGE_TTL_SEC,
  );

  logger.debug({ userId }, 'Generated WebAuthn authentication options');
  return options;
}

/**
 * Verify a WebAuthn authentication (assertion) response.
 *
 * Retrieves the expected challenge from Redis, verifies the signature
 * against the stored public key, and validates the counter. The challenge
 * is consumed regardless of outcome.
 *
 * @param userId     - The user's ID.
 * @param response   - The AuthenticationResponseJSON from the client.
 * @param credential - The matching credential row from the database.
 * @returns The verified authentication response.
 * @throws {ApiError} 400 if the challenge is missing or verification fails.
 */
export async function verifyAuthentication(
  userId: string,
  response: AuthenticationResponseJSON,
  credential: CredentialRow,
): Promise<VerifiedAuthenticationResponse> {
  const expectedChallenge = await redis.get(`webauthn:auth:${userId}`);
  if (!expectedChallenge) {
    throw ApiError.badRequest('Authentication challenge expired or not found');
  }

  // Consume the challenge immediately
  await redis.del(`webauthn:auth:${userId}`);

  try {
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: env.WEBAUTHN_ORIGIN,
      expectedRPID: env.WEBAUTHN_RP_ID,
      credential: {
        id: credential.credential_id,
        publicKey: new Uint8Array(credential.public_key),
        counter: credential.counter,
        transports: (credential.transports ?? undefined) as AuthenticatorTransportFuture[] | undefined,
      },
    });

    if (!verification.verified) {
      throw ApiError.badRequest('WebAuthn authentication verification failed');
    }

    logger.debug({ userId }, 'WebAuthn authentication verified');
    return verification;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    logger.error({ err, userId }, 'WebAuthn authentication verification error');
    throw ApiError.badRequest('WebAuthn authentication verification failed');
  }
}
