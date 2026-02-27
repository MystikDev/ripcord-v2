'use client';

/**
 * @module use-gateway
 * Manages the WebSocket gateway lifecycle and routes incoming real-time events
 * (messages, presence, typing, voice state) to the appropriate Zustand stores.
 */

import { useEffect, useRef } from 'react';
import { useAuthStore } from '../stores/auth-store';
import { useMessageStore, type Message } from '../stores/message-store';
import { usePresenceStore, type PresenceStatus } from '../stores/presence-store';
import { useTypingStore } from '../stores/typing-store';
import { useVoiceStateStore } from '../stores/voice-state-store';
import { useMemberStore } from '../stores/member-store';
import { useHubStore } from '../stores/server-store';
import { useRoleStore } from '../stores/role-store';
import { gateway } from '../lib/gateway-client';
import { useSettingsStore } from '../stores/settings-store';
import { useCallStore } from '../stores/call-store';
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
  const updateMessage = useMessageStore((s) => s.updateMessage);
  const setPresence = usePresenceStore((s) => s.setPresence);
  const addTyping = useTypingStore((s) => s.addTyping);
  const addVoiceParticipant = useVoiceStateStore((s) => s.addParticipant);
  const removeVoiceParticipant = useVoiceStateStore((s) => s.removeParticipant);
  const updateVoiceParticipant = useVoiceStateStore((s) => s.updateParticipant);
  const setChannelParticipants = useVoiceStateStore((s) => s.setChannelParticipants);

  // Keep token in a ref so refreshes don't tear down the WebSocket.
  // The gateway client only needs the token for AUTH on (re)connect.
  const tokenRef = useRef(accessToken);

  // Sync token ref + gateway's stored token on every refresh
  useEffect(() => {
    tokenRef.current = accessToken;
    if (accessToken) {
      gateway.updateToken(accessToken);
    }
  }, [accessToken]);

  useEffect(() => {
    if (!isAuthenticated || !tokenRef.current) {
      gateway.disconnect();
      return;
    }

    // Connect (only runs when isAuthenticated changes, not on token refresh)
    gateway.connect(tokenRef.current);

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

        // Resolve handle from member cache, then DM participant data, then fallback
        const senderId = raw.senderUserId ?? raw.authorId ?? '';
        const dmHandle = (() => {
          const dm = useHubStore.getState().dmChannels.find((d) => d.channelId === channelId);
          return dm?.participants.find((p) => p.userId === senderId)?.handle;
        })();
        const handle = useMemberStore.getState().getHandle(senderId)
          ?? dmHandle
          ?? raw.authorHandle
          ?? senderId.slice(0, 8);

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
        const raw = data as {
          channelId: string;
          userId?: string;
          handle?: string;
          action: 'join' | 'leave' | 'update' | 'sync' | 'force_move' | 'server_mute';
          selfMute?: boolean;
          selfDeaf?: boolean;
          serverMute?: boolean;
          targetChannelId?: string;
          participants?: Array<{
            userId: string;
            handle?: string;
            selfMute: boolean;
            selfDeaf: boolean;
            serverMute?: boolean;
            joinedAt: string;
          }>;
        };
        if (!raw.channelId) return;

        // Full participant sync — sent by the gateway after a voice join so the
        // joining user immediately sees everyone already in the channel.
        if (raw.action === 'sync' && raw.participants) {
          setChannelParticipants(raw.channelId, raw.participants);
          return;
        }

        if (!raw.userId) return;

        // Play notification sounds for other users' join/leave
        const currentUserId = useAuthStore.getState().userId;
        const soundsEnabled = useSettingsStore.getState().voiceNotificationSounds;

        if (raw.action === 'join') {
          addVoiceParticipant(raw.channelId, {
            userId: raw.userId,
            handle: raw.handle,
            selfMute: raw.selfMute ?? false,
            selfDeaf: raw.selfDeaf ?? false,
            serverMute: raw.serverMute,
            joinedAt: new Date().toISOString(),
          });
          if (soundsEnabled && raw.userId !== currentUserId) {
            playJoinSound();
          }
        } else if (raw.action === 'leave') {
          removeVoiceParticipant(raw.channelId, raw.userId);
          if (soundsEnabled && raw.userId !== currentUserId) {
            playLeaveSound();
          }
        } else if (raw.action === 'update') {
          updateVoiceParticipant(raw.channelId, raw.userId, {
            selfMute: raw.selfMute ?? false,
            selfDeaf: raw.selfDeaf ?? false,
          });
        } else if (raw.action === 'force_move') {
          // If this user was force-moved, switch their channel
          if (raw.userId === currentUserId && raw.targetChannelId) {
            const { setPendingVoiceJoin } = useHubStore.getState();
            setPendingVoiceJoin(raw.targetChannelId);
          }
        } else if (raw.action === 'server_mute') {
          // Update the participant's server-mute state
          updateVoiceParticipant(raw.channelId, raw.userId, {
            serverMute: raw.serverMute ?? false,
          });
        }
      }),
    );

    // Message pin events
    unsubs.push(
      gateway.on('MESSAGE_PINNED', (data) => {
        const { channelId, messageId, pinnedAt, pinnedByUserId } = data as {
          channelId: string;
          messageId: string;
          pinnedAt: string;
          pinnedByUserId: string;
        };
        if (channelId && messageId) {
          updateMessage(channelId, messageId, { pinnedAt, pinnedBy: pinnedByUserId });
        }
      }),
    );

    unsubs.push(
      gateway.on('MESSAGE_UNPINNED', (data) => {
        const { channelId, messageId } = data as {
          channelId: string;
          messageId: string;
        };
        if (channelId && messageId) {
          updateMessage(channelId, messageId, { pinnedAt: undefined, pinnedBy: undefined });
        }
      }),
    );

    // DM call signaling
    unsubs.push(
      gateway.on('CALL_INVITE', (data) => {
        const { roomId, channelId, fromUserId, fromHandle, withVideo } = data as {
          roomId: string;
          channelId: string;
          fromUserId: string;
          fromHandle?: string;
          withVideo?: boolean;
        };
        if (roomId && channelId && fromUserId) {
          useCallStore.getState().receiveCall({
            roomId,
            channelId,
            remoteUserId: fromUserId,
            remoteHandle: fromHandle,
            withVideo,
          });
        }
      }),
    );

    unsubs.push(
      gateway.on('CALL_ACCEPT', () => {
        // Remote user accepted — transition to active
        useCallStore.getState().acceptCall();
      }),
    );

    unsubs.push(
      gateway.on('CALL_DECLINE', () => {
        // Remote user declined
        useCallStore.getState().endCall();
      }),
    );

    unsubs.push(
      gateway.on('CALL_END', () => {
        // Remote user ended the call
        useCallStore.getState().endCall();
      }),
    );

    // Role definition changes (color, name, priority, create, delete)
    unsubs.push(
      gateway.on('ROLE_UPDATED', (data) => {
        const { role, action } = data as {
          hubId: string;
          role: { id: string; name: string; priority: number; color?: string | null };
          action: 'created' | 'updated' | 'deleted';
        };
        if (!role?.id) return;
        if (action === 'deleted') {
          useRoleStore.getState().removeRole(role.id);
        } else {
          useRoleStore.getState().updateRole({
            id: role.id,
            name: role.name,
            priority: role.priority,
            ...(role.color ? { color: role.color } : {}),
          });
        }
      }),
    );

    return () => {
      unsubs.forEach((fn) => fn());
      gateway.disconnect();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- accessToken intentionally excluded; synced via ref + gateway.updateToken() to avoid reconnects on token refresh
  }, [isAuthenticated, addMessage, updateMessage, setPresence, addTyping, addVoiceParticipant, removeVoiceParticipant, updateVoiceParticipant, setChannelParticipants]);
}
