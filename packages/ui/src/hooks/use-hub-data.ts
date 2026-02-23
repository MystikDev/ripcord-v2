'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '../stores/auth-store';
import { useHubStore } from '../stores/server-store';
import { useMessageStore, type Message } from '../stores/message-store';
import { fetchMyHubs, fetchChannels, fetchMessages, fetchMembers, fetchReadStates, markChannelRead } from '../lib/hub-api';
import { useReadStateStore } from '../stores/read-state-store';
import { useVoiceStateStore, type VoiceParticipant } from '../stores/voice-state-store';
import { useMemberStore } from '../stores/member-store';
import { useRoleStore } from '../stores/role-store';
import { gateway } from '../lib/gateway-client';
import { apiFetch } from '../lib/api';
import { getApiBaseUrl } from '../lib/constants';
import { getUserAvatarUrl } from '../lib/user-api';
import { fetchRoles } from '../lib/roles-api';

// ---------------------------------------------------------------------------
// Gateway opcode constants (must match server GatewayOpcode enum)
// ---------------------------------------------------------------------------

const OP_SUBSCRIBE = 4;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Manages hub/channel/message data loading lifecycle.
 *
 * - Loads hubs on auth
 * - Loads channels when active hub changes
 * - Loads message history when active channel changes
 * - Subscribes to gateway channels for real-time updates
 */
