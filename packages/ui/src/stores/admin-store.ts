import { create } from 'zustand';
import type { MemberResponse, BanResponse } from '../lib/admin-api';

interface AdminState {
  members: MemberResponse[];
  bans: BanResponse[];
  isLoading: boolean;
  error: string | null;
  setMembers: (members: MemberResponse[]) => void;
  setBans: (bans: BanResponse[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  removeMember: (userId: string) => void;
  removeBan: (userId: string) => void;
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
  reset: () => set({ members: [], bans: [], isLoading: false, error: null }),
}));
