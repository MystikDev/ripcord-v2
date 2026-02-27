/**
 * @module friend-store
 * Zustand store for friend relationships, pending requests, and blocked users.
 */

import { create } from 'zustand';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Friend {
  userId: string;
  handle: string;
  avatarUrl?: string;
}

export interface FriendRequest {
  userId: string;
  handle: string;
  avatarUrl?: string;
  createdAt: string;
}

export interface BlockedUser {
  userId: string;
  handle: string;
}

interface FriendState {
  /** Accepted friends. */
  friends: Friend[];
  /** Incoming friend requests (other users → me). */
  pendingIncoming: FriendRequest[];
  /** Outgoing friend requests (me → other users). */
  pendingOutgoing: FriendRequest[];
  /** Blocked users. */
  blocked: BlockedUser[];

  // Setters
  setFriends: (friends: Friend[]) => void;
  setPending: (incoming: FriendRequest[], outgoing: FriendRequest[]) => void;
  setBlocked: (blocked: BlockedUser[]) => void;

  // Granular mutations
  addFriend: (friend: Friend) => void;
  removeFriend: (userId: string) => void;
  addIncoming: (request: FriendRequest) => void;
  removeIncoming: (userId: string) => void;
  addOutgoing: (request: FriendRequest) => void;
  removeOutgoing: (userId: string) => void;
  addBlocked: (user: BlockedUser) => void;
  removeBlocked: (userId: string) => void;

  // Lookups
  isFriend: (userId: string) => boolean;
  isPendingIncoming: (userId: string) => boolean;
  isPendingOutgoing: (userId: string) => boolean;
  isBlockedUser: (userId: string) => boolean;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useFriendStore = create<FriendState>((set, get) => ({
  friends: [],
  pendingIncoming: [],
  pendingOutgoing: [],
  blocked: [],

  setFriends: (friends) => set({ friends }),
  setPending: (incoming, outgoing) => set({ pendingIncoming: incoming, pendingOutgoing: outgoing }),
  setBlocked: (blocked) => set({ blocked }),

  addFriend: (friend) => set((s) => ({
    friends: [...s.friends.filter((f) => f.userId !== friend.userId), friend],
  })),
  removeFriend: (userId) => set((s) => ({
    friends: s.friends.filter((f) => f.userId !== userId),
  })),

  addIncoming: (request) => set((s) => ({
    pendingIncoming: [...s.pendingIncoming.filter((r) => r.userId !== request.userId), request],
  })),
  removeIncoming: (userId) => set((s) => ({
    pendingIncoming: s.pendingIncoming.filter((r) => r.userId !== userId),
  })),

  addOutgoing: (request) => set((s) => ({
    pendingOutgoing: [...s.pendingOutgoing.filter((r) => r.userId !== request.userId), request],
  })),
  removeOutgoing: (userId) => set((s) => ({
    pendingOutgoing: s.pendingOutgoing.filter((r) => r.userId !== userId),
  })),

  addBlocked: (user) => set((s) => ({
    blocked: [...s.blocked.filter((b) => b.userId !== user.userId), user],
  })),
  removeBlocked: (userId) => set((s) => ({
    blocked: s.blocked.filter((b) => b.userId !== userId),
  })),

  // Lookups (non-reactive — call inside selectors or handlers)
  isFriend: (userId) => get().friends.some((f) => f.userId === userId),
  isPendingIncoming: (userId) => get().pendingIncoming.some((r) => r.userId === userId),
  isPendingOutgoing: (userId) => get().pendingOutgoing.some((r) => r.userId === userId),
  isBlockedUser: (userId) => get().blocked.some((b) => b.userId === userId),
}));
