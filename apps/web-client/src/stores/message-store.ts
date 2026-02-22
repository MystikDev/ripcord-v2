import { create } from 'zustand';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Message {
  id: string;
  channelId: string;
  authorId: string;
  authorHandle: string;
  content: string;
  createdAt: string;
  editedAt?: string;
  attachments?: Array<{
    id: string;
    fileNameEncrypted: string;
    fileSize: number;
    encryptionKeyId: string;
    nonce: string;
  }>;
}

export interface MessageState {
  messages: Record<string, Message[]>; // channelId -> messages

  addMessage: (channelId: string, message: Message) => void;
  setMessages: (channelId: string, messages: Message[]) => void;
  clearChannel: (channelId: string) => void;
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

  clearChannel: (channelId) =>
    set((state) => {
      const next = { ...state.messages };
      delete next[channelId];
      return { messages: next };
    }),

  reset: () => set({ messages: {} }),
}));
