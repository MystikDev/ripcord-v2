/**
 * @module bookmark-store
 * Client-side message bookmarks persisted to localStorage. Since messages are
 * E2EE, bookmarks must live entirely on the client.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Bookmark {
  /** Message ID */
  messageId: string;
  /** Channel ID the message belongs to */
  channelId: string;
  /** Author display name at time of bookmark */
  authorHandle: string;
  /** Message content preview (first 200 chars) */
  contentPreview: string;
  /** ISO timestamp of the original message */
  messageTimestamp: string;
  /** ISO timestamp when the bookmark was created */
  bookmarkedAt: string;
}

interface BookmarkState {
  bookmarks: Bookmark[];
  addBookmark: (bookmark: Omit<Bookmark, 'bookmarkedAt'>) => void;
  removeBookmark: (messageId: string) => void;
  isBookmarked: (messageId: string) => boolean;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useBookmarkStore = create<BookmarkState>()(
  persist(
    (set, get) => ({
      bookmarks: [],

      addBookmark: (bookmark) =>
        set((s) => ({
          bookmarks: [
            { ...bookmark, bookmarkedAt: new Date().toISOString() },
            ...s.bookmarks,
          ],
        })),

      removeBookmark: (messageId) =>
        set((s) => ({
          bookmarks: s.bookmarks.filter((b) => b.messageId !== messageId),
        })),

      isBookmarked: (messageId) =>
        get().bookmarks.some((b) => b.messageId === messageId),
    }),
    {
      name: 'ripcord-bookmarks',
    },
  ),
);
