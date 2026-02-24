'use client';

/**
 * @module use-gateway
 * Manages the WebSocket gateway lifecycle and routes incoming real-time events
 * (messages, presence, typing, voice state) to the appropriate Zustand stores.
 */

import { useEffect } from 'react';
import { useAuthStore } from '../stores/auth-store';
import { useMessageStore, type Message } from '../stores/message-store';
import { usePresenceStore, type PresenceStatus } from '../stores/presence-store';
import { useTypingStore } from '../stores/typing-store';
import { useVoiceStateStore } from '../stores/voice-state-store';
import { useMemberStore } from '../stores/member-store';
import { gateway } from '../lib/gateway-client';
import { useSettingsStore } from '../stores/settings-store';
import { playJoinSound, playLeaveSound } from '../lib/notification-sounds';

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Manages gateway lifecycle: connect on auth, disconnect on logout,
 * and routes incoming events to the appropriate stores.
 */
export function useGateway() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const addMessage = useMessageStore((s) => s.addMessage);
  const setPresence = usePresenceStore((s) => s.setPresence);
  const addTyping = useTypingStore((s) => s.addTyping);
  const addVoiceParticipant = useVoiceStateStore((s) => s.addParticipant);
  const removeVoiceParticipant = useVoiceStateStore((s) => s.removeParticipant);
  const updateVoiceParticipant = useVoiceStateStore((s) => s.updateParticipant);

  useEffect(() => {
    if (!isAuthenticated || !accessToken) {
      gateway.disconnect();
      return;
    }

    // Connect
    gateway.connect(accessToken);

    // Subscribe to events
    const unsubs: Array<() => void> = [];

    // Real-time messages
    unsubs.push(
      gateway.on('MESSAGE_CREATED', (data) => {
        // Server broadcasts raw message shape: { id, channelId, senderUserId, envelope, ... }
        const raw = data as {
          id: string;
          channelId: string;
          senderUserId: string;
          envelope?: { ciphertext: string; [key: string]: unknown };
          // Client-side Message fields may also be present (for optimistic messages)
          authorId?: string;
          authorHandle?: string;
          content?: string;
          createdAt?: string;
          attachments?: Array<{
            id: string;
            fileNameEncrypted: string;
            fileSize: number;
            contentTypeEncrypted?: string | null;
            encryptionKeyId: string;
            nonce: string;
          }>;
        };

        const channelId = raw.channelId;
        const id = raw.id;
        if (!channelId || !id) return;

        // Resolve handle from member cache
        const handle = useMemberStore.getState().getHandle(raw.senderUserId ?? raw.authorId ?? '')
          ?? raw.authorHandle
          ?? (raw.senderUserId ?? raw.authorId ?? '').slice(0, 8);

        // Decrypt content if envelope is present
        let content = raw.content ?? '[encrypted message]';
        if (raw.envelope?.ciphertext) {
          try {
            content = decodeURIComponent(escape(atob(raw.envelope.ciphertext)));
          } catch {
            content = '[encrypted message]';
          }
        }

        const msg: Message = {
          id,
          channelId,
          authorId: raw.senderUserId ?? raw.authorId ?? '',
          authorHandle: handle,
          content,
          createdAt: raw.createdAt ?? new Date().toISOString(),
          ...(raw.attachments && raw.attachments.length > 0 ? { attachments: raw.attachments } : {}),
        };

        addMessage(channelId, msg);
      }),
    );

    // Presence updates
    unsubs.push(
      gateway.on('PRESENCE_UPDATED', (data) => {
        const { userId, status } = data as { userId: string; status: string };
        if (userId && status) {
          setPresence(userId, status as PresenceStatus);
        }
      }),
    );

    // Typing indicators
    unsubs.push(
      gateway.on('TYPING_START', (data) => {
        const { channelId, userId, handle } = data as { channelId: string; userId: string; handle?: string };
        if (channelId && userId) {
          addTyping(channelId, userId, handle ?? userId.slice(0, 8));
        }
      }),
    );

    // Voice state updates
    unsubs.push(
      gateway.on('VOICE_STATE_UPDATE', (data) => {
        const { channelId, userId, handle, action, selfMute, selfDeaf } = data as {
          channelId: string;
          userId: string;
          handle?: string;
          action: 'join' | 'leave' | 'update';
          selfMute?: boolean;
          selfDeaf?: boolean;
        };
        if (!channelId || !userId) return;

        // Play notification sounds for other users' join/leave
        const currentUserId = useAuthStore.getState().userId;
        const soundsEnabled = useSettingsStore.getState().voiceNotificationSounds;

        if (action === 'join') {
          addVoiceParticipant(channelId, {
            userId,
            handle,
            selfMute: selfMute ?? false,
            selfDeaf: selfDeaf ?? false,
            joinedAt: new Date().toISOString(),
          });
          if (soundsEnabled && userId !== currentUserId) {
            playJoinSound();
          }
        } else if (action === 'leave') {
          removeVoiceParticipant(channelId, userId);
          if (soundsEnabled && userId !== currentUserId) {
            playLeaveSound();
          }
        } else if (action === 'update') {
          updateVoiceParticipant(channelId, userId, {
            selfMute: selfMute ?? false,
            selfDeaf: selfDeaf ?? false,
          });
        }
      }),
    );

    return () => {
      unsubs.forEach((fn) => fn());
      gateway.disconnect();
    };
  }, [isAuthenticated, accessToken, addMessage, setPresence, addTyping, addVoiceParticipant, removeVoiceParticipant, updateVoiceParticipant]);
}
