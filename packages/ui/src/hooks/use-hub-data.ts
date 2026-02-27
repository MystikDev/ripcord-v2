'use client';

/**
 * @module use-hub-data
 * Orchestrates the data-loading lifecycle for hubs, channels, members, roles,
 * messages, and read states. Acts as the primary data-fetching coordinator that
 * hydrates Zustand stores after authentication and on navigation changes.
 */

import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '../stores/auth-store';
import { useHubStore } from '../stores/server-store';
import { useMessageStore, type Message } from '../stores/message-store';
import { fetchMyHubs, fetchChannels, fetchMessages, fetchMembers, fetchReadStates, markChannelRead, fetchDmChannels } from '../lib/hub-api';
import { useReadStateStore } from '../stores/read-state-store';
import { useVoiceStateStore, type VoiceParticipant } from '../stores/voice-state-store';
import { useMemberStore } from '../stores/member-store';
import { useRoleStore } from '../stores/role-store';
import { usePresenceStore, type PresenceStatus } from '../stores/presence-store';
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
  const setPresenceMany = usePresenceStore((s) => s.setMany);

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
          bannerUrl: h.bannerUrl ? `${getApiBaseUrl()}/v1/hubs/${h.id}/banner` : undefined,
          ownerId: h.ownerUserId,
        }));
        setHubs(mapped);
        if (mapped.length > 0) {
          // Preserve current selection if it exists in the fetched list
          const state = useHubStore.getState();
          const currentId = state.activeHubId;
          const currentExists = currentId && mapped.some((h) => h.id === currentId);
          // Don't auto-select a hub if the user is in DM view
          if (!currentExists && !state.isDmView) {
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

  // Load DM channels on auth and subscribe them via gateway
  const setDmChannels = useHubStore((s) => s.setDmChannels);
  const dmSubscribedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;

    fetchDmChannels()
      .then((dms) => {
        if (cancelled) return;
        setDmChannels(dms);

        // Subscribe to all DM channels via gateway for real-time messages (batched)
        const newDmIds = dms
          .map((dm) => dm.channelId)
          .filter((id) => !dmSubscribedRef.current.has(id));
        if (newDmIds.length > 0) {
          gateway.send(OP_SUBSCRIBE, { channelIds: newDmIds });
          for (const id of newDmIds) {
            dmSubscribedRef.current.add(id);
          }
        }
      })
      .catch((err) => {
        if (!cancelled) console.error('Failed to load DM channels:', err);
      });

    return () => { cancelled = true; };
  }, [isAuthenticated, setDmChannels]);

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

    // Hydrate presence for all hub members
    apiFetch<Array<{ userId: string; status: PresenceStatus }>>(`/v1/hubs/${activeHubId}/presence`)
      .then((res) => {
        if (!cancelled && res.ok && res.data) {
          setPresenceMany(res.data);
        }
      })
      .catch((err) => {
        if (!cancelled) console.error('Failed to load presence:', err);
      });

    // Clear stale subscriptions — this is a fresh hub load
    subscribedRef.current.clear();

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

        // Subscribe to all channels via gateway (batched into a single message)
        const allChannelIds = mapped.map((ch) => ch.id);
        if (allChannelIds.length > 0) {
          gateway.send(OP_SUBSCRIBE, { channelIds: allChannelIds });
          for (const id of allChannelIds) {
            subscribedRef.current.add(id);
          }
        }

        // Hydrate voice states for this hub (full replace, not merge)
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
  }, [activeHubId, setChannels, setActiveChannel, setVoiceStates, setMembersStore, setRolesStore, setPresenceMany]);

  // Re-subscribe channels & re-hydrate voice states on gateway reconnect
  useEffect(() => {
    if (!activeHubId) return;

    const unsub = gateway.on('open', () => {
      // Server-side subscriptions are lost on reconnect — re-subscribe all channels (batched)
      const channelIds = Array.from(subscribedRef.current);
      if (channelIds.length > 0) {
        gateway.send(OP_SUBSCRIBE, { channelIds });
      }

      // Re-subscribe DM channels (batched)
      const dmIds = Array.from(dmSubscribedRef.current);
      if (dmIds.length > 0) {
        gateway.send(OP_SUBSCRIBE, { channelIds: dmIds });
      }

      // Re-hydrate voice states from REST to catch any changes during disconnect
      apiFetch<Record<string, VoiceParticipant[]>>(`/v1/voice/states/${activeHubId}`)
        .then((res) => {
          if (res.ok && res.data) {
            setVoiceStates(res.data);
          }
        })
        .catch((err) => {
          console.error('Failed to re-hydrate voice states on reconnect:', err);
        });

      // Re-hydrate presence to catch status changes during disconnect
      apiFetch<Array<{ userId: string; status: PresenceStatus }>>(`/v1/hubs/${activeHubId}/presence`)
        .then((res) => {
          if (res.ok && res.data) {
            setPresenceMany(res.data);
          }
        })
        .catch((err) => {
          console.error('Failed to re-hydrate presence on reconnect:', err);
        });
    });

    return unsub;
  }, [activeHubId, setVoiceStates, setPresenceMany]);

  // Load messages when channel changes
  useEffect(() => {
    if (!activeChannelId) return;

    let cancelled = false;

    fetchMessages(activeChannelId)
      .then((messages) => {
        if (cancelled) return;
        // Messages come DESC from API, reverse for display (oldest first)
        const memberState = useMemberStore.getState();
        const hubState = useHubStore.getState();

        // Build a DM participant handle map for the active channel so DM
        // partners who aren't in the current hub still show their name
        // instead of a truncated user-ID.
        const dmParticipantHandles = new Map<string, string>();
        const activeDm = hubState.dmChannels.find((dm) => dm.channelId === activeChannelId);
        if (activeDm) {
          for (const p of activeDm.participants) {
            dmParticipantHandles.set(p.userId, p.handle);
          }
        }

        const mapped: Message[] = messages.reverse().map((m) => ({
          id: m.id,
          channelId: m.channelId,
          authorId: m.senderUserId,
          authorHandle:
            memberState.getHandle(m.senderUserId)
            ?? dmParticipantHandles.get(m.senderUserId)
            ?? m.senderUserId.slice(0, 8),
          content: (() => {
            try {
              return decodeURIComponent(escape(atob(m.envelope.ciphertext)));
            } catch {
              return '[encrypted message]';
            }
          })(),
          createdAt: m.createdAt,
          ...(m.attachments && m.attachments.length > 0 ? { attachments: m.attachments } : {}),
          ...(m.pinnedAt ? { pinnedAt: m.pinnedAt, pinnedBy: m.pinnedBy ?? undefined } : {}),
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
