/**
 * @module chat-area
 * Center content column. Renders an empty-channel placeholder or composes the
 * channel header, MessageList, TypingIndicator, AIResponseCard, and
 * MessageComposer for the active text channel.
 */
'use client';

import { useRef, useState, useCallback, type DragEvent } from 'react';
import { useHubStore } from '../../stores/server-store';
import { useAuthStore } from '../../stores/auth-store';
import { useSettingsStore } from '../../stores/settings-store';
import { MessageList } from '../chat/message-list';
import { MessageComposer, type MessageComposerHandle } from '../chat/message-composer';
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

  const composerRef = useRef<MessageComposerHandle>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);

  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    dragCounter.current++;
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      composerRef.current?.uploadFile(files[0]);
    }
  }, []);

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
    <div
      className="relative flex flex-1 flex-col bg-bg"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drop overlay */}
      {isDragging && (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-bg/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-accent p-10">
            <svg width="40" height="40" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-accent">
              <path d="M14 10v2.5a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 12.5V10M11 5l-3-3-3 3M8 2v8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <p className="text-lg font-medium text-text-primary">Drop to upload</p>
            <p className="text-sm text-text-muted">File will be encrypted and attached</p>
          </div>
        </div>
      )}

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
      <MessageComposer ref={composerRef} channelId={activeChannel.id} channelName={activeChannel.name} />
    </div>
  );
}