export function useHubData() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const activeHubId = useHubStore((s) => s.activeHubId);
  const activeChannelId = useHubStore((s) => s.activeChannelId);
  const setHubs = useHubStore((s) => s.setHubs);
  const setChannels = useHubStore((s) => s.setChannels);
  const setActiveHub = useHubStore((s) => s.setActiveHub);
  const setActiveChannel = useHubStore((s) => s.setActiveChannel);
  const setMessages = useMessageStore((s) => s.setMessages);
  const setMany = useReadStateStore((s) => s.setMany);
  const setReadState = useReadStateStore((s) => s.setReadState);
  const setVoiceStates = useVoiceStateStore((s) => s.setMany);
  const setMembersStore = useMemberStore((s) => s.setMembers);
  const setRolesStore = useRoleStore((s) => s.setRoles);

  // Onboarding flag — true when user has zero hubs
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Track previously subscribed channels to avoid re-subscribing
  const subscribedRef = useRef<Set<string>>(new Set());

  // Load hubs on auth
  useEffect(() => {
    if (!isAuthenticated) return;

    let cancelled = false;

    fetchMyHubs()
      .then((hubs) => {
        if (cancelled) return;
        const mapped = hubs.map((h) => ({
          id: h.id,
          name: h.name,
          iconUrl: h.iconUrl ? `${getApiBaseUrl()}/v1/hubs/${h.id}/icon` : undefined,
          ownerId: h.ownerUserId,
        }));
        setHubs(mapped);
        if (mapped.length > 0) {
          // Preserve current selection if it exists in the fetched list
          const currentId = useHubStore.getState().activeHubId;
          const currentExists = currentId && mapped.some((h) => h.id === currentId);
          if (!currentExists) {
            setActiveHub(mapped[0]!.id);
          }
          setShowOnboarding(false);
        } else {
          setShowOnboarding(true);
        }
      })
      .catch((err) => {
        if (!cancelled) console.error('Failed to load hubs:', err);
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, setHubs, setActiveHub]);

  // Load read states on auth
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;

    fetchReadStates()
      .then((states) => {
        if (cancelled) return;
        setMany(states.map((s) => ({
          channelId: s.channelId,
          lastReadMessageId: s.lastReadMessageId,
          mentionCount: s.mentionCount,
        })));
      })
      .catch((err) => {
        if (!cancelled) console.error('Failed to load read states:', err);
      });

    return () => { cancelled = true; };
  }, [isAuthenticated, setMany]);

  // Load channels and members when hub changes
  useEffect(() => {
    if (!activeHubId) return;

    let cancelled = false;

    // Fetch members for handle resolution (runs in parallel with channels + roles)
    fetchMembers(activeHubId)
      .then((members) => {
        if (cancelled) return;
        setMembersStore(members.map((m) => ({
          userId: m.userId,
          handle: m.handle,
          avatarUrl: m.avatarUrl ? getUserAvatarUrl(m.userId) : undefined,
          joinedAt: m.joinedAt,
          roles: m.roles,
        })));
      })
      .catch((err) => {
        if (!cancelled) console.error('Failed to load members:', err);
      });

    // Fetch role definitions (for priority-based grouping in member list)
    fetchRoles(activeHubId)
      .then((roles) => {
        if (cancelled) return;
        setRolesStore(roles.map((r) => ({
          id: r.id,
          name: r.name,
          priority: r.priority,
        })));
      })
      .catch((err) => {
        if (!cancelled) console.error('Failed to load roles:', err);
      });

    fetchChannels(activeHubId)
      .then((channels) => {
        if (cancelled) return;
        const mapped = channels.map((c, i) => ({
          id: c.id,
          hubId: c.hubId,
          name: c.name,
          type: c.type,
          position: i,
        }));
        setChannels(mapped);

        // Auto-select first text channel
        const firstText = mapped.find((c) => c.type === 'text');
        if (firstText) {
          setActiveChannel(firstText.id);
        }

        // Subscribe to all channels via gateway
        const newIds = mapped.map((c) => c.id).filter((id) => !subscribedRef.current.has(id));
        if (newIds.length > 0) {
          for (const channelId of newIds) {
            gateway.send(OP_SUBSCRIBE, { channelIds: [channelId] });
            subscribedRef.current.add(channelId);
          }
        }

        // Hydrate voice states for this hub
        apiFetch<Record<string, VoiceParticipant[]>>(`/v1/voice/states/${activeHubId}`)
          .then((res) => {
            if (!cancelled && res.ok && res.data) {
              setVoiceStates(res.data);
            }
          })
          .catch((err) => {
            if (!cancelled) console.error('Failed to load voice states:', err);
          });
      })
      .catch((err) => {
        if (!cancelled) console.error('Failed to load channels:', err);
      });

    return () => {
      cancelled = true;
    };
  }, [activeHubId, setChannels, setActiveChannel, setVoiceStates, setMembersStore, setRolesStore]);

  // Load messages when channel changes
  useEffect(() => {
    if (!activeChannelId) return;

    let cancelled = false;

    fetchMessages(activeChannelId)
      .then((messages) => {
        if (cancelled) return;
        // Messages come DESC from API, reverse for display (oldest first)
        const memberState = useMemberStore.getState();
        const mapped: Message[] = messages.reverse().map((m) => ({
          id: m.id,
          channelId: m.channelId,
          authorId: m.senderUserId,
          authorHandle: memberState.getHandle(m.senderUserId) ?? m.senderUserId.slice(0, 8),
          content: (() => {
            try {
              return decodeURIComponent(escape(atob(m.envelope.ciphertext)));
            } catch {
              return '[encrypted message]';
            }
          })(),
          createdAt: m.createdAt,
          ...(m.attachments && m.attachments.length > 0 ? { attachments: m.attachments } : {}),
        }));
        setMessages(activeChannelId, mapped);

        // Mark channel as read with the latest message
        if (mapped.length > 0) {
          const lastMsg = mapped[mapped.length - 1]!;
          if (!lastMsg.id.startsWith('temp-')) {
            setReadState(activeChannelId, lastMsg.id);
            markChannelRead(activeChannelId, lastMsg.id).catch((err) => {
              console.error('Failed to mark channel as read:', err);
            });
          }
        }
      })
      .catch((err) => {
        if (!cancelled) console.error('Failed to load messages:', err);
      });

    return () => {
      cancelled = true;
    };
  }, [activeChannelId, setMessages, setReadState]);

  return { showOnboarding, setShowOnboarding };
}
