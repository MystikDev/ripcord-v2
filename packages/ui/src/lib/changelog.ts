/**
 * @module changelog
 * Version-keyed release notes displayed in the What's New dialog.
 * Add entries here each release — newest first.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChangelogEntry {
  version: string;
  date: string;
  highlights: string[];
}

// ---------------------------------------------------------------------------
// Data (newest first)
// ---------------------------------------------------------------------------

export const changelog: ChangelogEntry[] = [
  {
    version: '0.8.7',
    date: '2026-02-25',
    highlights: [
      'Multi-stream screen share — switch between simultaneous streams with tab switcher',
      'Click blue streaming icon in sidebar to jump to that user\'s stream',
      'Hover streaming icon for a live preview popover of their screen',
      'Persistent Stop Sharing button visible even when viewing another stream',
    ],
  },
  {
    version: '0.8.6',
    date: '2026-02-25',
    highlights: [
      'Fixed auto-updater failing to check for updates (GitHub was rejecting requests without User-Agent)',
      'Fixed invite codes failing with "Content-Type must be application/json"',
    ],
  },
  {
    version: '0.8.4',
    date: '2026-02-25',
    highlights: [
      'Fixed member list showing all users as offline — presence now hydrated from REST on hub load',
      'Added /v1/hubs/:hubId/presence endpoint for bulk presence lookups via Redis pipeline',
      'Presence re-hydrated automatically on gateway reconnect',
    ],
  },
  {
    version: '0.8.3',
    date: '2026-02-25',
    highlights: [
      'Fixed users disappearing from voice channels when switching or rejoining',
      'Voice state hydration now fully replaces stale data instead of merging',
      'Gateway reconnect automatically re-subscribes channels and refreshes voice states',
      'Speaking indicator is now truly instantaneous — zero CSS transition delay',
      'Member list now separates online and offline users with brighter text for online members',
    ],
  },
  {
    version: '0.8.2',
    date: '2026-02-25',
    highlights: [
      'Discord-style link previews — URLs in chat now show rich embed cards with title, description, and image',
      'Fixed Tauri HTTP plugin scope so link metadata fetching works for all HTTPS sites',
    ],
  },
  {
    version: '0.8.1',
    date: '2026-02-25',
    highlights: [
      'Mic mute & deafen buttons now sit to the right of your username',
      'Added "What\'s New" dialog to surface update notes after login',
      'Speaking indicators are now instantaneous (zero render-cycle delay)',
      'Mute/deafen icons in the voice participant list sync immediately',
      'App now forces logout on close — next launch always shows the login screen',
      'Update relaunch clears session so the updated app opens to login',
    ],
  },
  {
    version: '0.8.0',
    date: '2026-02-24',
    highlights: [
      'Moved mic mute & deafen controls to the user panel (Discord-style)',
      'Push-to-talk, screen share, and audio settings remain in the voice bar',
    ],
  },
  {
    version: '0.7.9',
    date: '2026-02-23',
    highlights: [
      'Fixed invite codes — copies the raw code instead of a broken localhost URL',
    ],
  },
  {
    version: '0.7.8',
    date: '2026-02-22',
    highlights: [
      'Voice join/leave notification sounds',
      'Per-user volume sliders in the member list',
    ],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Look up the changelog entry for a specific version. */
export function getChangelogForVersion(version: string): ChangelogEntry | undefined {
  return changelog.find((entry) => entry.version === version);
}
