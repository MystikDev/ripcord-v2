/**
 * @module member-store
 * Zustand store for hub member data. Caches user handles, avatars, and role
 * assignments for the currently active hub to support display and lookups.
 */

import { create } from 'zustand';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A role assigned to a member within a hub. */
export interface MemberRole {
  id: string;
  name: string;
}

/** Profile information for a single hub member. */
export interface MemberInfo {
  userId: string;
  handle: string;
  avatarUrl?: string;
  joinedAt: string;
  roles?: MemberRole[];
}

export interface MemberStore {
  /** userId -> MemberInfo */
  members: Record<string, MemberInfo>;

  /** Bulk set members (used when hub changes). */
  setMembers: (members: MemberInfo[]) => void;

  /** Get handle for a userId, returns undefined if not cached. */
  getHandle: (userId: string) => string | undefined;

  /** Get avatar URL for a userId, returns undefined if not cached. */
  getAvatarUrl: (userId: string) => string | undefined;

  /** Reset all member data. */
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useMemberStore = create<MemberStore>()((set, get) => ({
  members: {},

  setMembers: (members) =>
    set(() => {
      const map: Record<string, MemberInfo> = {};
      for (const m of members) {
        map[m.userId] = m;
      }
      return { members: map };
    }),

  getHandle: (userId) => get().members[userId]?.handle,

  getAvatarUrl: (userId) => get().members[userId]?.avatarUrl,

  reset: () => set({ members: {} }),
}));
