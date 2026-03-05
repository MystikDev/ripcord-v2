/**
 * @module solar-system-view
 * Orbital view orchestrator. Composes the canvas background, orbit zones,
 * user nodes, topbar, channel list, HUD, and tooltip into a full-screen
 * immersive visualization of the active hub's voice channels and members.
 */
'use client';

import { useMemo, useCallback, useState, useRef, useEffect } from 'react';
import { OrbitalCanvas } from './orbital/orbital-canvas';
import { OrbitZone } from './orbital/orbit-zone';
import { UserNode } from './orbital/user-node';
import { UserTooltip } from './orbital/user-tooltip';
import { OrbitalTopbar } from './orbital/orbital-topbar';
import { OrbitalChannelList } from './orbital/orbital-channel-list';
import { OrbitalHud } from './orbital/orbital-hud';
import { SplinterButton } from './orbital/splinter-button';
import { OrbitContextMenu } from './orbital/orbit-context-menu';
import { FloatingChatPanel } from './orbital/floating-chat-panel';
import { AdminConsole } from '../admin/admin-console';
import { Permission } from '@ripcord/types';
import { useHubStore, type Channel } from '../../stores/server-store';
import { useHasPermission } from '../../hooks/use-has-permission';
import { useVoiceStateStore, EMPTY_PARTICIPANTS } from '../../stores/voice-state-store';
import { usePresenceStore, type PresenceStatus } from '../../stores/presence-store';
import { useMemberStore, type MemberInfo } from '../../stores/member-store';
import { useAuthStore } from '../../stores/auth-store';
import { useSettingsStore } from '../../stores/settings-store';
import { useTypingStore } from '../../stores/typing-store';
import { useOrbitLayoutStore } from '../../stores/orbit-layout-store';

// ---------------------------------------------------------------------------
// Orbit positioning presets (center as 0-1 fractions of viewport)
// ---------------------------------------------------------------------------

const ORBIT_PRESETS: Record<number, Array<{ cx: number; cy: number }>> = {
  1: [{ cx: 0.5, cy: 0.45 }],
  2: [{ cx: 0.38, cy: 0.42 }, { cx: 0.65, cy: 0.35 }],
  3: [{ cx: 0.35, cy: 0.40 }, { cx: 0.65, cy: 0.32 }, { cx: 0.50, cy: 0.62 }],
  4: [
    { cx: 0.30, cy: 0.38 },
    { cx: 0.65, cy: 0.30 },
    { cx: 0.55, cy: 0.62 },
    { cx: 0.25, cy: 0.60 },
  ],
};

