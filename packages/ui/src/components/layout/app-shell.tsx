'use client';

import { HubSidebar } from './server-sidebar';
import { ChannelSidebar } from './channel-sidebar';
import { ChatArea } from './chat-area';
import { MemberListPanel } from './member-list-panel';
import { useSettingsStore } from '../../stores/settings-store';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AppShell() {
  const memberListVisible = useSettingsStore((s) => s.memberListVisible);

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      {/* Left: hub icons */}
      <HubSidebar />

      {/* Middle: channel list */}
      <ChannelSidebar />

      {/* Center: chat area */}
      <ChatArea />

      {/* Right: member list panel */}
      {memberListVisible && <MemberListPanel />}
    </div>
  );
}
