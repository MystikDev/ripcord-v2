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
    version: '0.9.22',
    date: '2026-02-27',
    highlights: [
      'Role colors — customizable hex colors for role badges with preset palette',
      'Fixed voice admin — drag-and-drop move, context menu move, and server mute now work correctly',
      'DM notification badges — unread message count shown on DM conversations',
      'Fixed auto-logout on update — app now reliably logs out after installing an update',
      'Screen share audio — system audio is now captured alongside screen share video',
      'Stream quality selector — choose between 720p, 1080p, or Source quality when viewing streams',
      'Stream FPS overlay — live framerate counter displayed on screen share views',
    ],
  },
  {
    version: '0.9.21',
    date: '2026-02-27',
    highlights: [
      'Role assignment UI — assign and remove roles from members in the admin panel',
    ],
  },
  {
    version: '0.9.20',
    date: '2026-02-27',
    highlights: [
      'Role editor scrollbar — roles list and permissions grid now scroll properly in hub settings',
      'Remember me fix — username and password are now saved and restored correctly',
    ],
  },
  {
    version: '0.9.19',
    date: '2026-02-27',
    highlights: [
      'Admin voice actions — move users between voice channels (drag-and-drop or right-click menu)',
      'Server mute — admins can mute participants in voice channels',
      'New permission toggles: Move Members and Mute Members in role settings',
    ],
  },
  {
    version: '0.9.18',
    date: '2026-02-27',
    highlights: [
      '"Remember me" checkbox on login — stay signed in across app restarts',
    ],
  },
  {
    version: '0.9.17',
    date: '2026-02-27',
    highlights: [
      'Fixed voice participants not appearing on first join — SUBSCRIBE race condition resolved',
      'Server auto-subscribes users to voice channel on join if subscription is still pending',
      'Client fetches voice states from REST as failsafe after joining voice',
    ],
  },
  {
    version: '0.9.16',
    date: '2026-02-27',
    highlights: [
      'Fixed voice channel participants not visible — gateway auth race condition resolved',
      'Gateway client now waits for AUTH_OK before subscribing to channels',
      'Server no longer kills connections on pre-auth SUBSCRIBE (defense-in-depth)',
      'Voice broadcasts exclude sender to prevent duplicate UI entries',
    ],
  },
  {
    version: '0.9.15',
    date: '2026-02-27',
    highlights: [
      'Markdown in messages — bold, italic, strikethrough, code blocks, blockquotes, and lists',
      'Quick Switcher (Ctrl+K / Cmd+K) — jump between hubs, channels, and DMs instantly',
      'Compact mode — toggle in Appearance settings for a denser message layout',
      'Message bookmarks — save important messages locally with the bookmark button',
      'Fixed user handles showing as truncated IDs in DM conversations',
      'Fixed voice channel participants not appearing in the sidebar',
    ],
  },
  {
    version: '0.9.13',
    date: '2026-02-26',
    highlights: [
      'Fixed voice audio — switched to single shared AudioContext for reliable remote audio playback',
    ],
  },
  {
    version: '0.9.12',
    date: '2026-02-26',
    highlights: [
      'Right-click hub icons to access a context menu with Leave Hub and Copy Hub ID',
      'Hub banners — upload a banner image in Hub Settings, displayed below the hub name',
      'Removed 128px minimum size requirement for hub icon uploads',
    ],
  },
  {
    version: '0.9.11',
    date: '2026-02-26',
    highlights: [
      'Fixed per-user volume control with a custom Web Audio renderer',
      'Replaced LiveKit RoomAudioRenderer with VoiceAudioRenderer for reliable volume/boost/deafen',
    ],
  },
  {
    version: '0.9.10',
    date: '2026-02-26',
    highlights: [
      'Event-driven push-to-talk on Windows using WH_KEYBOARD_LL hook — zero-latency background PTT',
      'PTT hook is the same mechanism Discord uses (system-wide, does not consume the key)',
      'Volume control rewrite — GainNode-based per-user volume with boost up to 400%',
    ],
  },
  {
    version: '0.9.9',
    date: '2026-02-26',
    highlights: [
      'Background push-to-talk on Windows via GetAsyncKeyState polling',
      'PTT works even when Ripcord is not focused',
    ],
  },
  {
    version: '0.9.8',
    date: '2026-02-26',
    highlights: [
      'Independent chat text color setting in Appearance',
      'Chat text color is now separate from username color',
    ],
  },
  {
    version: '0.9.7',
    date: '2026-02-26',
    highlights: [
      'Background push-to-talk via Tauri global shortcuts (macOS/Linux)',
      'PTT key works when the app is not focused',
    ],
  },
  {
    version: '0.9.6',
    date: '2026-02-26',
    highlights: [
      'Fixed unnecessary disconnect/reconnect when switching voice channels',
    ],
  },
  {
    version: '0.9.5',
    date: '2026-02-26',
    highlights: [
      'Global appearance settings — icon size, username color, and font scaling',
    ],
  },
  {
    version: '0.9.4',
    date: '2026-02-26',
    highlights: [
      'Auto-generated release notes from git commits',
    ],
  },
  {
    version: '0.9.3',
    date: '2026-02-26',
    highlights: [
      'Version consolidation and stability improvements',
    ],
  },
  {
    version: '0.9.1',
    date: '2026-02-26',
    highlights: [
      'Fixed voice channel participants not visible to other users',
      'Fixed presence status flickering during token refresh',
      'Adjusted voice participant icon and username sizing',
    ],
  },
  {
    version: '0.9.0',
    date: '2026-02-26',
    highlights: [
      'Password reset via email — forgot password flow with Resend email service',
      'Email verification for new account registrations',
    ],
  },
  {
    version: '0.8.9',
    date: '2026-02-26',
    highlights: [
      'DM video calls — start a video call from any DM conversation with the camera button',
      'Camera toggle — turn your camera on/off mid-call with the camera button in the call panel',
      'Draggable call panel — grab the handle bar and move the call panel anywhere on screen',
      'Incoming call overlay now distinguishes video vs audio calls',
      'New Ripcord "R" app icon with red background',
    ],
  },
  {
    version: '0.8.8',
    date: '2026-02-26',
    highlights: [
      'Direct messages — click the home button or right-click any user to start a DM conversation',
      'DM voice calls — call friends directly from a DM with one-click audio calls',
      'Pin messages — right-click any message to pin it, view all pins from the channel header',
      'Right-click context menu on usernames with quick actions (DM, copy ID)',
      'Font size and color customization in Appearance settings',
      'New Ripcord "R" app icon',
      'Fixed voice speaking indicator alignment',
      'Fixed upload icon misalignment with text input',
      'Fixed registration allowing spaces in usernames',
      'Fixed volume control at 0% and 400% extremes',
      'Fixed channel creation dropping users from voice visually',
    ],
  },
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
