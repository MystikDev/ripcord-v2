import { create } from 'zustand';

export interface AIState {
  isProcessing: boolean;
  currentResponse: string;
  error: string | null;
  /** Which channel the AI response is for. */
  activeChannelId: string | null;

  setProcessing: (processing: boolean) => void;
  appendResponse: (chunk: string) => void;
  setError: (error: string | null) => void;
  startResponse: (channelId: string) => void;
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
