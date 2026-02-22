'use client';

import { useHubStore } from '../../stores/server-store';
import { useAuthStore } from '../../stores/auth-store';
import { useSettingsStore } from '../../stores/settings-store';
import { MessageList } from '../chat/message-list';
import { MessageComposer } from '../chat/message-composer';
import { TypingIndicator } from '../chat/typing-indicator';
import { AIResponseCard } from '../chat/ai-response-card';
import { sendMessage } from '../../lib/hub-api';
import clsx from 'clsx';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ChatArea() {
  const channels = useHubStore((s) => s.channels);
  const activeChannelId = useHubStore((s) => s.activeChannelId);
  const memberListVisible = useSettingsStore((s) => s.memberListVisible);
  const toggleMemberList = useSettingsStore((s) => s.toggleMemberList);

  const activeChannel = channels.find((c) => c.id === activeChannelId);

  if (!activeChannel) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-bg">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-surface-2">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" className="text-text-muted">
              <path
                d="M16 4C9.373 4 4 9.373 4 16c0 2.12.55 4.114 1.516 5.846L4.1 27.1a1.5 1.5 0 001.8 1.8l5.254-1.416A11.94 11.94 0 0016 28c6.627 0 12-5.373 12-12S22.627 4 16 4z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-text-primary">
            Select a channel
          </h3>
          <p className="mt-1 text-sm text-text-muted">
            Pick a channel from the sidebar to start chatting
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col bg-bg">
      {/* Channel header */}
      <div className="flex h-12 items-center border-b border-border px-4">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="mr-2 text-text-muted">
          <path d="M2.5 3.5A1.5 1.5 0 014 2h8a1.5 1.5 0 011.5 1.5v7A1.5 1.5 0 0112 12H5.5L2.5 14.5v-11z" />
        </svg>
        <h3 className="font-semibold text-text-primary">{activeChannel.name}</h3>

        <div className="flex-1" />

        {/* Member list toggle */}
        <button
          onClick={toggleMemberList}
          className={clsx(
            'rounded-md p-1.5 transition-colors',
            memberListVisible
              ? 'bg-surface-2 text-text-primary'
              : 'text-text-muted hover:bg-surface-2 hover:text-text-secondary',
          )}
          title="Toggle member list"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M6 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 1c-2.67 0-5 1.34-5 3v1h10v-1c0-1.66-2.33-3-5-3zm9-3a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm0 1c-1.83 0-3.5.84-3.5 2v1H16v-1c0-1.16-1.17-2-2-2z" />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <MessageList channelId={activeChannel.id} />

      {/* Typing indicator */}
      <TypingIndicator channelId={activeChannel.id} />

      {/* AI response card */}
      <AIResponseCard
        channelId={activeChannel.id}
        onSendAsMessage={(text) => {
          const userId = useAuthStore.getState().userId ?? '';
          sendMessage(activeChannel.id, userId, 'dev-device', text).catch(console.error);
        }}
      />

      {/* Composer */}
      <MessageComposer channelId={activeChannel.id} channelName={activeChannel.name} />
    </div>
  );
}
