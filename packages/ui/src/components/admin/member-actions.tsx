/**
 * @module member-actions
 * Three-dot dropdown menu rendered on member rows with Roles, Kick, and Ban
 * actions. The Roles action opens a checklist dialog for assigning/removing
 * hub roles. Ban includes an optional reason field via a confirmation dialog.
 */
'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogClose } from '../ui/dialog';
import { Input } from '../ui/input';
import { useToast } from '../ui/toast';
import { kickMember, banMember, assignRole, removeRole } from '../../lib/admin-api';
import { fetchRoles, type RoleResponse } from '../../lib/roles-api';
import type { MemberResponse } from '../../lib/admin-api';

interface MemberActionsProps {
  hubId: string;
  member: MemberResponse;
  onKicked: () => void;
  onBanned: () => void;
  onRolesChanged: (roles: { id: string; name: string; color?: string }[]) => void;
}

export function MemberActions({ hubId, member, onKicked, onBanned, onRolesChanged }: MemberActionsProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [kickOpen, setKickOpen] = useState(false);
  const [banOpen, setBanOpen] = useState(false);
  const [rolesOpen, setRolesOpen] = useState(false);
  const [banReason, setBanReason] = useState('');
  const [loading, setLoading] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const toast = useToast();

  // Roles dialog state
  const [allRoles, setAllRoles] = useState<RoleResponse[]>([]);
  const [memberRoleIds, setMemberRoleIds] = useState<Set<string>>(new Set());
  const [rolesLoading, setRolesLoading] = useState(false);
  const [togglingRoleId, setTogglingRoleId] = useState<string | null>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  // Load roles when dialog opens
  const loadRoles = useCallback(async () => {
    setRolesLoading(true);
    try {
      const roles = await fetchRoles(hubId);
      setAllRoles(roles.filter((r) => r.name !== '@everyone'));
      setMemberRoleIds(new Set(member.roles?.map((r) => r.id) ?? []));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load roles');
    } finally {
      setRolesLoading(false);
    }
  }, [hubId, member.roles, toast]);

  useEffect(() => {
    if (rolesOpen) loadRoles();
  }, [rolesOpen, loadRoles]);

  const handleToggleRole = async (role: RoleResponse) => {
    const hasRole = memberRoleIds.has(role.id);
    setTogglingRoleId(role.id);
    try {
      if (hasRole) {
        await removeRole(hubId, member.userId, role.id);
        setMemberRoleIds((prev) => {
          const next = new Set(prev);
          next.delete(role.id);
          return next;
        });
      } else {
        await assignRole(hubId, member.userId, role.id);
        setMemberRoleIds((prev) => new Set(prev).add(role.id));
      }
      // Update parent with new role list
      const updatedRoles = allRoles
        .filter((r) => {
          if (r.id === role.id) return !hasRole;
          return memberRoleIds.has(r.id);
        })
        .map((r) => ({ id: r.id, name: r.name, color: r.color }));
      onRolesChanged(updatedRoles);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update role');
    } finally {
      setTogglingRoleId(null);
    }
  };

  const handleKick = async () => {
    setLoading(true);
    try {
      await kickMember(hubId, member.userId);
      toast.success(`Kicked ${member.handle}`);
      onKicked();
      setKickOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to kick member');
    } finally {
      setLoading(false);
    }
  };

  const handleBan = async () => {
    setLoading(true);
    try {
      await banMember(hubId, member.userId, banReason || undefined);
      toast.success(`Banned ${member.handle}`);
      onBanned();
      setBanOpen(false);
      setBanReason('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to ban member');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setMenuOpen((p) => !p)}
        className="rounded-md p-1 text-text-muted hover:bg-surface-3 hover:text-text-primary transition-colors"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="8" cy="3" r="1.5" />
          <circle cx="8" cy="8" r="1.5" />
          <circle cx="8" cy="13" r="1.5" />
        </svg>
      </button>

      {menuOpen && (
        <div className="absolute right-0 top-8 z-10 w-36 rounded-lg border border-border bg-surface-2 py-1 shadow-lg">
          <button
            onClick={() => {
              setMenuOpen(false);
              setRolesOpen(true);
            }}
            className="flex w-full items-center px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-3 hover:text-text-primary"
          >
            Roles
          </button>
          <button
            onClick={() => {
              setMenuOpen(false);
              setKickOpen(true);
            }}
            className="flex w-full items-center px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-3 hover:text-text-primary"
          >
            Kick
          </button>
          <button
            onClick={() => {
              setMenuOpen(false);
              setBanOpen(true);
            }}
            className="flex w-full items-center px-3 py-1.5 text-sm text-danger hover:bg-danger/10"
          >
            Ban
          </button>
        </div>
      )}

      {/* Roles management dialog */}
      <Dialog open={rolesOpen} onOpenChange={setRolesOpen}>
        <DialogContent title={`Manage Roles \u2014 ${member.handle}`}>
          {rolesLoading ? (
            <p className="py-4 text-center text-sm text-text-muted">Loading roles...</p>
          ) : allRoles.length === 0 ? (
            <p className="py-4 text-center text-sm text-text-muted">
              No roles created yet. Create roles in the Roles tab first.
            </p>
          ) : (
            <div className="space-y-1">
              {allRoles.map((role) => {
                const checked = memberRoleIds.has(role.id);
                const isToggling = togglingRoleId === role.id;
                return (
                  <label
                    key={role.id}
                    className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 hover:bg-surface-2/50"
                  >
                    {isToggling ? (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                    ) : (
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => handleToggleRole(role)}
                        className="h-4 w-4 rounded border-border bg-surface-2 accent-accent"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-text-primary">{role.name}</span>
                      <span className="ml-2 text-[10px] text-text-muted">
                        Priority: {role.priority}
                      </span>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
          <div className="mt-4 flex justify-end">
            <DialogClose asChild>
              <Button variant="ghost" type="button">Done</Button>
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>

      {/* Kick confirmation dialog */}
      <Dialog open={kickOpen} onOpenChange={setKickOpen}>
        <DialogContent title="Kick Member" description={`Remove ${member.handle} from this hub?`}>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="ghost" type="button">Cancel</Button>
            </DialogClose>
            <Button variant="danger" onClick={handleKick} loading={loading}>
              Kick
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Ban confirmation dialog */}
      <Dialog open={banOpen} onOpenChange={setBanOpen}>
        <DialogContent title="Ban Member" description={`Ban ${member.handle} from this hub? They will be kicked and unable to rejoin.`}>
          <div className="space-y-4">
            <Input
              label="Reason (optional)"
              value={banReason}
              onChange={(e) => setBanReason(e.target.value)}
              placeholder="Reason for ban..."
              maxLength={500}
            />
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button variant="ghost" type="button">Cancel</Button>
              </DialogClose>
              <Button variant="danger" onClick={handleBan} loading={loading}>
                Ban
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
