/**
 * @module role-editor
 * Two-column layout for CRUD operations on hub roles. The left sidebar
 * lists existing roles; the right panel shows name, priority, and the
 * PermissionGrid for the selected role.
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { ScrollArea } from '../ui/scroll-area';
import { PermissionGrid } from './permission-grid';
import { useToast } from '../ui/toast';
import {
  fetchRoles,
  createRole,
  updateRole,
  deleteRole,
  type RoleResponse,
} from '../../lib/roles-api';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RoleEditor({ hubId }: { hubId: string }) {
  const toast = useToast();
  const [roles, setRoles] = useState<RoleResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Currently selected role for editing
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPriority, setEditPriority] = useState(100);
  const [editBitset, setEditBitset] = useState(0);
  const [saving, setSaving] = useState(false);

  // Create new role dialog state
  const [showCreate, setShowCreate] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [creating, setCreating] = useState(false);

  // Delete confirmation
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadRoles = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchRoles(hubId);
      setRoles(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load roles');
    } finally {
      setLoading(false);
    }
  }, [hubId]);

  useEffect(() => {
    loadRoles();
  }, [loadRoles]);

  // Select a role to edit
  const selectRole = (role: RoleResponse) => {
    setSelectedRoleId(role.id);
    setEditName(role.name);
    setEditPriority(role.priority);
    setEditBitset(Number(role.bitsetPermissions));
    setConfirmDelete(null);
  };

  const selectedRole = roles.find((r) => r.id === selectedRoleId);

  // Save role updates
  const handleSave = async () => {
    if (!selectedRoleId || !selectedRole) return;
    setSaving(true);
    try {
      const updates: Record<string, unknown> = {};
      if (editName !== selectedRole.name) updates.name = editName;
      if (editPriority !== selectedRole.priority) updates.priority = editPriority;
      if (String(editBitset) !== selectedRole.bitsetPermissions) {
        updates.bitsetPermissions = String(editBitset);
      }

      if (Object.keys(updates).length === 0) {
        toast.info('No changes to save');
        setSaving(false);
        return;
      }

      const updated = await updateRole(hubId, selectedRoleId, updates as {
        name?: string;
        priority?: number;
        bitsetPermissions?: string;
      });
      setRoles((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      toast.success('Role updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update role');
    } finally {
      setSaving(false);
    }
  };

  // Create new role
  const handleCreate = async () => {
    if (!newRoleName.trim()) return;
    setCreating(true);
    try {
      const created = await createRole(hubId, { name: newRoleName.trim() });
      setRoles((prev) => [...prev, created]);
      setNewRoleName('');
      setShowCreate(false);
      selectRole(created);
      toast.success(`Role "${created.name}" created`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create role');
    } finally {
      setCreating(false);
    }
  };

  // Delete role
  const handleDelete = async (roleId: string) => {
    setDeleting(true);
    try {
      await deleteRole(hubId, roleId);
      setRoles((prev) => prev.filter((r) => r.id !== roleId));
      if (selectedRoleId === roleId) {
        setSelectedRoleId(null);
      }
      setConfirmDelete(null);
      toast.success('Role deleted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete role');
    } finally {
      setDeleting(false);
    }
  };

  const isEveryone = selectedRole?.name === '@everyone';

  return (
    <div className="flex gap-4" style={{ minHeight: '400px' }}>
      {/* Role list sidebar */}
      <div className="w-48 shrink-0 border-r border-border pr-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-primary">Roles</h3>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="rounded-md p-1 text-text-muted hover:bg-surface-2 hover:text-text-primary transition-colors"
            title="Create Role"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M7 2v10M2 7h10" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Inline create role form */}
        {showCreate && (
          <div className="mb-3 space-y-2">
            <Input
              placeholder="Role name"
              value={newRoleName}
              onChange={(e) => setNewRoleName(e.target.value)}
              maxLength={100}
              autoFocus
            />
            <div className="flex gap-1">
              <Button size="sm" loading={creating} onClick={handleCreate} disabled={!newRoleName.trim()}>
                Create
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setShowCreate(false); setNewRoleName(''); }}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-2 rounded-md bg-danger/10 px-3 py-1 text-xs text-danger">
            {error}
          </div>
        )}

        <ScrollArea className="max-h-[350px]">
          <div className="space-y-0.5">
            {roles.map((role) => (
              <button
                key={role.id}
                onClick={() => selectRole(role)}
                className={`w-full rounded-md px-3 py-1.5 text-left text-sm transition-colors ${
                  selectedRoleId === role.id
                    ? 'bg-surface-3 text-text-primary'
                    : 'text-text-muted hover:bg-surface-2 hover:text-text-secondary'
                }`}
              >
                <span className="truncate block">{role.name}</span>
                <span className="text-[10px] text-text-muted">Priority: {role.priority}</span>
              </button>
            ))}
            {roles.length === 0 && !loading && (
              <p className="py-4 text-center text-xs text-text-muted">No roles</p>
            )}
            {loading && (
              <p className="py-4 text-center text-xs text-text-muted">Loading...</p>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Role editor panel */}
      <div className="flex-1 overflow-auto">
        {selectedRole ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-text-primary">
                {isEveryone ? '@everyone Role' : `Edit: ${selectedRole.name}`}
              </h3>
              {!isEveryone && (
                <div>
                  {confirmDelete === selectedRole.id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-danger">Delete this role?</span>
                      <Button
                        size="sm"
                        variant="danger"
                        loading={deleting}
                        onClick={() => handleDelete(selectedRole.id)}
                      >
                        Confirm
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(null)}>
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => setConfirmDelete(selectedRole.id)}
                    >
                      Delete Role
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Name & priority */}
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                maxLength={100}
                disabled={isEveryone}
              />
              <Input
                label="Priority (lower = higher rank)"
                type="number"
                value={String(editPriority)}
                onChange={(e) => setEditPriority(Number(e.target.value))}
                disabled={isEveryone}
              />
            </div>

            {/* Permission grid */}
            <ScrollArea className="max-h-[300px]">
              <PermissionGrid
                bitset={editBitset}
                onChange={setEditBitset}
              />
            </ScrollArea>

            {/* Save button */}
            <div className="flex justify-end border-t border-border pt-3">
              <Button loading={saving} onClick={handleSave}>
                Save Changes
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-text-muted">
              Select a role to edit its permissions
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
