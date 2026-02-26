/**
 * @module app-shell
 * Three-column app chrome. Composes HubSidebar, ChannelSidebar, ChatArea,
 * and optionally MemberListPanel into the main application layout.
 */
'use client';

import { HubSidebar } from './server-sidebar';
import { ChannelSidebar } from './channel-sidebar';
import { ChatArea } from './chat-area';
import { MemberListPanel } from './member-list-panel';
import { IncomingCall } from '../voice/incoming-call';
import { DmCallPanel } from '../voice/dm-call-panel';
import { useSettingsStore } from '../../stores/settings-store';
import { useHubStore } from '../../stores/server-store';
import { useThemeOverrides } from '../../hooks/use-theme-overrides';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AppShell() {
  const memberListVisible = useSettingsStore((s) => s.memberListVisible);
  const isDmView = useHubStore((s) => s.isDmView);
  useThemeOverrides();

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      {/* Left: hub icons */}
      <HubSidebar />

      {/* Middle: channel list */}
      <ChannelSidebar />

      {/* Center: chat area */}
      <ChatArea />

      {/* Right: member list panel (not shown in DM view) */}
      {memberListVisible && !isDmView && <MemberListPanel />}

      {/* Global overlays for DM calls */}
      <IncomingCall />
      <DmCallPanel />
    </div>
  );
}
