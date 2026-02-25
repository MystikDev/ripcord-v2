/**
 * @module member-list-panel
 * Right sidebar showing hub members grouped by highest-priority role, sorted
 * by presence then alphabetically, with status dot overlays.
 */
'use client';

import { useMemo } from 'react';
import { useMemberStore, type MemberInfo } from '../../stores/member-store';
import { useRoleStore, type RoleDefinition } from '../../stores/role-store';
import { usePresenceStore, type PresenceStatus } from '../../stores/presence-store';
import { ScrollArea } from '../ui/scroll-area';
import { Avatar } from '../ui/avatar';
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
// Status dot overlay
// ---------------------------------------------------------------------------

const STATUS_COLOR: Record<PresenceStatus, string> = {
  online: 'bg-emerald-400',
  idle: 'bg-amber-400',
  dnd: 'bg-red-400',
  offline: 'bg-gray-500',
};

function StatusDot({ status }: { status: PresenceStatus }) {
  return (
    <span
      className={clsx(
        'absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-surface-1',
        STATUS_COLOR[status],
      )}
    />
  );
}

// ---------------------------------------------------------------------------
// Member row — subscribes to its own presence for granular re-renders
// ---------------------------------------------------------------------------

function MemberRow({ member, offline }: { member: MemberInfo; offline?: boolean }) {
  const status = usePresenceStore((s) => s.getStatus(member.userId));

  return (
    <div
      className={clsx(
        'flex items-center gap-2 rounded-md px-2 py-1 transition-colors',
        'hover:bg-surface-2',
        offline && 'opacity-40',
      )}
    >
      {/* Avatar with status indicator */}
      <div className="relative shrink-0">
        <Avatar
          src={member.avatarUrl}
          fallback={member.handle}
          size="sm"
          className="!h-8 !w-8 !text-xs"
        />
        <StatusDot status={status} />
      </div>

      {/* Handle — bright white for online, dim for offline */}
      <span
        className={clsx(
          'truncate text-sm font-medium',
          offline ? 'text-text-muted' : 'text-white',
        )}
      >
        {member.handle}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Role group header
// ---------------------------------------------------------------------------

function RoleGroupHeader({ name, count }: { name: string; count: number }) {
  return (
    <div className="px-2 pt-4 pb-1">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
        {name} — {count}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Grouping logic
// ---------------------------------------------------------------------------

interface RoleGroup {
  roleId: string | null; // null = catch-all "Members" group
  name: string;
  priority: number;
  members: MemberInfo[];
}

interface GroupedMembers {
  /** Role groups containing only online/idle/dnd members */
  onlineGroups: RoleGroup[];
  /** All offline members regardless of role */
  offlineMembers: MemberInfo[];
}

function buildRoleGroups(
  members: Record<string, MemberInfo>,
  roles: RoleDefinition[],
  presenceMap: Record<string, PresenceStatus>,
): GroupedMembers {
  // Build lookup: roleId -> RoleDefinition
  const roleById = new Map<string, RoleDefinition>();
  for (const r of roles) {
    roleById.set(r.id, r);
  }

  // Separate online and offline, group online by role
  const groupMap = new Map<string | null, MemberInfo[]>();
  const offlineMembers: MemberInfo[] = [];

  for (const member of Object.values(members)) {
    const status = presenceMap[member.userId] ?? 'offline';

    if (status === 'offline') {
      offlineMembers.push(member);
      continue;
    }

    const memberRoles = member.roles ?? [];

    // Find highest-priority (lowest number) non-@everyone role
    let bestRole: RoleDefinition | null = null;
    for (const mr of memberRoles) {
      const def = roleById.get(mr.id);
      if (!def) continue;
      if (def.name.toLowerCase() === '@everyone') continue;
      if (!bestRole || def.priority < bestRole.priority) {
        bestRole = def;
      }
    }

    const groupKey = bestRole?.id ?? null;
    const existing = groupMap.get(groupKey) ?? [];
    existing.push(member);
    groupMap.set(groupKey, existing);
  }

  // Build group array (online only)
  const onlineGroups: RoleGroup[] = [];
  for (const [roleId, groupMembers] of groupMap) {
    const def = roleId ? roleById.get(roleId) : null;
    onlineGroups.push({
      roleId,
      name: def?.name ?? 'Members',
      priority: def?.priority ?? Number.MAX_SAFE_INTEGER,
      members: groupMembers,
    });
  }

  // Sort groups by priority (ascending = highest rank first), catch-all last
  onlineGroups.sort((a, b) => a.priority - b.priority);

  // Within each group, sort by presence weight then alphabetical
  for (const group of onlineGroups) {
    group.members.sort((a, b) => {
      const pa = PRESENCE_WEIGHT[presenceMap[a.userId] ?? 'offline'];
      const pb = PRESENCE_WEIGHT[presenceMap[b.userId] ?? 'offline'];
      if (pa !== pb) return pa - pb;
      return a.handle.localeCompare(b.handle);
    });
  }

  // Sort offline members alphabetically
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

  return (
    <div className="flex h-full w-60 flex-col border-l border-border bg-surface-1">
      {/* Header */}
      <div className="flex h-12 items-center border-b border-border px-4">
        <h3 className="text-sm font-semibold text-text-primary">
          Members
        </h3>
        <span className="ml-1.5 text-xs text-text-muted">
          {onlineCount}/{totalCount}
        </span>
      </div>

      {/* Scrollable member list */}
      <ScrollArea className="flex-1">
        <div className="p-2">
          {/* Online members grouped by role */}
          {onlineGroups.map((group) => (
            <div key={group.roleId ?? '__members'}>
              <RoleGroupHeader name={group.name} count={group.members.length} />
              {group.members.map((member) => (
                <MemberRow key={member.userId} member={member} />
              ))}
            </div>
          ))}

          {/* Offline section — visually separated */}
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
    </div>
  );
}
