/**
 * @module ai-store
 * Zustand store for AI assistant response state, tracking the streaming response
 * text, processing status, and errors for the active channel.
 */

import { create } from 'zustand';

/** State and actions for the AI assistant response lifecycle. */
export interface AIState {
  /** Whether an AI response is currently being generated. */
  isProcessing: boolean;
  /** Accumulated streaming response text. */
  currentResponse: string;
  /** Error message from the last failed AI request, if any. */
  error: string | null;
  /** Which channel the AI response is for. */
  activeChannelId: string | null;

  /** Set the processing flag. */
  setProcessing: (processing: boolean) => void;
  /** Append a streamed text chunk to the current response. */
  appendResponse: (chunk: string) => void;
  /** Record an error and stop processing. */
  setError: (error: string | null) => void;
  /** Begin a new AI response for the given channel, resetting prior state. */
  startResponse: (channelId: string) => void;
  /** Clear all AI response state. */
  clearResponse: () => void;
}

export const useAIStore = create<AIState>()((set) => ({
  isProcessing: false,
  currentResponse: '',
  error: null,
  activeChannelId: null,

  setProcessing: (processing) => set({ isProcessing: processing }),
  appendResponse: (chunk) => set((s) => ({ currentResponse: s.currentResponse + chunk })),
  setError: (error) => set({ error, isProcessing: false }),
  startResponse: (channelId) => set({ isProcessing: true, currentResponse: '', error: null, activeChannelId: channelId }),
  clearResponse: () => set({ isProcessing: false, currentResponse: '', error: null, activeChannelId: null }),
}));
