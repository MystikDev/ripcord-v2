/**
 * @module solar-system-view
 * Orbital view orchestrator. Composes the canvas background, orbit zones,
 * user nodes, topbar, channel list, HUD, and tooltip into a full-screen
 * immersive visualization of the active hub's voice channels and members.
 */
'use client';

import { useMemo, useCallback, useState, useRef, useEffect } from 'react';
import { OrbitalCanvasBg } from './orbital/orbital-canvas-bg';
import { OrbitZone } from './orbital/orbit-zone';
import { UserNode } from './orbital/user-node';
import { UserTooltip } from './orbital/user-tooltip';
import { OrbitalTopbar } from './orbital/orbital-topbar';
import { OrbitalChannelList } from './orbital/orbital-channel-list';
import { OrbitalHud } from './orbital/orbital-hud';
import { SplinterButton } from './orbital/splinter-button';
import { FloatingChatPanel } from './orbital/floating-chat-panel';
import { useHubStore, type Channel } from '../../stores/server-store';
import { useHasPermission } from '../../hooks/use-has-permission';
import { useVoiceStateStore, EMPTY_PARTICIPANTS } from '../../stores/voice-state-store';
import { usePresenceStore, type PresenceStatus } from '../../stores/presence-store';
import { useMemberStore, type MemberInfo } from '../../stores/member-store';
import { useAuthStore } from '../../stores/auth-store';
import { useSettingsStore } from '../../stores/settings-store';

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
  /** Channel name the user is in, or 'NONE' */
  orbitName: string;
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

  const voiceStates = useVoiceStateStore((s) => s.voiceStates);
  const speakingUserIds = useVoiceStateStore((s) => s.speakingUserIds);
  const connectedChannelId = useVoiceStateStore((s) => s.connectedChannelId);
  const localMicMuted = useVoiceStateStore((s) => s.localMicMuted);
  const toggleMicFn = useVoiceStateStore((s) => s.toggleMicFn);
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

  const canManageChannels = useHasPermission(1 << 3); // Permission.MANAGE_CHANNELS
  const setChannels = useHubStore((s) => s.setChannels);

  const activeHub = hubs.find((h) => h.id === activeHubId);

  // -- Local state -----------------------------------------------------------
  const [channelListOpen, setChannelListOpen] = useState(false);
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

    return voiceChannels.map((ch, i) => {
      const participants = voiceStates[ch.id] ?? EMPTY_PARTICIPANTS;
      const memberCount = participants.length;
      const radius = Math.min(160, 80 + 15 * memberCount);
      const color = ORBIT_COLORS[i % ORBIT_COLORS.length]!;
      const pos = presets[i] ?? { cx: 0.5, cy: 0.5 };

      return {
        channel: ch,
        cx: pos.cx,
        cy: pos.cy,
        radius,
        color,
        memberIds: participants.map((p) => p.userId),
      };
    });
  }, [voiceChannels, voiceStates]);

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
          orbitName: od.channel.name,
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
        orbitName: 'NONE',
      });
    }

    return result;
  }, [
    orbitData, voiceStates, members, presence, speakingSet,
    usersInVoice, currentUserId, viewSize,
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

  // -- Derived: canvas bg orbits prop ----------------------------------------
  const canvasOrbits = useMemo(
    () =>
      orbitData.map((od) => ({
        id: od.channel.id,
        cx: od.cx,
        cy: od.cy,
        radius: od.radius,
        color: od.color,
        memberIds: od.memberIds,
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
  const handleChannelListToggle = useCallback(() => {
    setChannelListOpen((prev) => !prev);
  }, []);

  const handleChannelListClose = useCallback(() => {
    setChannelListOpen(false);
  }, []);

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

  const handleDisconnect = useCallback(() => {
    setPendingVoiceJoin(null);
    setConnectedChannelId(null);
  }, [setPendingVoiceJoin, setConnectedChannelId]);

  const handleUserMouseEnter = useCallback(
    (user: PositionedUser) => (e: React.MouseEvent) => {
      setTooltip({
        visible: true,
        x: e.clientX,
        y: e.clientY,
        name: user.handle,
        status: tooltipStatus(user.status, user.isMuted, user.isCurrentUser),
        orbitName: user.orbitName,
        ping: '\u2014',
      });
    },
    [],
  );

  const handleUserMouseMove = useCallback((e: React.MouseEvent) => {
    setTooltip((prev) => ({ ...prev, x: e.clientX, y: e.clientY }));
  }, []);

  const handleUserMouseLeave = useCallback(() => {
    setTooltip((prev) => ({ ...prev, visible: false }));
  }, []);

  const handleChannelCreated = useCallback(
    (channel: { id: string; hubId: string; name: string; type: 'voice'; position: number }) => {
      setChannels([...channels, channel]);
    },
    [channels, setChannels],
  );

  // -- Empty state -----------------------------------------------------------
  if (!activeHub) {
    return (
      <div className="flex flex-1 items-center justify-center text-text-muted text-sm">
        Select a solar system to begin exploring
      </div>
    );
  }

  // -- Render ----------------------------------------------------------------
  return (
    <div
      ref={containerRef}
      className="flex-1 relative overflow-hidden"
    >
      {/* Layer 0: Canvas animated background */}
      <OrbitalCanvasBg
        orbits={canvasOrbits}
        userPositions={userPositionsMap}
        onlineUserIds={onlineUserIds}
      />

      {/* Layer 1: Grid overlay */}
      <div
        className="absolute inset-0 z-[1] pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(0,229,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(0,229,255,0.02) 1px, transparent 1px)',
          backgroundSize: '70px 70px',
        }}
      />

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
          onMouseEnter={handleUserMouseEnter(user)}
          onMouseMove={handleUserMouseMove}
          onMouseLeave={handleUserMouseLeave}
        />
      ))}

      {/* Layer 4: Topbar */}
      <OrbitalTopbar
        hubName={activeHub.name}
        hubIconUrl={activeHub.iconUrl}
        activeOrbitCount={activeOrbitCount}
        onChannelListToggle={handleChannelListToggle}
      />

      {/* Layer 5: Channel list */}
      <OrbitalChannelList
        open={channelListOpen}
        onClose={handleChannelListClose}
        textChannels={channelListTextChannels}
        voiceOrbits={channelListVoiceOrbits}
        activeChannelId={activeChannelId}
        onTextChannelSelect={handleTextChannelSelect}
        onVoiceOrbitSelect={handleVoiceOrbitSelect}
      />

      {/* Layer 6: HUD */}
      <OrbitalHud
        voiceChannelName={connectedVoiceChannel?.name ?? null}
        voiceParticipants={hudVoiceParticipants}
        latencyMs={null}
        currentUser={currentUserInfo}
        isMicMuted={localMicMuted}
        isDeafened={isDeafened}
        onMicToggle={handleMicToggle}
        onDeafenToggle={toggleDeafen}
        onDisconnect={handleDisconnect}
        commsCenterOpen={commsCenterOpen}
        onCommsCenterToggle={toggleCommsCenter}
        activeTextChannelName={activeTextChannelName}
      />

      {/* Layer 7: Splinter New Orbit button */}
      <SplinterButton
        hubId={activeHub.id}
        canCreate={canManageChannels}
        onChannelCreated={handleChannelCreated}
        existingVoiceCount={voiceChannels.length}
      />

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
