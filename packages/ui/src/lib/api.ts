/**
 * Core API fetch wrapper for the Ripcord client.
 *
 * All API calls flow through {@link apiFetch}, which handles:
 *   - Automatic `Authorization: Bearer <token>` header injection
 *   - Transparent 401 → token refresh → retry (one attempt)
 *   - Server response unwrapping (`{ ok, data }` → `data`)
 *   - Error extraction from structured server error responses
 *
 * @module api
 */

import { getApiBaseUrl, getAuthBaseUrl } from './constants';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Normalized response returned by {@link apiFetch}. */
export interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
  status: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Dynamically import the auth store to avoid circular deps */
async function getAuthStore() {
  const { useAuthStore } = await import('../stores/auth-store');
  return useAuthStore;
}

/**
 * Attempt to refresh the JWT access token using the stored refresh token.
 * On success, updates the auth store with new tokens. On failure, logs out.
 */
async function refreshAccessToken(): Promise<string | null> {
  const store = await getAuthStore();
  const { refreshToken, setTokens, logout } = store.getState();
  if (!refreshToken) return null;

  try {
    const res = await fetch(`${getAuthBaseUrl()}/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) {
      logout();
      return null;
    }

    const body = await res.json();
    // Server wraps in { ok, data: { tokenPair: { accessToken, refreshToken } } }
    const tokenData = body.data?.tokenPair ?? body;
    setTokens(tokenData.accessToken, tokenData.refreshToken);
    return tokenData.accessToken as string;
  } catch {
    logout();
    return null;
  }
}

// ---------------------------------------------------------------------------
// Core fetch wrapper
// ---------------------------------------------------------------------------

/**
 * Authenticated fetch wrapper for the Ripcord API.
 *
 * Automatically attaches the JWT access token, sets Content-Type to JSON
 * (unless overridden), and unwraps the server's `{ ok, data }` envelope.
 * On 401, transparently refreshes the token and retries once.
 *
 * @param path   - API path (e.g. `/v1/hubs`). Prepended with `baseUrl`.
 * @param options - Standard `RequestInit` plus optional `baseUrl` override.
 * @returns Normalized response with `ok`, `data`, `error`, and `status`.
 */
export async function apiFetch<T>(
  path: string,
  options: RequestInit & { baseUrl?: string } = {},
): Promise<ApiResponse<T>> {
  const { baseUrl = getApiBaseUrl(), ...init } = options;
  const store = await getAuthStore();
  const { accessToken } = store.getState();

  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, { ...init, headers });
  } catch (err) {
    return { ok: false, error: (err as Error).message, status: 0 };
  }

  // Auto-refresh on 401 and retry once
  if (res.status === 401 && accessToken) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers.set('Authorization', `Bearer ${newToken}`);
      try {
        res = await fetch(`${baseUrl}${path}`, { ...init, headers });
      } catch (err) {
        return { ok: false, error: (err as Error).message, status: 0 };
      }
    }
  }

  // Parse body
  let data: T | undefined;
  let error: string | undefined;
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const body = await res.json();
    if (res.ok) {
      // Server wraps responses in { ok, data }; unwrap to return just the data
      data = (body.data ?? body) as T;
    } else {
      // Server returns { ok: false, error: { code, message, details? } }
      const rawError = body.error;
      error = typeof rawError === 'string' ? rawError : rawError?.message ?? body.message ?? 'Unknown error';
    }
  } else if (!res.ok) {
    error = await res.text();
  }

  return { ok: res.ok, data, error, status: res.status };
}
