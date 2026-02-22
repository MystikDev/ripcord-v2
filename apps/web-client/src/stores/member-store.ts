import { create } from 'zustand';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MemberRole {
  id: string;
  name: string;
}

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
