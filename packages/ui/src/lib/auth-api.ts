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
interface AuthTokens {
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
    // Server returns { ok: false, error: { code, message, details? } }
    const msg = typeof err.error === 'string' ? err.error : err.error?.message ?? err.message ?? `HTTP ${res.status}`;
    throw new Error(msg);
  }
  const json = await res.json();
  // Server wraps responses in { ok, data }; unwrap to return just the data
  return (json.data ?? json) as T;
}

// ---------------------------------------------------------------------------
// Register
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
// Login
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
// Password Register
// ---------------------------------------------------------------------------

export async function registerPassword(
  handle: string,
  password: string,
): Promise<AuthTokens> {
  const pubIdentityKey = generatePlaceholderIdentityKey();
  const res = await post<ServerAuthResponse>('/v1/auth/password/register', {
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
// Password Login
// ---------------------------------------------------------------------------

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
