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
