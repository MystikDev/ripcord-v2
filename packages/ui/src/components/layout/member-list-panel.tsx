/**
 * @module member-list-panel
 * ORBIT-styled right sidebar. Shows a spatial map visualization, active
 * entities (members) grouped by role with presence indicators, and a
 * system status bar at the bottom.
 */
'use client';

import { useMemo, useState } from 'react';
import { useMemberStore, type MemberInfo } from '../../stores/member-store';
import { useRoleStore, type RoleDefinition } from '../../stores/role-store';
import { usePresenceStore, type PresenceStatus } from '../../stores/presence-store';
import { useVoiceStateStore } from '../../stores/voice-state-store';
import { useAuthStore } from '../../stores/auth-store';
import { ScrollArea } from '../ui/scroll-area';
import { Avatar } from '../ui/avatar';
import { UserContextMenu } from '../ui/user-context-menu';
import clsx from 'clsx';

// ---------------------------------------------------------------------------
// Presence helpers
// ---------------------------------------------------------------------------

const PRESENCE_WEIGHT: Record<PresenceStatus, number> = {
  online: 0,
  idle: 1,
  dnd: 2,
  offline: 3,
};

// ---------------------------------------------------------------------------
// Status dot overlay — ORBIT accent colors
// ---------------------------------------------------------------------------

const STATUS_COLOR: Record<PresenceStatus, string> = {
  online: 'bg-accent',
  idle: 'bg-accent-yellow',
  dnd: 'bg-accent-magenta',
  offline: 'bg-white/20',
};

function StatusDot({ status }: { status: PresenceStatus }) {
  return (
    <span
      className={clsx(
        'absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-panel',
        STATUS_COLOR[status],
      )}
    />
  );
}

// ---------------------------------------------------------------------------
// Spatial Map — orbiting visualization
// ---------------------------------------------------------------------------

/** Orbital user — data needed for each avatar in the spatial map */
interface OrbitalUser {
  userId: string;
  handle: string;
  avatarUrl?: string;
  isScreenSharing: boolean;
  isInVoice: boolean;
  status: PresenceStatus;
}

/** Ring config: radius in px, animation duration, direction */
const RING_CONFIG = [
  { radius: 90, duration: '40s', direction: 'normal' as const },
  { radius: 66, duration: '30s', direction: 'reverse' as const },
  { radius: 42, duration: '22s', direction: 'normal' as const },
];

/** Border color based on user activity */
function getActivityBorder(user: OrbitalUser): string {
  if (user.isScreenSharing) return 'border-accent-magenta'; // magenta = screen sharing
  if (user.isInVoice) return 'border-success';              // green = in voice
  if (user.status === 'dnd') return 'border-danger';         // red = dnd
  if (user.status === 'idle') return 'border-accent-yellow'; // yellow = idle
  return 'border-accent/40';                                  // cyan = online default
}

