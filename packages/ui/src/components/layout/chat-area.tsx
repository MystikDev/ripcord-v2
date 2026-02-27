/**
 * @module chat-area
 * ORBIT-styled center content column. Floating HUD header over the spatial
 * message stream, with the command interface (composer) at the bottom.
 */
'use client';

import { useRef, useState, useCallback, useMemo, type DragEvent } from 'react';
import { useHubStore } from '../../stores/server-store';
import { useAuthStore } from '../../stores/auth-store';
import { useSettingsStore } from '../../stores/settings-store';
import { useCallStore } from '../../stores/call-store';
import { MessageList } from '../chat/message-list';
import { MessageComposer, type MessageComposerHandle } from '../chat/message-composer';
import { TypingIndicator } from '../chat/typing-indicator';
import { AIResponseCard } from '../chat/ai-response-card';
import { PinnedMessagesPanel } from '../chat/pinned-messages-panel';
import { BookmarksPanel } from '../chat/bookmarks-panel';
import { sendMessage } from '../../lib/hub-api';
import { getDmVoiceToken } from '../../lib/voice-api';
import { gateway } from '../../lib/gateway-client';
import clsx from 'clsx';

// Gateway opcodes for call signaling
const OP_CALL_INVITE = 30;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ChatArea() {
  const channels = useHubStore((s) => s.channels);
  const activeChannelId = useHubStore((s) => s.activeChannelId);
  const isDmView = useHubStore((s) => s.isDmView);
  const activeDmChannelId = useHubStore((s) => s.activeDmChannelId);
  const dmChannels = useHubStore((s) => s.dmChannels);
  const currentUserId = useAuthStore((s) => s.userId);
  const memberListVisible = useSettingsStore((s) => s.memberListVisible);
  const toggleMemberList = useSettingsStore((s) => s.toggleMemberList);

  const callStatus = useCallStore((s) => s.status);

  const composerRef = useRef<MessageComposerHandle>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showPinned, setShowPinned] = useState(false);
  const [showBookmarks, setShowBookmarks] = useState(false);
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

  // Resolve what channel to display
  const activeChannel = channels.find((c) => c.id === activeChannelId);

  // For DM view, resolve the DM channel info
  const activeDm = useMemo(() => {
    if (!isDmView || !activeDmChannelId) return null;
    return dmChannels.find((dm) => dm.channelId === activeDmChannelId) ?? null;
  }, [isDmView, activeDmChannelId, dmChannels]);

  // Start a DM call: fetch voice token, set store, send invite
  const handleStartCall = useCallback(async (withVideo = false) => {
    if (!activeDmChannelId || !activeDm) return;
    const auth = useAuthStore.getState();
    const other = activeDm.participants.find((p) => p.userId !== auth.userId);
    if (!other) return;

    try {
      const { roomId } = await getDmVoiceToken(activeDmChannelId);

      useCallStore.getState().startCall({
        roomId,
        channelId: activeDmChannelId,
        remoteUserId: other.userId,
        remoteHandle: other.handle,
        withVideo,
      });

      gateway.send(OP_CALL_INVITE, {
        roomId,
        channelId: activeDmChannelId,
        fromUserId: auth.userId,
        fromHandle: auth.handle,
        toUserId: other.userId,
        withVideo,
      });
    } catch (err) {
      console.error('Failed to start call:', err);
    }
  }, [activeDmChannelId, activeDm]);

  // Determine the channel ID and display name to use
  const effectiveChannelId = isDmView ? activeDmChannelId : activeChannel?.id;
  const effectiveChannelName = isDmView
    ? (activeDm?.participants.find((p) => p.userId !== currentUserId)?.handle ?? 'DM')
    : activeChannel?.name;

  if (!effectiveChannelId) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-transparent">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5 border border-white/10">
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
          <h3 className="text-lg font-semibold display-text text-text-primary">
            {isDmView ? 'Select a conversation' : 'Select a channel'}
          </h3>
          <p className="mt-1 text-sm text-text-muted">
            {isDmView
              ? 'Pick a conversation from the sidebar to start chatting'
              : 'Pick a channel from the sidebar to start chatting'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Main chat column */}
      <div
        className="relative flex flex-1 flex-col bg-transparent"
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* Drop overlay */}
        {isDragging && (
          <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-void/80 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-accent/30 glass-panel p-10">
              <svg width="40" height="40" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-accent">
                <path d="M14 10v2.5a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 12.5V10M11 5l-3-3-3 3M8 2v8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <p className="text-lg font-medium display-text text-text-primary">Drop to upload</p>
              <p className="text-sm text-text-muted">File will be encrypted and attached</p>
            </div>
          </div>
        )}

        {/* Floating HUD header */}
        <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-6 py-4 pointer-events-none">
          <div className="glass-panel px-5 py-2.5 rounded-2xl pointer-events-auto flex items-center gap-3">
            {isDmView ? (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-accent">
                <path d="M8 14c3.866 0 7-2.686 7-6s-3.134-6-7-6-7 2.686-7 6c0 1.278.44 2.462 1.194 3.434L1.5 14.5l3.21-.92A7.576 7.576 0 008 14z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="text-accent">
                <path d="M2.5 3.5A1.5 1.5 0 014 2h8a1.5 1.5 0 011.5 1.5v7A1.5 1.5 0 0112 12H5.5L2.5 14.5v-11z" />
              </svg>
            )}
            <h3 className="font-semibold display-text text-text-primary">{effectiveChannelName}</h3>
            <div className="w-px h-5 bg-white/10" />
            <div className="flex items-center gap-1.5 text-xs text-text-muted">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              <span>active</span>
            </div>
          </div>

          <div className="glass-panel px-3 py-2 rounded-2xl pointer-events-auto flex items-center gap-2">
            {/* Voice call button (DM only) */}
            {isDmView && activeDm && (
              <button
                onClick={() => void handleStartCall(false)}
                disabled={callStatus !== 'idle'}
                className={clsx(
                  'w-9 h-9 rounded-xl flex items-center justify-center transition-colors',
                  callStatus !== 'idle'
                    ? 'text-text-muted/50 cursor-not-allowed'
                    : 'bg-white/5 hover:bg-white/10 text-text-muted hover:text-accent',
                )}
                title={callStatus !== 'idle' ? 'Already in a call' : 'Start voice call'}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1.5 4.5a2 2 0 012-2h1.382a1 1 0 01.894.553l.723 1.447a1 1 0 01-.15 1.084l-.69.767a.5.5 0 00-.05.577 6.517 6.517 0 003.962 3.962.5.5 0 00.577-.05l.768-.69a1 1 0 011.084-.15l1.447.723a1 1 0 01.553.894V12.5a2 2 0 01-2 2A11.5 11.5 0 011.5 4.5z" />
                </svg>
              </button>
            )}

            {/* Video call button (DM only) */}
            {isDmView && activeDm && (
              <button
                onClick={() => void handleStartCall(true)}
                disabled={callStatus !== 'idle'}
                className={clsx(
                  'w-9 h-9 rounded-xl flex items-center justify-center transition-colors',
                  callStatus !== 'idle'
                    ? 'text-text-muted/50 cursor-not-allowed'
                    : 'bg-white/5 hover:bg-white/10 text-text-muted hover:text-accent',
                )}
                title={callStatus !== 'idle' ? 'Already in a call' : 'Start video call'}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="1" y="3.5" width="10" height="9" rx="1.5" />
                  <path d="M11 7l4-2.5v7L11 9" />
                </svg>
              </button>
            )}

            {/* Bookmarks toggle */}
            <button
              onClick={() => setShowBookmarks((v) => !v)}
              className={clsx(
                'w-9 h-9 rounded-xl flex items-center justify-center transition-colors',
                showBookmarks
                  ? 'bg-accent/20 text-accent'
                  : 'bg-white/5 hover:bg-white/10 text-text-muted hover:text-text-secondary',
              )}
              title="Bookmarks"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 2h10a1 1 0 011 1v12l-6-3-6 3V3a1 1 0 011-1z" />
              </svg>
            </button>

            {/* Pinned messages toggle */}
            <button
              onClick={() => setShowPinned((v) => !v)}
              className={clsx(
                'w-9 h-9 rounded-xl flex items-center justify-center transition-colors',
                showPinned
                  ? 'bg-accent/20 text-accent'
                  : 'bg-white/5 hover:bg-white/10 text-text-muted hover:text-text-secondary',
              )}
              title="Pinned messages"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9.828 1.172a1 1 0 011.414 0l3.586 3.586a1 1 0 010 1.414L12 9l-1 4-4-4-4.5 4.5M7 9L2.172 4.172l2.828-2.829L9.828 6" />
              </svg>
            </button>

            {/* Member list toggle (only for hub channels, not DMs) */}
            {!isDmView && (
              <button
                onClick={toggleMemberList}
                className={clsx(
                  'w-9 h-9 rounded-xl flex items-center justify-center transition-colors',
                  memberListVisible
                    ? 'bg-accent/20 text-accent'
                    : 'bg-white/5 hover:bg-white/10 text-text-muted hover:text-text-secondary',
                )}
                title="Toggle member list"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M6 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 1c-2.67 0-5 1.34-5 3v1h10v-1c0-1.66-2.33-3-5-3zm9-3a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm0 1c-1.83 0-3.5.84-3.5 2v1H16v-1c0-1.16-1.17-2-2-2z" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Messages — with top padding for floating HUD */}
        <div className="flex-1 flex flex-col pt-16 min-h-0 overflow-hidden">
          <MessageList channelId={effectiveChannelId} />
        </div>

        {/* Typing indicator */}
        <div className="shrink-0">
          <TypingIndicator channelId={effectiveChannelId} />
        </div>

        {/* AI response card */}
        <div className="shrink-0">
          <AIResponseCard
            channelId={effectiveChannelId}
            onSendAsMessage={(text) => {
              const userId = useAuthStore.getState().userId ?? '';
              sendMessage(effectiveChannelId, userId, 'dev-device', text).catch(console.error);
            }}
          />
        </div>

        {/* Command Interface (Composer) */}
        <MessageComposer ref={composerRef} channelId={effectiveChannelId} channelName={effectiveChannelName ?? ''} />
      </div>

      {/* Pinned messages panel */}
      {showPinned && (
        <PinnedMessagesPanel
          channelId={effectiveChannelId}
          onClose={() => setShowPinned(false)}
        />
      )}

      {/* Bookmarks panel */}
      {showBookmarks && (
        <BookmarksPanel onClose={() => setShowBookmarks(false)} />
      )}
    </div>
  );
}
