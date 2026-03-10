/**
 * @module admin-console
 * Full-page administration center replacing the chat area when open.
 * Sidebar navigation routes to sub-panels: Overview, Members,
 * Bans, Roles, Invites, Audit Log, and Settings.
 *
 * Activated via the settings store (adminOpen / openAdmin / closeAdmin).
 * Also supports legacy trigger/controlled props for backward compatibility
 * (e.g. orbital view context menu) — those now just open via the store.
 */
'use client';

import { useEffect } from 'react';
import { useSettingsStore } from '../../stores/settings-store';
import { HubOverview } from './hub-overview';
import { MemberList } from './member-list';
import { BanList } from './ban-list';
import { RoleEditor } from './role-editor';
import { AuditLog } from '../hub/audit-log';
import { HubSettingsTab } from './hub-settings-tab';
import { InviteManager } from './invite-manager';

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------

const ADMIN_TABS = [
  { id: 'overview', label: 'Overview', icon: OverviewIcon },
  { id: 'members', label: 'Members', icon: MembersIcon },
  { id: 'bans', label: 'Bans', icon: BansIcon },
  { id: 'roles', label: 'Roles', icon: RolesIcon },
  { id: 'invites', label: 'Invites', icon: InvitesIcon },
  { id: 'audit', label: 'Audit Log', icon: AuditIcon },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
] as const;

// ---------------------------------------------------------------------------
// Tab icons
// ---------------------------------------------------------------------------

function OverviewIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <rect x="9" y="9" width="5" height="5" rx="1" />
    </svg>
  );
}

function MembersIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="5" r="2.5" />
      <path d="M1 14a5 5 0 0110 0" />
      <circle cx="12" cy="5" r="2" />
      <path d="M11 14a4 4 0 014-4" />
    </svg>
  );
}

function BansIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="6" />
      <path d="M4 4l8 8" />
    </svg>
  );
}

function RolesIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 1l2 3h3l-1 3 2 3h-3l-2 3-2-3H4l1-3-2-3h3l2-3z" />
    </svg>
  );
}

function InvitesIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 4v8M4 8h8" />
      <circle cx="8" cy="8" r="6" />
    </svg>
  );
}

function AuditIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3h10v10H3z" />
      <path d="M5 6h6M5 8h6M5 10h4" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Legacy props interface (backward compat for orbital view)
// ---------------------------------------------------------------------------

interface AdminConsoleProps {
  hubId: string;
  hubName: string;
  /** Trigger element — clicking it opens the admin console via the store. */
  trigger?: React.ReactNode;
  /** Controlled open state (optional — enables controlled mode). */
  open?: boolean;
  /** Controlled open change handler (optional). */
  onOpenChange?: (open: boolean) => void;
}

/**
 * AdminConsole — when used with a `trigger` prop, renders just the trigger
 * button that opens the full-page admin view via the store. When used with
 * controlled `open`/`onOpenChange`, syncs with the store.
 *
 * The actual full-page UI is rendered by <AdminConsoleView /> in app-shell.
 */
export function AdminConsole({
  hubId,
  hubName,
  trigger,
  open: controlledOpen,
  onOpenChange,
}: AdminConsoleProps) {
  const openAdmin = useSettingsStore((s) => s.openAdmin);
  const closeAdmin = useSettingsStore((s) => s.closeAdmin);
  const adminOpen = useSettingsStore((s) => s.adminOpen);

  // Sync controlled mode with the store
  useEffect(() => {
    if (controlledOpen !== undefined) {
      if (controlledOpen && !adminOpen) {
        openAdmin(hubId, hubName);
      } else if (!controlledOpen && adminOpen) {
        closeAdmin();
      }
    }
  }, [controlledOpen, adminOpen, hubId, hubName, openAdmin, closeAdmin]);

  // Sync store back to controlled parent
  useEffect(() => {
    if (onOpenChange && controlledOpen !== undefined) {
      if (adminOpen !== controlledOpen) {
        onOpenChange(adminOpen);
      }
    }
  }, [adminOpen, controlledOpen, onOpenChange]);

  if (trigger) {
    return (
      <span
        onClick={() => openAdmin(hubId, hubName)}
        className="cursor-pointer"
      >
        {trigger}
      </span>
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// Full-page admin console view (rendered in app-shell)
// ---------------------------------------------------------------------------

export function AdminConsoleView() {
  const adminTab = useSettingsStore((s) => s.adminTab);
  const setAdminTab = useSettingsStore((s) => s.setAdminTab);
  const closeAdmin = useSettingsStore((s) => s.closeAdmin);
  const hubId = useSettingsStore((s) => s.adminHubId);
  const hubName = useSettingsStore((s) => s.adminHubName);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') closeAdmin();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [closeAdmin]);

  if (!hubId || !hubName) return null;

  return (
    <div className="flex h-full flex-1">
      {/* Sidebar */}
      <div className="w-52 border-r border-white/5 bg-surface-1/30 backdrop-blur-sm p-4 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 className="display-text text-lg font-semibold text-text-primary truncate">{hubName}</h2>
        </div>
        <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/35 mb-2">Administration</p>
        <nav className="space-y-1 flex-1">
          {ADMIN_TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setAdminTab(tab.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                  adminTab === tab.id
                    ? 'bg-white/10 text-text-primary'
                    : 'text-text-muted hover:bg-white/5 hover:text-text-secondary'
                }`}
              >
                <Icon />
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* Close button at bottom */}
        <button
          onClick={closeAdmin}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-text-muted hover:bg-white/5 hover:text-text-secondary transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M12 4L4 12M4 4l8 8" />
          </svg>
          Close
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl">
          {adminTab === 'overview' && <HubOverview hubId={hubId} />}
          {adminTab === 'members' && <MemberList hubId={hubId} />}
          {adminTab === 'bans' && <BanList hubId={hubId} />}
          {adminTab === 'roles' && <RoleEditor hubId={hubId} />}
          {adminTab === 'invites' && <InviteManager hubId={hubId} />}
          {adminTab === 'audit' && <AuditLog hubId={hubId} />}
          {adminTab === 'settings' && <HubSettingsTab hubId={hubId} hubName={hubName} />}
        </div>
      </div>

      {/* Close X button in top-right */}
      <button
        onClick={closeAdmin}
        className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-md text-text-muted hover:bg-white/5 hover:text-text-primary transition-colors z-10"
        title="Close Admin"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M4 4l8 8M12 4l-8 8" />
        </svg>
      </button>
    </div>
  );
}