function SpatialMap({ onlineCount, totalCount, orbitalUsers }: { onlineCount: number; totalCount: number; orbitalUsers: OrbitalUser[] }) {
  const users = orbitalUsers.slice(0, 6);

  return (
    <div className="h-44 relative overflow-hidden border-b border-white/5">
      <div className="absolute inset-0 flex items-center justify-center">
        {/* Orbit container — sized to contain all rings + avatars without overflow */}
        <div className="relative" style={{ width: '110px', height: '110px' }}>
          {/* 3 orbit rings: faint → light → lighter toward center */}
          <div className="absolute inset-0 border border-white/[0.06] rounded-full" />
          <div className="absolute rounded-full border border-white/[0.10]" style={{ inset: '12px' }} />
          <div className="absolute rounded-full border border-white/[0.15]" style={{ inset: '24px' }} />

          {/* Orbiting user avatars — 2 per ring */}
          {users.map((user, i) => {
            const ringIdx = Math.floor(i / 2);
            const ring = RING_CONFIG[ringIdx] ?? RING_CONFIG[0];
            const slotInRing = i % 2;
            const startDeg = slotInRing * 180 + ringIdx * 60; // offset each ring pair
            const avatarSize = 22;
            const orbitRadius = ring.radius / 2;

            return (
              <div
                key={user.userId}
                className="absolute animate-orbit-spin"
                style={{
                  animationDuration: ring.duration,
                  animationDirection: ring.direction,
                  animationTimingFunction: 'linear',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                }}
              >
                {/* Counter-rotate the avatar so it stays upright */}
                <div
                  className="absolute"
                  style={{
                    top: '50%',
                    left: '50%',
                    width: avatarSize,
                    height: avatarSize,
                    marginTop: -avatarSize / 2,
                    marginLeft: -avatarSize / 2,
                    transform: `rotate(${startDeg}deg) translateX(${orbitRadius}px) rotate(-${startDeg}deg)`,
                  }}
                >
                  <div
                    className="animate-orbit-spin"
                    style={{
                      animationDuration: ring.duration,
                      animationDirection: ring.direction === 'normal' ? 'reverse' : 'normal',
                      animationTimingFunction: 'linear',
                    }}
                  >
                    <div className={clsx('rounded-full border-2 p-[1px]', getActivityBorder(user))} title={user.handle}>
                      <Avatar
                        src={user.avatarUrl}
                        fallback={user.handle}
                        size="sm"
                        style={{ width: `${avatarSize - 6}px`, height: `${avatarSize - 6}px`, fontSize: '7px' }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Center pulse — blue dot */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-2.5 h-2.5 bg-accent rounded-full animate-pulse" />
          </div>
        </div>
      </div>

      {/* Entity count label */}
      <div className="absolute bottom-3 left-3">
        <div className="text-[10px] text-white/40 font-mono uppercase tracking-wider">Spatial View</div>
        <div className="text-sm text-white/80">{onlineCount} / {totalCount} entities</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Member row — subscribes to its own presence for granular re-renders
// ---------------------------------------------------------------------------

function MemberRow({ member, offline, roleColor }: { member: MemberInfo; offline?: boolean; roleColor?: string }) {
  const status = usePresenceStore((s) => s.getStatus(member.userId));
  const currentUserId = useAuthStore((s) => s.userId);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  return (
    <>
      <div
        className={clsx(
          'group flex items-center gap-3 rounded-xl px-3 py-2 transition-all duration-200',
          'hover:bg-white/5 border border-transparent',
          !offline && 'hover:border-accent/20',
          offline && 'opacity-40',
        )}
        onContextMenu={(e) => {
          if (member.userId === currentUserId) return;
          e.preventDefault();
          setContextMenu({ x: e.clientX, y: e.clientY });
        }}
      >
        {/* Avatar with status indicator */}
        <div className="relative shrink-0">
          <Avatar
            src={member.avatarUrl}
            fallback={member.handle}
            size="sm"
            style={{ width: 'var(--icon-size-base, 32px)', height: 'var(--icon-size-base, 32px)', fontSize: 'calc(var(--icon-size-base, 32px) * 0.35)' }}
          />
          <StatusDot status={status} />
        </div>

        {/* Handle */}
        <div className="flex-1 min-w-0">
          <span
            className={clsx(
              'truncate font-medium block',
              offline && 'text-text-muted',
            )}
            style={{
              fontSize: 'var(--font-size-sm, 12px)',
              ...(!offline ? { color: roleColor ?? 'var(--color-username, white)' } : {}),
            }}
          >
            {member.handle}
          </span>
        </div>

        {/* Activity indicator */}
        {!offline && (
          <div className={clsx(
            'w-2 h-2 rounded-full animate-pulse',
            STATUS_COLOR[status],
          )} />
        )}
      </div>
      {contextMenu && (
        <UserContextMenu
          userId={member.userId}
          displayName={member.handle}
          position={contextMenu}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Role group header
// ---------------------------------------------------------------------------

function RoleGroupHeader({ name, count, color }: { name: string; count: number; color?: string }) {
  return (
    <div className="px-3 pt-4 pb-1">
      <p
        className={clsx('text-[11px] font-bold uppercase tracking-wider', !color && 'text-white/30')}
        style={color ? { color } : undefined}
      >
        {name} — {count}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Grouping logic
// ---------------------------------------------------------------------------

interface RoleGroup {
  roleId: string | null;
  name: string;
  priority: number;
  color?: string;
  members: MemberInfo[];
}

interface GroupedMembers {
  onlineGroups: RoleGroup[];
  offlineMembers: MemberInfo[];
}

function buildRoleGroups(
  members: Record<string, MemberInfo>,
  roles: RoleDefinition[],
  presenceMap: Record<string, PresenceStatus>,
): GroupedMembers {
  const roleById = new Map<string, RoleDefinition>();
  for (const r of roles) {
    roleById.set(r.id, r);
  }

  const groupMap = new Map<string | null, MemberInfo[]>();
  const offlineMembers: MemberInfo[] = [];

  for (const member of Object.values(members)) {
    const status = presenceMap[member.userId] ?? 'offline';

    if (status === 'offline') {
      offlineMembers.push(member);
      continue;
    }

    const memberRoles = member.roles ?? [];

    let bestRole: RoleDefinition | null = null;
    for (const mr of memberRoles) {
      const def = roleById.get(mr.id);
      if (!def) continue;
      if (def.name.toLowerCase() === '@everyone') continue;
      if (!bestRole || def.priority > bestRole.priority) {
        bestRole = def;
      }
    }

    const groupKey = bestRole?.id ?? null;
    const existing = groupMap.get(groupKey) ?? [];
    existing.push(member);
    groupMap.set(groupKey, existing);
  }

  const onlineGroups: RoleGroup[] = [];
  for (const [roleId, groupMembers] of groupMap) {
    const def = roleId ? roleById.get(roleId) : null;
    onlineGroups.push({
      roleId,
      name: def?.name ?? 'Members',
      priority: def?.priority ?? Number.MAX_SAFE_INTEGER,
      color: def?.color,
      members: groupMembers,
    });
  }

  // Higher-priority roles (admins) first; ungrouped "Members" (null) always last
  onlineGroups.sort((a, b) => {
    if (a.roleId === null && b.roleId !== null) return 1;
    if (b.roleId === null && a.roleId !== null) return -1;
    return b.priority - a.priority;
  });

  for (const group of onlineGroups) {
    group.members.sort((a, b) => {
      const pa = PRESENCE_WEIGHT[presenceMap[a.userId] ?? 'offline'];
      const pb = PRESENCE_WEIGHT[presenceMap[b.userId] ?? 'offline'];
      if (pa !== pb) return pa - pb;
      return a.handle.localeCompare(b.handle);
    });
  }

  offlineMembers.sort((a, b) => a.handle.localeCompare(b.handle));

  return { onlineGroups, offlineMembers };
}

// ---------------------------------------------------------------------------
// Panel component
// ---------------------------------------------------------------------------

export function MemberListPanel() {
  const members = useMemberStore((s) => s.members);
  const roles = useRoleStore((s) => s.roles);
  const presenceMap = usePresenceStore((s) => s.presence);

  const { onlineGroups, offlineMembers } = useMemo(
    () => buildRoleGroups(members, roles, presenceMap),
    [members, roles, presenceMap],
  );

  const totalCount = Object.keys(members).length;
  const onlineCount = totalCount - offlineMembers.length;

  // Voice & screen-share data for activity borders
  const connectedChannelId = useVoiceStateStore((s) => s.connectedChannelId);
  const voiceStates = useVoiceStateStore((s) => s.voiceStates);
  const screenSharingUserIds = useVoiceStateStore((s) => s.screenSharingUserIds);

  // Build orbital user data for the spatial map (first 6 online members)
  const orbitalUsers = useMemo(() => {
    const result: OrbitalUser[] = [];
    // Collect user IDs currently in any voice channel
    const inVoiceSet = new Set<string>();
    for (const participants of Object.values(voiceStates)) {
      for (const p of participants) inVoiceSet.add(p.userId);
    }
    const screenShareSet = new Set(screenSharingUserIds);

    for (const group of onlineGroups) {
      for (const m of group.members) {
        result.push({
          userId: m.userId,
          handle: m.handle,
          avatarUrl: m.avatarUrl,
          isScreenSharing: screenShareSet.has(m.userId),
          isInVoice: inVoiceSet.has(m.userId),
          status: presenceMap[m.userId] ?? 'online',
        });
        if (result.length >= 6) break;
      }
      if (result.length >= 6) break;
    }
    return result;
  }, [onlineGroups, voiceStates, screenSharingUserIds, presenceMap]);

  return (
    <div className="flex h-full w-72 flex-col glass-panel border-l border-white/5">
      {/* Spatial map visualization */}
      <SpatialMap onlineCount={onlineCount} totalCount={totalCount} orbitalUsers={orbitalUsers} />

      {/* Active entities */}
      <ScrollArea className="flex-1">
        <div className="p-2">
          <div className="px-3 pt-2 pb-1">
            <p className="text-[11px] font-bold text-white/30 uppercase tracking-wider">Active Now</p>
          </div>

          {/* Online members grouped by role */}
          {onlineGroups.map((group) => (
            <div key={group.roleId ?? '__members'}>
              <RoleGroupHeader name={group.name} count={group.members.length} color={group.color} />
              {group.members.map((member) => (
                <MemberRow key={member.userId} member={member} roleColor={group.color} />
              ))}
            </div>
          ))}

          {/* Offline section */}
          {offlineMembers.length > 0 && (
            <div>
              <RoleGroupHeader name="Offline" count={offlineMembers.length} />
              {offlineMembers.map((member) => (
                <MemberRow key={member.userId} member={member} offline />
              ))}
            </div>
          )}

          {totalCount === 0 && (
            <p className="px-2 pt-8 text-center text-sm text-text-muted">
              No members
            </p>
          )}
        </div>
      </ScrollArea>

      {/* System status bar */}
      <div className="p-4 border-t border-white/5">
        <div className="flex items-center justify-between text-xs text-white/40 mb-2">
          <span className="font-mono">System Status</span>
          <span className="text-accent font-medium">OPTIMAL</span>
        </div>
        <div className="h-1 bg-white/10 rounded-full overflow-hidden">
          <div className="h-full w-3/4 bg-gradient-to-r from-accent to-accent-violet animate-pulse rounded-full" />
        </div>
      </div>
    </div>
  );
}
