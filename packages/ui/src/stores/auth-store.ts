import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  userId: string | null;
  handle: string | null;
  avatarUrl: string | null;
  deviceId: string | null;
  isAuthenticated: boolean;

  setTokens: (access: string, refresh: string) => void;
  setUser: (userId: string, handle: string, deviceId?: string, avatarUrl?: string) => void;
  setAvatarUrl: (url: string | null) => void;
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

      logout: () =>
        set({
          accessToken: null,
          refreshToken: null,
          userId: null,
          handle: null,
          avatarUrl: null,
          deviceId: null,
          isAuthenticated: false,
        }),
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
