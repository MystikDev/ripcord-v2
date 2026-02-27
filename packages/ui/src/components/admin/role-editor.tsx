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
  const [editColor, setEditColor] = useState('');
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
    setEditColor(role.color ?? '');
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
      if (editColor !== (selectedRole.color ?? '')) {
        updates.color = editColor || null;
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
        color?: string | null;
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
    <div className="flex h-full min-h-0 gap-4">
      {/* Role list sidebar */}
      <div className="flex w-48 shrink-0 flex-col border-r border-border pr-4">
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

        <ScrollArea className="min-h-0 flex-1">
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
                <span className="flex items-center gap-1.5 truncate">
                  {role.color && (
                    <span
                      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: role.color }}
                    />
                  )}
                  <span className="truncate">{role.name}</span>
                </span>
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
      <div className="flex min-h-0 flex-1 flex-col">
        {selectedRole ? (
          <div className="flex min-h-0 flex-1 flex-col gap-4">
            <div className="flex shrink-0 items-center justify-between">
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

            {/* Name, priority & color */}
            <div className="grid shrink-0 grid-cols-2 gap-3">
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

            {/* Color picker */}
            <div className="shrink-0">
              <label className="mb-1.5 block text-sm font-medium text-text-secondary">Color</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={editColor || '#6B7280'}
                  onChange={(e) => setEditColor(e.target.value)}
                  className="h-8 w-8 cursor-pointer rounded border border-border bg-transparent p-0"
                />
                <Input
                  value={editColor}
                  onChange={(e) => setEditColor(e.target.value)}
                  placeholder="#6B7280"
                  maxLength={7}
                  className="w-28"
                />
                {/* Preset colors */}
                <div className="flex items-center gap-1.5">
                  {[
                    { color: '#EF4444', label: 'Red' },
                    { color: '#F97316', label: 'Orange' },
                    { color: '#EAB308', label: 'Yellow' },
                    { color: '#22C55E', label: 'Green' },
                    { color: '#3B82F6', label: 'Blue' },
                    { color: '#8B5CF6', label: 'Purple' },
                    { color: '#6B7280', label: 'Gray' },
                  ].map((preset) => (
                    <button
                      key={preset.color}
                      onClick={() => setEditColor(preset.color)}
                      className="h-6 w-6 rounded-full border border-border transition-transform hover:scale-110"
                      style={{ backgroundColor: preset.color }}
                      title={preset.label}
                    />
                  ))}
                </div>
                {editColor && (
                  <button
                    onClick={() => setEditColor('')}
                    className="text-xs text-text-muted hover:text-text-secondary transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Permission grid */}
            <ScrollArea className="min-h-0 flex-1">
              <PermissionGrid
                bitset={editBitset}
                onChange={setEditBitset}
              />
            </ScrollArea>

            {/* Save button */}
            <div className="flex shrink-0 justify-end border-t border-border pt-3">
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
