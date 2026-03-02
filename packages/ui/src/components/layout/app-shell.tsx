/**
 * @module app-shell
 * Three-column app chrome with ORBIT spatial design. Composes HubSidebar,
 * ChannelSidebar, ChatArea, and optionally MemberListPanel into the main
 * application layout with ambient background layers.
 *
 * When `systemViewActive` is true, the immersive solar system view replaces
 * the 3-column layout. The hub sidebar remains visible for navigation.
 */
'use client';

import { useEffect, useRef, useState } from 'react';
import { HubSidebar } from './server-sidebar';
import { ChannelSidebar } from './channel-sidebar';
import { ChatArea } from './chat-area';
import { MemberListPanel } from './member-list-panel';
import { SolarSystemView } from './solar-system-view';
import { IncomingCall } from '../voice/incoming-call';
import { DmCallPanel } from '../voice/dm-call-panel';
import { BugReportButton } from '../ui/bug-report-dialog';
import { useSettingsStore } from '../../stores/settings-store';
import { useHubStore } from '../../stores/server-store';
import { useThemeOverrides } from '../../hooks/use-theme-overrides';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AppShell() {
  const memberListVisible = useSettingsStore((s) => s.memberListVisible);
  const isDmView = useHubStore((s) => s.isDmView);
  const systemViewActive = useHubStore((s) => s.systemViewActive);
  const activeHubId = useHubStore((s) => s.activeHubId);
  useThemeOverrides();

  // Warp transition on hub switch
  const [warping, setWarping] = useState(false);
  const prevHubRef = useRef(activeHubId);

  useEffect(() => {
    if (prevHubRef.current && activeHubId && prevHubRef.current !== activeHubId) {
      setWarping(true);
      const t = setTimeout(() => setWarping(false), 600);
      return () => clearTimeout(t);
    }
    prevHubRef.current = activeHubId;
  }, [activeHubId]);

  const showSystemView = systemViewActive && !isDmView && !!activeHubId;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-void">
      {/* ORBIT ambient background layers — hidden during orbital view (it has its own canvas bg) */}
      {!showSystemView && (
        <>
          <div className="orbit-ambient" />
          <div className="orbit-grid" />
          <div className="orbit-scanline" />
        </>
      )}

      {/* Main layout — sits above ambient */}
      <div className="relative z-10 flex h-full w-full">
        {/* Left: hub icons (always visible for navigation) */}
        <HubSidebar />

        {showSystemView ? (
          /* Immersive solar system view */
          <SolarSystemView />
        ) : (
          /* Normal 3-column layout */
          <>
            {/* Middle: channel list */}
            <ChannelSidebar />

            {/* Center: chat area */}
            <ChatArea />

            {/* Right: member list panel (not shown in DM view) */}
            {memberListVisible && !isDmView && <MemberListPanel />}
          </>
        )}

        {/* Global overlays for DM calls */}
        <IncomingCall />
        <DmCallPanel />
      </div>

      {/* Warp transition overlay */}
      {warping && (
        <div className="fixed inset-0 z-50 warp-overlay" />
      )}

      {/* Floating bug report button (lower-right, above toasts) */}
      <BugReportButton />
    </div>
  );
}
