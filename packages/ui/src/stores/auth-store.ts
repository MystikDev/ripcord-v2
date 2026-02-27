/**
 * @module auth-store
 * Zustand store for authentication state. Holds JWT tokens, user identity, and
 * device ID. Persisted to localStorage (excluding the short-lived access token)
 * so that sessions survive page reloads.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Authentication state and actions. */
export interface AuthState {
  /** Short-lived JWT access token (kept in memory only). */
  accessToken: string | null;
  /** Long-lived refresh token (persisted to localStorage). */
  refreshToken: string | null;
  /** Current user's ID. */
  userId: string | null;
  /** Current user's display handle. */
  handle: string | null;
  /** URL to the current user's avatar image. */
  avatarUrl: string | null;
  /** Device identifier for this client, used in token refresh. */
  deviceId: string | null;
  /** Whether the user is currently logged in. */
  isAuthenticated: boolean;

  /** Store a new access/refresh token pair and mark as authenticated. */
  setTokens: (access: string, refresh: string) => void;
  /** Store user identity fields after login or profile fetch. */
  setUser: (userId: string, handle: string, deviceId?: string, avatarUrl?: string) => void;
  /** Update the avatar URL (e.g. after upload). */
  setAvatarUrl: (url: string | null) => void;
  /** Clear all auth state (logout). */
  logout: () => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      userId: null,
      handle: null,
      avatarUrl: null,
      deviceId: null,
      isAuthenticated: false,

      setTokens: (access, refresh) =>
        set({ accessToken: access, refreshToken: refresh, isAuthenticated: true }),

      setUser: (userId, handle, deviceId, avatarUrl) =>
        set({ userId, handle, avatarUrl: avatarUrl ?? null, ...(deviceId ? { deviceId } : {}) }),

      setAvatarUrl: (url) => set({ avatarUrl: url }),

      logout: () => {
        // Clear "Remember me" so the next launch shows the login screen
        localStorage.removeItem('ripcord-remember-me');
        set({
          accessToken: null,
          refreshToken: null,
          userId: null,
          handle: null,
          avatarUrl: null,
          deviceId: null,
          isAuthenticated: false,
        });
      },
    }),
    {
      name: 'ripcord-auth',
      // Only persist refresh token and user info — access token stays in memory
      // to limit exposure from localStorage theft (XSS, extensions, etc.)
      partialize: (state) => ({
        refreshToken: state.refreshToken,
        userId: state.userId,
        handle: state.handle,
        avatarUrl: state.avatarUrl,
        deviceId: state.deviceId,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);