/** For 5+ voice channels, distribute in a circle from center. */
function generateCircularPresets(count: number): Array<{ cx: number; cy: number }> {
  const out: Array<{ cx: number; cy: number }> = [];
  const centerX = 0.5;
  const centerY = 0.45;
  const radiusFrac = 0.22;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
    out.push({
      cx: centerX + Math.cos(angle) * radiusFrac,
      cy: centerY + Math.sin(angle) * radiusFrac,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Color palette for orbit zones
// ---------------------------------------------------------------------------

const ORBIT_COLORS = [
  '#00e5ff', '#b060ff', '#00ff9d', '#ff9030',
  '#ff4060', '#ffeb3b', '#ff69b4',
];

// ---------------------------------------------------------------------------
// Floating positions for offline / non-voice members
// ---------------------------------------------------------------------------

const FLOATING_POSITIONS = [
  { x: 0.08, y: 0.18 }, { x: 0.92, y: 0.22 }, { x: 0.06, y: 0.72 },
  { x: 0.93, y: 0.68 }, { x: 0.15, y: 0.90 }, { x: 0.85, y: 0.88 },
  { x: 0.12, y: 0.45 }, { x: 0.88, y: 0.48 }, { x: 0.20, y: 0.12 },
  { x: 0.80, y: 0.14 }, { x: 0.50, y: 0.92 }, { x: 0.72, y: 0.82 },
  { x: 0.28, y: 0.78 }, { x: 0.42, y: 0.10 }, { x: 0.60, y: 0.88 },
  { x: 0.04, y: 0.55 }, { x: 0.96, y: 0.40 }, { x: 0.18, y: 0.32 },
  { x: 0.82, y: 0.58 }, { x: 0.35, y: 0.85 },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Deterministic hue from a user ID string. */
function userIdToHue(userId: string): number {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 360;
}

/** Derive gradient pair from userId hash. */
function userGradient(userId: string): [string, string] {
  const h = userIdToHue(userId);
  return [`hsl(${h}, 70%, 45%)`, `hsl(${(h + 30) % 360}, 60%, 55%)`];
}

/** First 2 characters of handle, uppercased. */
function toInitials(handle: string): string {
  return handle.slice(0, 2).toUpperCase();
}

/** Map PresenceStatus to UserTooltip status format. */
function tooltipStatus(
  status: PresenceStatus,
  isMuted: boolean,
  isCurrentUser: boolean,
): 'ONLINE' | 'YOU' | 'MUTED' | 'IDLE' | 'DND' | 'OFFLINE' {
  if (isCurrentUser) return 'YOU';
  if (isMuted) return 'MUTED';
  switch (status) {
    case 'online':
      return 'ONLINE';
    case 'idle':
      return 'IDLE';
    case 'dnd':
      return 'DND';
    case 'offline':
      return 'OFFLINE';
  }
}

// ---------------------------------------------------------------------------
// Orbit collision avoidance
// ---------------------------------------------------------------------------

/** Minimum distance (viewport fraction) between orbit centers. */
const MIN_ORBIT_SEPARATION = 0.15;

/**
 * Push overlapping orbits apart. Non-overridden orbits are nudged outward
 * from the canvas center until no pair is closer than MIN_ORBIT_SEPARATION.
 */
function resolveOrbitCollisions(
  orbits: Array<{ cx: number; cy: number; hasOverride: boolean }>,
): Array<{ cx: number; cy: number }> {
  const result = orbits.map((o) => ({ cx: o.cx, cy: o.cy }));
  const centerX = 0.5;
  const centerY = 0.45;

  for (let i = 0; i < result.length; i++) {
    // Don't move user-dragged orbits
    if (orbits[i].hasOverride) continue;

    let attempts = 0;
    while (attempts < 10) {
      let collision = false;
      for (let j = 0; j < result.length; j++) {
        if (i === j) continue;
        const dx = result[i].cx - result[j].cx;
        const dy = result[i].cy - result[j].cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < MIN_ORBIT_SEPARATION) {
          collision = true;
          const angle = Math.atan2(
            result[i].cy - centerY,
            result[i].cx - centerX,
          );
          result[i] = {
            cx: Math.max(0.08, Math.min(0.92, result[i].cx + Math.cos(angle) * 0.04)),
            cy: Math.max(0.08, Math.min(0.92, result[i].cy + Math.sin(angle) * 0.04)),
          };
          break;
        }
      }
      if (!collision) break;
      attempts++;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Computed orbit data type
// ---------------------------------------------------------------------------

interface OrbitData {
  channel: Channel;
  cx: number;
  cy: number;
  radius: number;
  color: string;
  memberIds: string[];
}

// ---------------------------------------------------------------------------
// Computed user position type
// ---------------------------------------------------------------------------

interface PositionedUser {
  userId: string;
  handle: string;
  avatarUrl?: string;
  initials: string;
  gradientColors: [string, string];
  x: number;
  y: number;
  status: PresenceStatus;
  isMuted: boolean;
  isSpeaking: boolean;
  isCurrentUser: boolean;
  orbitColor: string;
  /** Voice channel ID the user is in, or empty string */
  channelId: string;
  /** Channel name the user is in, or 'NONE' */
  orbitName: string;
  /** Whether the user is currently typing in any channel */
  isTyping: boolean;
  /** Whether the user is screen sharing */
  isScreenSharing: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SolarSystemView() {
  // -- Store selectors -------------------------------------------------------
  const hubs = useHubStore((s) => s.hubs);
  const activeHubId = useHubStore((s) => s.activeHubId);
  const channels = useHubStore((s) => s.channels);
  const activeChannelId = useHubStore((s) => s.activeChannelId);
  const setActiveChannelOrbital = useHubStore((s) => s.setActiveChannelOrbital);
  const setPendingVoiceJoin = useHubStore((s) => s.setPendingVoiceJoin);
  const clearActiveHub = useHubStore((s) => s.clearActiveHub);

  const voiceStates = useVoiceStateStore((s) => s.voiceStates);
  const speakingUserIds = useVoiceStateStore((s) => s.speakingUserIds);
  const connectedChannelId = useVoiceStateStore((s) => s.connectedChannelId);
  const latencyMs = useVoiceStateStore((s) => s.latencyMs);
  const localMicMuted = useVoiceStateStore((s) => s.localMicMuted);
  const toggleMicFn = useVoiceStateStore((s) => s.toggleMicFn);
  const toggleScreenShareFn = useVoiceStateStore((s) => s.toggleScreenShareFn);
  const setConnectedChannelId = useVoiceStateStore((s) => s.setConnectedChannelId);

  const presence = usePresenceStore((s) => s.presence);
  const members = useMemberStore((s) => s.members);
  const currentUserId = useAuthStore((s) => s.userId);

  const commsCenterOpen = useSettingsStore((s) => s.commsCenterOpen);
  const toggleCommsCenter = useSettingsStore((s) => s.toggleCommsCenter);
  const commsCenterPinned = useSettingsStore((s) => s.commsCenterPinned);
  const toggleCommsCenterPin = useSettingsStore((s) => s.toggleCommsCenterPin);
  const commsCenterPosition = useSettingsStore((s) => s.commsCenterPosition);
  const setCommsCenterPosition = useSettingsStore((s) => s.setCommsCenterPosition);
  const commsCenterSize = useSettingsStore((s) => s.commsCenterSize);
  const setCommsCenterSize = useSettingsStore((s) => s.setCommsCenterSize);
  const isDeafened = useSettingsStore((s) => s.isDeafened);
  const toggleDeafen = useSettingsStore((s) => s.toggleDeafen);
  const sunIntensity = useSettingsStore((s) => s.sunIntensity);

  const screenSharingUserIds = useVoiceStateStore((s) => s.screenSharingUserIds);
  const typingData = useTypingStore((s) => s.typing);

  const orbitOverrides = useOrbitLayoutStore((s) => s.overrides);
  const setOrbitOverride = useOrbitLayoutStore((s) => s.setOverride);
  const panOffset = useOrbitLayoutStore((s) => s.panOffset);
  const setPanOffset = useOrbitLayoutStore((s) => s.setPanOffset);
  const zoomLevel = useOrbitLayoutStore((s) => s.zoomLevel);
  const adjustZoom = useOrbitLayoutStore((s) => s.adjustZoom);
  const resetLayout = useOrbitLayoutStore((s) => s.resetAll);

  const canManageChannels = useHasPermission(1 << 3); // Permission.MANAGE_CHANNELS
  const canCreateOrbit = useHasPermission(1 << 14); // Permission.CREATE_ORBIT
  const canManageHub = useHasPermission(Permission.MANAGE_HUB);
  const setChannels = useHubStore((s) => s.setChannels);

  const activeHub = hubs.find((h) => h.id === activeHubId);

  // -- Local state -----------------------------------------------------------
  const [orbitCtxMenu, setOrbitCtxMenu] = useState<{
    channelId: string;
    channelName: string;
    position: { x: number; y: number };
  } | null>(null);
  const [adminConsoleOpen, setAdminConsoleOpen] = useState(false);

  // -- First-time zoom/pan hint overlay --------------------------------------
  const HINT_KEY = 'ripcord:orbital:pan-zoom-hint-seen';
  const [panZoomHintVisible, setPanZoomHintVisible] = useState(() => {
    try {
      return localStorage.getItem(HINT_KEY) !== '1';
    } catch {
      return false;
    }
  });

  const dismissPanZoomHint = useCallback(() => {
    setPanZoomHintVisible(false);
    try { localStorage.setItem(HINT_KEY, '1'); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!panZoomHintVisible) return;
    const timer = setTimeout(dismissPanZoomHint, 5000);
    return () => clearTimeout(timer);
  }, [panZoomHintVisible, dismissPanZoomHint]);

  const [tooltip, setTooltip] = useState<{
    visible: boolean;
    x: number;
    y: number;
    name: string;
    status: 'ONLINE' | 'YOU' | 'MUTED' | 'IDLE' | 'DND' | 'OFFLINE';
    orbitName: string;
    ping: string;
  }>({
    visible: false,
    x: 0,
    y: 0,
    name: '',
    status: 'OFFLINE',
    orbitName: 'NONE',
    ping: '\u2014',
  });

  // -- Viewport size tracking ------------------------------------------------
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewSize, setViewSize] = useState({ width: 1920, height: 1080 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = () => {
      const rect = el.getBoundingClientRect();
      setViewSize({ width: rect.width || 1920, height: rect.height || 1080 });
    };

    const ro = new ResizeObserver(update);
    ro.observe(el);
    update();

    return () => ro.disconnect();
  }, []);

  // -- Reset layout on hub switch -------------------------------------------
  const prevHubIdRef = useRef(activeHubId);
  useEffect(() => {
    if (prevHubIdRef.current !== activeHubId) {
      resetLayout();
      prevHubIdRef.current = activeHubId;
    }
  }, [activeHubId, resetLayout]);

  // -- Canvas pan drag refs --------------------------------------------------
  const panDragRef = useRef<{
    startX: number;
    startY: number;
    startPanX: number;
    startPanY: number;
  } | null>(null);

  // -- Derived: voice channels and text channels -----------------------------
  const voiceChannels = useMemo(
    () => channels.filter((ch) => ch.type === 'voice'),
    [channels],
  );

  const textChannels = useMemo(
    () => channels.filter((ch) => ch.type === 'text'),
    [channels],
  );

  // -- Derived: speaking set for O(1) lookup ---------------------------------
  const speakingSet = useMemo(
    () => new Set(speakingUserIds),
    [speakingUserIds],
  );

  // -- Derived: screen sharing set for O(1) lookup ---------------------------
  const screenSharingSet = useMemo(
    () => new Set(screenSharingUserIds),
    [screenSharingUserIds],
  );

  // -- Derived: typing user IDs (across all channels, exclude self) ----------
  const typingUserIds = useMemo(() => {
    const set = new Set<string>();
    const now = Date.now();
    for (const entries of Object.values(typingData)) {
      for (const entry of entries) {
        if (entry.expiresAt > now && entry.userId !== currentUserId) {
          set.add(entry.userId);
        }
      }
    }
    return set;
  }, [typingData, currentUserId]);

  // -- Derived: set of all user IDs in any voice channel ---------------------
  const usersInVoice = useMemo(() => {
    const set = new Set<string>();
    for (const ch of voiceChannels) {
      const participants = voiceStates[ch.id] ?? EMPTY_PARTICIPANTS;
      for (const p of participants) {
        set.add(p.userId);
      }
    }
    return set;
  }, [voiceChannels, voiceStates]);

  // -- Derived: orbit data for each voice channel ----------------------------
  const orbitData = useMemo((): OrbitData[] => {
    const count = voiceChannels.length;
    if (count === 0) return [];

    const presets = count <= 4
      ? ORBIT_PRESETS[count]!
      : generateCircularPresets(count);

    // Compute raw positions with override flags
    const rawPositions = voiceChannels.map((ch, i) => {
      const preset = presets[i] ?? { cx: 0.5, cy: 0.5 };
      const override = orbitOverrides[ch.id];
      const pos = override ?? preset;
      return { cx: pos.cx, cy: pos.cy, hasOverride: !!override };
    });

    // Resolve collisions for non-overridden orbits
    const resolved = resolveOrbitCollisions(rawPositions);

    return voiceChannels.map((ch, i) => {
      const participants = voiceStates[ch.id] ?? EMPTY_PARTICIPANTS;
      const memberCount = participants.length;
      const radius = Math.min(160, 80 + 15 * memberCount);
      const color = ORBIT_COLORS[i % ORBIT_COLORS.length]!;

      return {
        channel: ch,
        cx: resolved[i].cx,
        cy: resolved[i].cy,
        radius,
        color,
        memberIds: participants.map((p) => p.userId),
      };
    });
  }, [voiceChannels, voiceStates, orbitOverrides]);

  // -- Derived: map channelId -> orbit color for quick lookup ----------------
  const orbitColorByChannel = useMemo(() => {
    const map: Record<string, string> = {};
    for (const od of orbitData) {
      map[od.channel.id] = od.color;
    }
    return map;
  }, [orbitData]);

  // -- Derived: map channelId -> orbit data for quick lookup -----------------
  const orbitByChannel = useMemo(() => {
    const map: Record<string, OrbitData> = {};
    for (const od of orbitData) {
      map[od.channel.id] = od;
    }
    return map;
  }, [orbitData]);

  // -- Derived: all positioned users -----------------------------------------
  const positionedUsers = useMemo((): PositionedUser[] => {
    const result: PositionedUser[] = [];
    const { width: vw, height: vh } = viewSize;

    // 1. Users in voice channels — position around orbit center
    for (const od of orbitData) {
      const participants = voiceStates[od.channel.id] ?? EMPTY_PARTICIPANTS;
      const memberCount = participants.length;

      participants.forEach((p, index) => {
        const member = members[p.userId];
        const handle = member?.handle ?? p.handle ?? p.userId.slice(0, 8);
        const angle = (index / Math.max(memberCount, 1)) * Math.PI * 2 - Math.PI / 2;
        const spread = Math.min(od.radius * 0.45, 70);
        const userX = od.cx + (Math.cos(angle) * spread) / vw;
        const userY = od.cy + (Math.sin(angle) * spread) / vh;
        const status: PresenceStatus = presence[p.userId] ?? 'online';

        result.push({
          userId: p.userId,
          handle,
          avatarUrl: member?.avatarUrl,
          initials: toInitials(handle),
          gradientColors: userGradient(p.userId),
          x: userX,
          y: userY,
          status,
          isMuted: p.selfMute,
          isSpeaking: speakingSet.has(p.userId),
          isCurrentUser: p.userId === currentUserId,
          orbitColor: od.color,
          channelId: od.channel.id,
          orbitName: od.channel.name,
          isTyping: typingUserIds.has(p.userId),
          isScreenSharing: screenSharingSet.has(p.userId),
        });
      });
    }

    // 2. Offline / non-voice members — scatter at floating positions
    let floatIdx = 0;
    const memberList = Object.values(members);
    for (const m of memberList) {
      if (usersInVoice.has(m.userId)) continue;

      const pos = FLOATING_POSITIONS[floatIdx % FLOATING_POSITIONS.length]!;
      floatIdx++;
      const status: PresenceStatus = presence[m.userId] ?? 'offline';

      result.push({
        userId: m.userId,
        handle: m.handle,
        avatarUrl: m.avatarUrl,
        initials: toInitials(m.handle),
        gradientColors: userGradient(m.userId),
        x: pos.x,
        y: pos.y,
        status,
        isMuted: false,
        isSpeaking: false,
        isCurrentUser: m.userId === currentUserId,
        orbitColor: '#888',
        channelId: '',
        orbitName: 'NONE',
        isTyping: typingUserIds.has(m.userId),
        isScreenSharing: screenSharingSet.has(m.userId),
      });
    }

    return result;
  }, [
    orbitData, voiceStates, members, presence, speakingSet,
    usersInVoice, currentUserId, viewSize, typingUserIds, screenSharingSet,
  ]);

  // -- Derived: user positions map (for canvas bg) ---------------------------
  const userPositionsMap = useMemo(() => {
    const map: Record<string, { x: number; y: number }> = {};
    for (const u of positionedUsers) {
      map[u.userId] = { x: u.x, y: u.y };
    }
    return map;
  }, [positionedUsers]);

  // -- Derived: online user IDs set (for canvas bg) --------------------------
  const onlineUserIds = useMemo(() => {
    const set = new Set<string>();
    for (const u of positionedUsers) {
      if (u.status !== 'offline') {
        set.add(u.userId);
      }
    }
    return set;
  }, [positionedUsers]);

  // -- Derived: canvas orbits prop (includes channel info for planets) -------
  const canvasOrbits = useMemo(
    () =>
      orbitData.map((od) => ({
        id: od.channel.id,
        cx: od.cx,
        cy: od.cy,
        radius: od.radius,
        color: od.color,
        memberIds: od.memberIds,
        channelName: od.channel.name,
        channelType: od.channel.type as 'voice' | 'text',
      })),
    [orbitData],
  );

  // -- Derived: active orbit count (voice channels with participants) --------
  const activeOrbitCount = useMemo(
    () => orbitData.filter((od) => od.memberIds.length > 0).length,
    [orbitData],
  );

  // -- Derived: connected voice channel name ---------------------------------
  const connectedVoiceChannel = useMemo(
    () => (connectedChannelId ? channels.find((ch) => ch.id === connectedChannelId) : null),
    [connectedChannelId, channels],
  );

  // -- Derived: HUD voice participants ---------------------------------------
  const hudVoiceParticipants = useMemo(() => {
    if (!connectedChannelId) return [];
    const participants = voiceStates[connectedChannelId] ?? EMPTY_PARTICIPANTS;
    return participants.map((p) => {
      const member = members[p.userId];
      const handle = member?.handle ?? p.handle ?? p.userId.slice(0, 8);
      return {
        userId: p.userId,
        initials: toInitials(handle),
        gradientColors: userGradient(p.userId),
        isCurrentUser: p.userId === currentUserId,
      };
    });
  }, [connectedChannelId, voiceStates, members, currentUserId]);

  // -- Derived: current user info for HUD ------------------------------------
  const currentUserInfo = useMemo(() => {
    const member = currentUserId ? members[currentUserId] : null;
    const handle = member?.handle ?? 'User';
    return {
      handle,
      initials: toInitials(handle),
      gradientColors: userGradient(currentUserId ?? 'unknown'),
    };
  }, [currentUserId, members]);

  // -- Derived: active text channel name for Comms Center label --------------
  const activeTextChannelName = useMemo(() => {
    if (!activeChannelId) return null;
    const ch = textChannels.find((c) => c.id === activeChannelId);
    return ch?.name ?? null;
  }, [activeChannelId, textChannels]);

  // -- Derived: channel list props -------------------------------------------
  const channelListTextChannels = useMemo(
    () => textChannels.map((ch) => ({ id: ch.id, name: ch.name, unreadCount: 0 })),
    [textChannels],
  );

  const channelListVoiceOrbits = useMemo(
    () =>
      voiceChannels.map((ch, i) => {
        const participants = voiceStates[ch.id] ?? EMPTY_PARTICIPANTS;
        return {
          id: ch.id,
          name: ch.name,
          color: ORBIT_COLORS[i % ORBIT_COLORS.length]!,
          onlineCount: participants.length,
        };
      }),
    [voiceChannels, voiceStates],
  );

  // -- Callbacks -------------------------------------------------------------
  const handleTextChannelSelect = useCallback(
    (id: string) => {
      setActiveChannelOrbital(id);
    },
    [setActiveChannelOrbital],
  );

  const handleVoiceOrbitSelect = useCallback(
    (id: string) => {
      setPendingVoiceJoin(id);
    },
    [setPendingVoiceJoin],
  );

  const handleOrbitDoubleClick = useCallback(
    (channelId: string) => {
      setPendingVoiceJoin(channelId);
    },
    [setPendingVoiceJoin],
  );

  const handleMicToggle = useCallback(() => {
    toggleMicFn?.();
  }, [toggleMicFn]);

  const handleScreenShareToggle = useCallback(() => {
    toggleScreenShareFn?.();
  }, [toggleScreenShareFn]);

  const disconnectFn = useVoiceStateStore((s) => s.disconnectFn);
  const handleDisconnect = useCallback(() => {
    // Use the bridged disconnect function from VoicePanel (sends gateway
    // leave message, clears LiveKit state, etc). Fall back to local-only
    // cleanup if VoicePanel hasn't registered yet.
    if (disconnectFn) {
      disconnectFn();
    } else {
      setConnectedChannelId(null);
    }
    setPendingVoiceJoin(null);
  }, [disconnectFn, setPendingVoiceJoin, setConnectedChannelId]);

  const handleUserMouseEnter = useCallback(
    (user: PositionedUser) => (e: React.MouseEvent) => {
      setTooltip({
        visible: true,
        x: e.clientX,
        y: e.clientY,
        name: user.handle,
        status: tooltipStatus(user.status, user.isMuted, user.isCurrentUser),
        orbitName: user.orbitName,
        ping: latencyMs !== null ? `${latencyMs}ms` : '\u2014',
      });
    },
    [latencyMs],
  );

  const handleUserMouseMove = useCallback((e: React.MouseEvent) => {
    setTooltip((prev) => ({ ...prev, x: e.clientX, y: e.clientY }));
  }, []);

  const handleUserMouseLeave = useCallback(() => {
    setTooltip((prev) => ({ ...prev, visible: false }));
  }, []);

  const handleChannelCreated = useCallback(
    (channel: { id: string; hubId: string; name: string; type: 'text' | 'voice'; position: number }) => {
      setChannels([...channels, channel]);
    },
    [channels, setChannels],
  );

  // -- Orbit drag handler (stores position override) -------------------------
  const handleOrbitDrag = useCallback(
    (channelId: string, newCx: number, newCy: number) => {
      setOrbitOverride(channelId, { cx: newCx, cy: newCy });
    },
    [setOrbitOverride],
  );

  // -- Orbit context menu handlers -------------------------------------------
  const handleOrbitContextMenu = useCallback(
    (channelId: string, channelName: string) => (e: React.MouseEvent) => {
      setOrbitCtxMenu({ channelId, channelName, position: { x: e.clientX, y: e.clientY } });
    },
    [],
  );

  const handleOrbitChannelDeleted = useCallback(
    (channelId: string) => {
      setChannels(channels.filter((c) => c.id !== channelId));
      setOrbitCtxMenu(null);
    },
    [channels, setChannels],
  );

  const handleOrbitChannelRenamed = useCallback(
    (channelId: string, newName: string) => {
      setChannels(channels.map((c) => (c.id === channelId ? { ...c, name: newName } : c)));
    },
    [channels, setChannels],
  );

  // -- Canvas pan handlers (drag on empty space) -----------------------------
  const handleCanvasPanDown = useCallback(
    (e: React.PointerEvent) => {
      // Only pan when clicking the container itself, not children
      if (e.target !== e.currentTarget) return;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      panDragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startPanX: panOffset.x,
        startPanY: panOffset.y,
      };
    },
    [panOffset],
  );

  const handleCanvasPanMove = useCallback(
    (e: React.PointerEvent) => {
      if (!panDragRef.current) return;
      const dx = e.clientX - panDragRef.current.startX;
      const dy = e.clientY - panDragRef.current.startY;
      setPanOffset({
        x: panDragRef.current.startPanX + dx,
        y: panDragRef.current.startPanY + dy,
      });
    },
    [setPanOffset],
  );

  const handleCanvasPanUp = useCallback(() => {
    panDragRef.current = null;
  }, []);

  // -- Mouse wheel zoom handler -----------------------------------------------
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      // Only zoom on the canvas/pannable area — don't hijack scroll in
      // overlays like the chat panel, channel list, or popovers.
      const target = e.target as HTMLElement;
      if (!target.closest('[data-pannable]')) return;
      e.preventDefault();
      const delta = -e.deltaY * 0.001;
      adjustZoom(delta);
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [adjustZoom]);

  // -- Back to cosmos: also reset layout -------------------------------------
  const handleBackToCosmos = useCallback(() => {
    resetLayout();
    clearActiveHub();
  }, [resetLayout, clearActiveHub]);

  // -- Empty state (cosmos view now handles hub selection) -------------------
  if (!activeHub) return null;

  // -- Render ----------------------------------------------------------------
  return (
    <div
      ref={containerRef}
      className="flex-1 relative overflow-hidden"
    >
      {/* ── Layer 0: Canvas scene (starfield, sun, orbits, planets, effects) ── */}
      <OrbitalCanvas
        orbits={canvasOrbits}
        userPositions={userPositionsMap}
        onlineUserIds={onlineUserIds}
        hubIconUrl={activeHub.iconUrl}
        hubName={activeHub.name}
        panOffset={panOffset}
        zoomLevel={zoomLevel}
        sunIntensity={sunIntensity}
      />

      {/* ── Pannable content layer ── */}
      {/* Captures pointer events on empty space for canvas panning. */}
      <div
        data-pannable
        className="absolute inset-0 z-[2] cursor-grab active:cursor-grabbing"
        style={{
          transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})`,
          transformOrigin: 'center center',
        }}
        onPointerDown={handleCanvasPanDown}
        onPointerMove={handleCanvasPanMove}
        onPointerUp={handleCanvasPanUp}
      >
        {/* Layer 2: Orbit zones */}
        {orbitData.map((od) => (
          <OrbitZone
            key={od.channel.id}
            id={od.channel.id}
            name={od.channel.name}
            cx={od.cx}
            cy={od.cy}
            radius={od.radius}
            color={od.color}
            memberCount={od.memberIds.length}
            onDoubleClick={() => handleOrbitDoubleClick(od.channel.id)}
            onDragMove={handleOrbitDrag}
            onContextMenu={handleOrbitContextMenu(od.channel.id, od.channel.name)}
          />
        ))}

        {/* Layer 3: User nodes */}
        {positionedUsers.map((user) => (
          <UserNode
            key={user.userId}
            userId={user.userId}
            handle={user.handle}
            avatarUrl={user.avatarUrl}
            initials={user.initials}
            gradientColors={user.gradientColors}
            x={user.x}
            y={user.y}
            status={user.status}
            isMuted={user.isMuted}
            isSpeaking={user.isSpeaking}
            isCurrentUser={user.isCurrentUser}
            orbitColor={user.orbitColor}
            channelId={user.channelId}
            isTyping={user.isTyping}
            isScreenSharing={user.isScreenSharing}
            onMouseEnter={handleUserMouseEnter(user)}
            onMouseMove={handleUserMouseMove}
            onMouseLeave={handleUserMouseLeave}
          />
        ))}
      </div>

      {/* ── Fixed UI overlays (not affected by pan) ── */}

      {/* Layer 4: Topbar */}
      <OrbitalTopbar
        hubName={activeHub.name}
        hubIconUrl={activeHub.iconUrl}
        activeOrbitCount={activeOrbitCount}
        onBackToCosmos={handleBackToCosmos}
      />

      {/* Layer 5: Channel list */}
      <OrbitalChannelList
        hubId={activeHub.id}
        textChannels={channelListTextChannels}
        voiceOrbits={channelListVoiceOrbits}
        activeChannelId={activeChannelId}
        onTextChannelSelect={handleTextChannelSelect}
        onVoiceOrbitSelect={handleVoiceOrbitSelect}
        canManageChannels={canManageChannels}
        onChannelCreated={handleChannelCreated}
        onChannelDeleted={handleOrbitChannelDeleted}
        onChannelRenamed={handleOrbitChannelRenamed}
      />

      {/* Layer 5b: First-time zoom/pan hint overlay */}
      {panZoomHintVisible && (
        <div
          className="absolute z-[195] left-0 right-0 flex justify-center pointer-events-none"
          style={{ bottom: '70px' }}
        >
          <button
            type="button"
            onClick={dismissPanZoomHint}
            className={[
              'font-mono text-[11px] text-white/50',
              'bg-white/5 border border-white/10 rounded-full px-4 py-2',
              'cursor-pointer pointer-events-auto select-none',
              'transition-opacity duration-300',
              'hover:text-white/70 hover:bg-white/8',
            ].join(' ')}
          >
            Scroll to zoom &middot; Drag to pan
          </button>
        </div>
      )}

      {/* Layer 6: HUD */}
      <OrbitalHud
        voiceChannelName={connectedVoiceChannel?.name ?? null}
        voiceParticipants={hudVoiceParticipants}
        latencyMs={latencyMs}
        currentUser={currentUserInfo}
        isMicMuted={localMicMuted}
        isDeafened={isDeafened}
        isScreenSharing={currentUserId ? screenSharingSet.has(currentUserId) : false}
        onMicToggle={handleMicToggle}
        onDeafenToggle={toggleDeafen}
        onDisconnect={handleDisconnect}
        onScreenShareToggle={handleScreenShareToggle}
        commsCenterOpen={commsCenterOpen}
        onCommsCenterToggle={toggleCommsCenter}
        activeTextChannelName={activeTextChannelName}
      />

      {/* Layer 7: Splinter New Orbit button */}
      <SplinterButton
        hubId={activeHub.id}
        canCreate={canManageChannels || canCreateOrbit}
        onChannelCreated={handleChannelCreated}
        existingVoiceCount={voiceChannels.length}
      />

      {/* Layer 7b: Orbit context menu */}
      {orbitCtxMenu && activeHub && (
        <OrbitContextMenu
          channelId={orbitCtxMenu.channelId}
          channelName={orbitCtxMenu.channelName}
          hubId={activeHub.id}
          position={orbitCtxMenu.position}
          canManageChannels={canManageChannels}
          canManageHub={canManageHub}
          onClose={() => setOrbitCtxMenu(null)}
          onOpenSettings={() => {
            setOrbitCtxMenu(null);
            setAdminConsoleOpen(true);
          }}
          onChannelDeleted={handleOrbitChannelDeleted}
          onChannelRenamed={handleOrbitChannelRenamed}
        />
      )}

      {/* Layer 7c: Admin console (controlled, opened from orbit context menu) */}
      {activeHub && (
        <AdminConsole
          hubId={activeHub.id}
          hubName={activeHub.name}
          open={adminConsoleOpen}
          onOpenChange={setAdminConsoleOpen}
        />
      )}

      {/* Layer 8: Floating chat panel (Comms Center) */}
      {activeChannelId && activeTextChannelName && (
        <FloatingChatPanel
          channelId={activeChannelId}
          channelName={activeTextChannelName}
          open={commsCenterOpen}
          onClose={toggleCommsCenter}
          pinned={commsCenterPinned}
          onTogglePin={toggleCommsCenterPin}
          savedPosition={commsCenterPosition}
          onPositionChange={setCommsCenterPosition}
          savedSize={commsCenterSize}
          onSizeChange={setCommsCenterSize}
        />
      )}

      {/* Layer 9: Tooltip (highest z-index) */}
      <UserTooltip
        visible={tooltip.visible}
        x={tooltip.x}
        y={tooltip.y}
        name={tooltip.name}
        status={tooltip.status}
        orbitName={tooltip.orbitName}
        ping={tooltip.ping}
      />
    </div>
  );
}
