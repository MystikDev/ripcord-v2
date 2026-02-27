/**
 * @module admin-store
 * Zustand store for hub administration state, holding the member and ban lists
 * used by the admin panel along with loading/error status.
 */

import { create } from 'zustand';
import type { MemberResponse, BanResponse } from '../lib/admin-api';

/** State and actions for the hub admin panel. */
interface AdminState {
  /** Members of the current hub. */
  members: MemberResponse[];
  /** Banned users for the current hub. */
  bans: BanResponse[];
  /** Whether an admin data fetch is in progress. */
  isLoading: boolean;
  /** Error message from the last failed admin operation. */
  error: string | null;
  /** Replace the member list. */
  setMembers: (members: MemberResponse[]) => void;
  /** Replace the ban list. */
  setBans: (bans: BanResponse[]) => void;
  /** Set the loading flag. */
  setLoading: (loading: boolean) => void;
  /** Set or clear the error message. */
  setError: (error: string | null) => void;
  /** Optimistically remove a member by user ID. */
  removeMember: (userId: string) => void;
  /** Optimistically remove a ban by user ID. */
  removeBan: (userId: string) => void;
  /** Update a member's role list in-place (after assign/remove). */
  updateMemberRoles: (userId: string, roles: { id: string; name: string }[]) => void;
  /** Reset all admin state. */
  reset: () => void;
}

export const useAdminStore = create<AdminState>((set) => ({
  members: [],
  bans: [],
  isLoading: false,
  error: null,
  setMembers: (members) => set({ members }),
  setBans: (bans) => set({ bans }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  removeMember: (userId) => set((s) => ({ members: s.members.filter((m) => m.userId !== userId) })),
  removeBan: (userId) => set((s) => ({ bans: s.bans.filter((b) => b.userId !== userId) })),
  updateMemberRoles: (userId, roles) =>
    set((s) => ({
      members: s.members.map((m) => (m.userId === userId ? { ...m, roles } : m)),
    })),
  reset: () => set({ members: [], bans: [], isLoading: false, error: null }),
}));
