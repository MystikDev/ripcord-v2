/**
 * @module message-store
 * Zustand store for channel message history. Holds messages keyed by channel ID,
 * handles optimistic-send deduplication, and provides CRUD operations.
 */

import { create } from 'zustand';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single chat message, potentially with encrypted attachments. */
export interface Message {
  id: string;
  channelId: string;
  authorId: string;
  authorHandle: string;
  content: string;
  createdAt: string;
  editedAt?: string;
  /** ISO-8601 timestamp if the message is pinned. */
  pinnedAt?: string;
  /** User ID of who pinned the message. */
  pinnedBy?: string;
  attachments?: Array<{
    id: string;
    fileNameEncrypted: string;
    fileSize: number;
    contentTypeEncrypted?: string | null;
    encryptionKeyId: string;
    nonce: string;
  }>;
}

/** State and actions for managing per-channel message lists. */
export interface MessageState {
  /** Channel ID to ordered message array. */
  messages: Record<string, Message[]>;

  /** Append a message, deduplicating optimistic sends. */
  addMessage: (channelId: string, message: Message) => void;
  /** Replace the entire message list for a channel. */
  setMessages: (channelId: string, messages: Message[]) => void;
  /** Update specific fields on a message in a channel. */
  updateMessage: (channelId: string, messageId: string, updates: Partial<Message>) => void;
  /** Remove all messages for a channel. */
  clearChannel: (channelId: string) => void;
  /** Reset all message data. */
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useMessageStore = create<MessageState>()((set) => ({
  messages: {},

  addMessage: (channelId, message) =>
    set((state) => {
      const existing = state.messages[channelId] ?? [];

      // Skip if a message with this exact ID already exists (duplicate event)
      if (existing.some((m) => m.id === message.id)) {
        return state;
      }

      // If this is a real message from the server (not temp), remove any
      // optimistic temp message from the same author to avoid duplicates
      let filtered = existing;
      if (!message.id.startsWith('temp-')) {
        filtered = existing.filter(
          (m) => !(m.id.startsWith('temp-') && m.authorId === message.authorId),
        );
      }

      return {
        messages: {
          ...state.messages,
          [channelId]: [...filtered, message],
        },
      };
    }),

  setMessages: (channelId, messages) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [channelId]: messages,
      },
    })),

  updateMessage: (channelId, messageId, updates) =>
    set((state) => {
      const list = state.messages[channelId];
      if (!list) return state;

      const idx = list.findIndex((m) => m.id === messageId);
      if (idx === -1) return state;

      const updated = [...list];
      updated[idx] = { ...updated[idx]!, ...updates };
      return {
        messages: {
          ...state.messages,
          [channelId]: updated,
        },
      };
    }),

  clearChannel: (channelId) =>
    set((state) => {
      const next = { ...state.messages };
      delete next[channelId];
      return { messages: next };
    }),

  reset: () => set({ messages: {} }),
}));
