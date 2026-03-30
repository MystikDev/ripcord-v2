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
import { CosmosView } from './cosmos-view';
import { IncomingCall } from '../voice/incoming-call';
import { DmCallPanel } from '../voice/dm-call-panel';
import { VoicePanel } from '../voice/voice-panel';
import { BugReportButton } from '../ui/bug-report-dialog';
import { ToastContainer } from '../ui/toast';
import { KeyboardShortcutsDialog } from '../ui/keyboard-shortcuts-dialog';
import { SettingsView } from '../settings/settings-view';
import { AdminConsoleView } from '../admin/admin-console';
import { useSettingsStore } from '../../stores/settings-store';
import { useHubStore } from '../../stores/server-store';
import { useThemeOverrides } from '../../hooks/use-theme-overrides';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AppShell() {
  const memberListVisible = useSettingsStore((s) => s.memberListVisible);
  const settingsOpen = useSettingsStore((s) => s.settingsOpen);
  const adminOpen = useSettingsStore((s) => s.adminOpen);
  const layoutMode = useSettingsStore((s) => s.layoutMode);
  const isDmView = useHubStore((s) => s.isDmView);
  const systemViewActive = useHubStore((s) => s.systemViewActive);
  const activeHubId = useHubStore((s) => s.activeHubId);
  useThemeOverrides();

  const isClassic = layoutMode === 'classic';

  // Warp transition on hub switch (disabled in classic mode)
  const [warping, setWarping] = useState(false);
  const prevHubRef = useRef(activeHubId);

  useEffect(() => {
    if (isClassic) return;
    if (prevHubRef.current && activeHubId && prevHubRef.current !== activeHubId) {
      setWarping(true);
      const t = setTimeout(() => setWarping(false), 600);
      return () => clearTimeout(t);
    }
    prevHubRef.current = activeHubId;
  }, [activeHubId, isClassic]);

  const showSystemView = !isClassic && systemViewActive && !isDmView && !!activeHubId;
  const showCosmosView = !isClassic && !activeHubId && !isDmView;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-void">
      {/* ORBIT ambient background layers — hidden during orbital/cosmos view and classic mode */}
      {!isClassic && !showSystemView && !showCosmosView && (
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
          /* Immersive orbital view for the active hub */
          <>
            <SolarSystemView />
            {/* VoicePanel must stay mounted for voice connection logic
                (pendingVoiceJoin). Normally lives in ChannelSidebar which
                is unmounted during orbital view. Hidden since the orbital
                HUD provides its own voice controls. */}
            <div className="hidden">
              <VoicePanel />
            </div>
          </>
        ) : showCosmosView ? (
          /* Cosmos landing — all hubs as nebulae */
          <CosmosView />
        ) : (
          /* Normal 3-column layout */
          <>
            {/* Middle: channel list */}
            <ChannelSidebar />

            {/* Center: chat area, settings view, or admin console */}
            {settingsOpen ? (
              <SettingsView />
            ) : adminOpen ? (
              <AdminConsoleView />
            ) : (
              <>
                <ChatArea />
                {/* Right: member list panel (not shown in DM view) */}
                {memberListVisible && !isDmView && <MemberListPanel />}
              </>
            )}
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

      {/* Floating bug report button (lower-right, above toasts).
          Hidden in orbital / cosmos views — the HUD has its own inline bug icon. */}
      {!showSystemView && !showCosmosView && <BugReportButton />}

      {/* Imperative toast container — renders showToast() calls from anywhere in
          the app, including stores and non-React contexts. z-[500] sits above all
          other overlays. Always mounted so toasts fire regardless of view mode. */}
      <ToastContainer />
      <KeyboardShortcutsDialog />
    </div>
  );
}
