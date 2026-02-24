/**
 * @module permission-grid
 * Toggle-switch grid for editing a role's permission bitset, grouped into
 * General, Text, Voice, and Admin categories. The Administrator bit
 * implicitly enables all other permissions.
 */
'use client';

import { useMemo } from 'react';

// ---------------------------------------------------------------------------
// Permission definitions grouped by category
// ---------------------------------------------------------------------------

interface PermDef {
  name: string;
  bit: number;
  description: string;
}

const PERMISSION_GROUPS: { label: string; perms: PermDef[] }[] = [
  {
    label: 'General',
    perms: [
      { name: 'View Channels', bit: 1 << 0, description: 'View channels and read message history' },
      { name: 'Manage Channels', bit: 1 << 3, description: 'Create, edit, or delete channels' },
      { name: 'Manage Hub', bit: 1 << 5, description: 'Edit hub name, icon, and settings' },
    ],
  },
  {
    label: 'Text',
    perms: [
      { name: 'Send Messages', bit: 1 << 1, description: 'Send messages in text channels' },
      { name: 'Manage Messages', bit: 1 << 2, description: 'Delete or pin messages by others' },
      { name: 'Attach Files', bit: 1 << 11, description: 'Upload file attachments' },
    ],
  },
  {
    label: 'Voice',
    perms: [
      { name: 'Connect Voice', bit: 1 << 8, description: 'Connect to voice channels' },
      { name: 'Speak Voice', bit: 1 << 9, description: 'Speak in voice channels' },
      { name: 'Stream Video', bit: 1 << 10, description: 'Screen-share in voice channels' },
    ],
  },
  {
    label: 'Admin',
    perms: [
      { name: 'Manage Roles', bit: 1 << 4, description: 'Create, edit, or delete roles' },
      { name: 'Kick Members', bit: 1 << 6, description: 'Remove members from the hub' },
      { name: 'Ban Members', bit: 1 << 7, description: 'Permanently ban members' },
      { name: 'Administrator', bit: (1 << 31) >>> 0, description: 'Bypasses ALL permission checks' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface PermissionGridProps {
  bitset: number;
  onChange: (newBitset: number) => void;
  disabled?: boolean;
}

export function PermissionGrid({ bitset, onChange, disabled }: PermissionGridProps) {
  const isAdmin = useMemo(() => (bitset & ((1 << 31) >>> 0)) !== 0, [bitset]);

  const toggle = (bit: number) => {
    if (disabled) return;
    if ((bitset & bit) !== 0) {
      onChange(bitset & ~bit);
    } else {
      onChange(bitset | bit);
    }
  };

  return (
    <div className="space-y-4">
      {PERMISSION_GROUPS.map((group) => (
        <div key={group.label}>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
            {group.label}
          </h4>
          <div className="space-y-1">
            {group.perms.map((perm) => {
              const isSet = (bitset & perm.bit) !== 0;
              const isImplied = isAdmin && perm.bit !== ((1 << 31) >>> 0);

              return (
                <label
                  key={perm.bit}
                  className={`flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 transition-colors ${
                    disabled
                      ? 'cursor-not-allowed opacity-50'
                      : 'hover:bg-surface-2/50'
                  }`}
                >
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isSet || isImplied}
                    disabled={disabled}
                    onClick={() => toggle(perm.bit)}
                    className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                      isSet
                        ? 'bg-accent'
                        : isImplied
                        ? 'bg-accent/40'
                        : 'bg-surface-3'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                        isSet || isImplied ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary">{perm.name}</p>
                    <p className="text-xs text-text-muted">{perm.description}</p>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
