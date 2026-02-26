import {
  startRegistration,
  startAuthentication,
} from '@simplewebauthn/browser';
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';
import { getAuthBaseUrl } from './constants';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Flat token shape consumed by the auth store */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  userId: string;
  handle: string;
  avatarUrl?: string;
  deviceId: string;
}

/** Shape the server actually returns (after unwrapping { ok, data }) */
interface ServerAuthResponse {
  tokenPair: { accessToken: string; refreshToken: string; expiresIn: number };
  session: { sessionId: string; userId: string; deviceId: string };
  user: { id: string; handle: string; avatarUrl?: string };
}

/** Pending verification info returned when registration defers tokens. */
export interface PendingVerification {
  userId: string;
  handle: string;
  maskedEmail: string;
}

/** Custom error thrown when login is blocked because the email is not verified. */
export class EmailNotVerifiedError extends Error {
  userId: string;
  handle: string;
  maskedEmail: string;

  constructor(userId: string, handle: string, maskedEmail: string) {
    super('Please verify your email before logging in');
    this.name = 'EmailNotVerifiedError';
    this.userId = userId;
    this.handle = handle;
    this.maskedEmail = maskedEmail;
  }
}

/** Generate a placeholder identity key for E2EE device registration */
function generatePlaceholderIdentityKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${getAuthBaseUrl()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: 'Request failed' } }));

    // Check for EMAIL_NOT_VERIFIED error from login
    if (err.error?.code === 'EMAIL_NOT_VERIFIED' && err.error?.details) {
      const { userId, handle, maskedEmail } = err.error.details as {
        userId: string;
        handle: string;
        maskedEmail: string;
      };
      throw new EmailNotVerifiedError(userId, handle, maskedEmail);
    }

    // Server returns { ok: false, error: { code, message, details? } }
    const msg = typeof err.error === 'string' ? err.error : err.error?.message ?? err.message ?? `HTTP ${res.status}`;
    throw new Error(msg);
  }
  const json = await res.json();
  // Server wraps responses in { ok, data }; unwrap to return just the data
  return (json.data ?? json) as T;
}

// ---------------------------------------------------------------------------
// Register (Passkey)
// ---------------------------------------------------------------------------

export async function registerPasskey(handle: string): Promise<AuthTokens> {
  // 1. Begin registration -- server returns WebAuthn creation options
  const options = await post<PublicKeyCredentialCreationOptionsJSON>(
    '/v1/auth/register/begin',
    { handle },
  );

  // 2. Browser WebAuthn ceremony
  const credential = await startRegistration({ optionsJSON: options });

  // 3. Finish registration -- server verifies and returns tokens
  const pubIdentityKey = generatePlaceholderIdentityKey();
  const res = await post<ServerAuthResponse>('/v1/auth/register/finish', {
    handle,
    credential,
    pubIdentityKey,
  });

  return {
    accessToken: res.tokenPair.accessToken,
    refreshToken: res.tokenPair.refreshToken,
    userId: res.user.id,
    handle: res.user.handle,
    avatarUrl: res.user.avatarUrl,
    deviceId: res.session.deviceId,
  };
}

// ---------------------------------------------------------------------------
// Login (Passkey)
// ---------------------------------------------------------------------------

export async function loginPasskey(handle: string): Promise<AuthTokens> {
  // 1. Begin authentication
  const options = await post<PublicKeyCredentialRequestOptionsJSON>(
    '/v1/auth/login/begin',
    { handle },
  );

  // 2. Browser WebAuthn ceremony
  const credential = await startAuthentication({ optionsJSON: options });

  // 3. Finish authentication
  const pubIdentityKey = generatePlaceholderIdentityKey();
  const res = await post<ServerAuthResponse>('/v1/auth/login/finish', {
    handle,
    credential,
    pubIdentityKey,
  });

  return {
    accessToken: res.tokenPair.accessToken,
    refreshToken: res.tokenPair.refreshToken,
    userId: res.user.id,
    handle: res.user.handle,
    avatarUrl: res.user.avatarUrl,
    deviceId: res.session.deviceId,
  };
}

// ---------------------------------------------------------------------------
// Password Register (returns PendingVerification, not tokens)
// ---------------------------------------------------------------------------

export async function registerPassword(
  handle: string,
  email: string,
  password: string,
): Promise<PendingVerification> {
  const pubIdentityKey = generatePlaceholderIdentityKey();
  return post<PendingVerification>('/v1/auth/password/register', {
    handle,
    email,
    password,
    pubIdentityKey,
  });
}

// ---------------------------------------------------------------------------
// Password Login
// ---------------------------------------------------------------------------

/**
 * Login with handle + password.
 *
 * @throws {EmailNotVerifiedError} if the account hasn't been verified yet.
 */
export async function loginPassword(
  handle: string,
  password: string,
): Promise<AuthTokens> {
  const pubIdentityKey = generatePlaceholderIdentityKey();
  const res = await post<ServerAuthResponse>('/v1/auth/password/login', {
    handle,
    password,
    pubIdentityKey,
  });

  return {
    accessToken: res.tokenPair.accessToken,
    refreshToken: res.tokenPair.refreshToken,
    userId: res.user.id,
    handle: res.user.handle,
    avatarUrl: res.user.avatarUrl,
    deviceId: res.session.deviceId,
  };
}

// ---------------------------------------------------------------------------
// Email Verification
// ---------------------------------------------------------------------------

/**
 * Submit a 6-digit verification code.
 * On success, the user is activated and tokens are returned.
 */
export async function verifyEmail(
  userId: string,
  code: string,
): Promise<AuthTokens> {
  const res = await post<ServerAuthResponse>('/v1/auth/verify-email', {
    userId,
    code,
  });

  return {
    accessToken: res.tokenPair.accessToken,
    refreshToken: res.tokenPair.refreshToken,
    userId: res.user.id,
    handle: res.user.handle,
    avatarUrl: res.user.avatarUrl,
    deviceId: res.session.deviceId,
  };
}

/**
 * Request a new verification code to be sent.
 */
export async function resendVerificationCode(userId: string): Promise<void> {
  await post<{ message: string }>('/v1/auth/verify-email/resend', { userId });
}

// ---------------------------------------------------------------------------
// Password Reset
// ---------------------------------------------------------------------------

/** Response from requesting a password reset. */
export interface PasswordResetInfo {
  userId: string;
  maskedEmail: string;
}

/**
 * Request a password reset code be sent to the email on file.
 *
 * @param handle - The user's display handle.
 * @returns userId and masked email for the code entry screen.
 */
export async function requestPasswordReset(handle: string): Promise<PasswordResetInfo> {
  return post<PasswordResetInfo>('/v1/auth/password-reset', { handle });
}

/**
 * Confirm a password reset with the 6-digit code and a new password.
 */
export async function confirmPasswordReset(
  userId: string,
  code: string,
  newPassword: string,
): Promise<void> {
  await post<{ message: string }>('/v1/auth/password-reset/confirm', {
    userId,
    code,
    newPassword,
  });
}

/**
 * Resend the password reset code.
 */
export async function resendPasswordResetCode(userId: string): Promise<void> {
  await post<{ message: string }>('/v1/auth/password-reset/resend', { userId });
}

// ---------------------------------------------------------------------------
// Logout
// ---------------------------------------------------------------------------

export async function logoutApi(refreshToken: string): Promise<void> {
  await fetch(`${getAuthBaseUrl()}/v1/auth/logout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  }).catch(() => {
    // Best-effort logout; ignore network errors
  });
}
