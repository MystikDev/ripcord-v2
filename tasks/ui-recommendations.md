# Ripcord UI/UX Recommendations

Comprehensive review of the Ripcord desktop client UI. Recommendations are prioritized by user impact and organized into tiers: **Quick Wins** (high impact, low effort), **Medium Lifts** (high impact, moderate effort), and **Big Bets** (transformative, significant effort).

---

## TIER 1: Quick Wins

### 1. Empty States Need Personality
**Where:** Channel list, message area, member panel, cosmos view (0 hubs)
**Problem:** Empty channels show plain text like "No channels yet" — feels broken, not inviting.
**Recommendation:** Add illustrated empty states with the space theme. Example: a tiny astronaut floating with text like "It's quiet out here... Create a channel to start transmitting." Use the existing SVG illustration system from onboarding (`packages/ui/src/components/onboarding/illustrations/`) to create matching empty-state art. Each empty state should have a clear CTA button.

**Files:** `channel-sidebar.tsx:669`, `chat-area.tsx` (no messages state), `member-list-panel.tsx`

---

### 2. Online Presence Dot is Always Cyan
**Where:** `message-item.tsx:319`
**Problem:** Every user's avatar shows a hardcoded cyan "online" dot regardless of actual presence status. This is misleading.
**Recommendation:** Wire up the presence store to show actual status: green (online), yellow (idle), red (DND), or hidden (offline). The dot already exists — it just needs the data.

```
online  → bg-success (#34d399)
idle    → bg-warning (#fbbf24)
dnd     → bg-danger  (#f87171)
offline → hidden
```

**Files:** `message-item.tsx:319`, `member-list-panel.tsx`

---

### 3. Delete Confirmation Uses `window.confirm()`
**Where:** `message-item.tsx:165`, `appearance-settings.tsx:297`
**Problem:** Native browser dialogs break the immersive glass UI. They look jarring in a Tauri app.
**Recommendation:** Replace with a custom confirmation dialog using the existing `Dialog` component from `ui/dialog.tsx`. Glass-panel styled, with danger-colored confirm button. Two lines of copy: "Delete this message?" / "This can't be undone."

**Files:** `message-item.tsx:165`, `appearance-settings.tsx:297`

---

### 4. Keyboard Shortcut Discoverability
**Where:** Global
**Problem:** The app has `Cmd+K` for quick switcher but no visual hints anywhere. Power users won't discover shortcuts; new users feel lost.
**Recommendation:**
- Add subtle shortcut badges to key buttons (e.g., the search icon shows a tiny `⌘K` chip)
- Add a keyboard shortcut cheatsheet accessible via `?` or from settings
- Show shortcut hints in tooltips (some tooltips exist but don't include shortcuts)

**Files:** `quick-switcher.tsx`, `channel-sidebar.tsx`, `chat-area.tsx`

---

### 5. Scrollbar Too Thin on Windows
**Where:** `globals.css:73`
**Problem:** 4px scrollbar width works on macOS with overlay scrollbars but is nearly invisible on Windows where scrollbars are always visible. Windows is your primary platform.
**Recommendation:** Increase to 6-8px on Windows. Add a subtle track background so users can see the scrollable area. Keep the cyan tint.

```css
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: rgba(255, 255, 255, 0.02); border-radius: 3px; }
```

**Files:** `globals.css:73-76`

---

### 6. Message Timestamps are Cryptic
**Where:** `message-item.tsx:40-55`
**Problem:** `T-3H` and `T-2D` are thematic but confusing for most users. New users won't know what `T-` means.
**Recommendation:** Keep the space theme but make it readable. Show relative time on hover as a tooltip with the full datetime. Change the default format:
- Under 1 min: "just now"
- Under 1 hour: "12m ago"
- Today: "2:34 PM"
- Yesterday: "Yesterday 2:34 PM"
- Older: "Mar 8, 2:34 PM"

The `T-` format could be an opt-in "Space Mode" in appearance settings for theme purists.

**Files:** `message-item.tsx:40-55`

---

## TIER 2: Medium Lifts

### 7. Message List Virtualization
**Where:** `message-list.tsx`
**Problem:** Every message renders a full React component with Framer Motion. At 500+ messages, scrolling will lag badly. With 19 users actively chatting, this will hit soon.
**Recommendation:** Implement windowed rendering with `@tanstack/react-virtual`. Only render messages in the viewport + a buffer. This is the single biggest performance improvement possible.

**Files:** `message-list.tsx`

---

### 8. Unified Notification Center
**Where:** Global (currently scattered)
**Problem:** Unread counts exist on channels but there's no single place to see "what did I miss." Users have to scan every channel and hub manually.
**Recommendation:** Add a notification bell to the hub sidebar header that opens a popover showing:
- Unread mentions across all hubs/channels
- Friend requests
- Recent DMs
- Missed voice calls

This is the #1 feature Discord users expect and don't see.

**Files:** `server-sidebar.tsx`, new `notification-center.tsx`

---

### 9. Settings Page is Too Shallow
**Where:** `appearance-settings.tsx`
**Problem:** The settings panel only has appearance options. No account settings, no notification preferences, no keybind customization, no privacy controls. Users expect a full settings page.
**Recommendation:** Convert to a full settings view with sidebar navigation:
- **Account:** Handle, email, avatar, password change
- **Appearance:** Current options (font, color, compact mode)
- **Notifications:** Per-hub mute, DND schedule, sound toggles
- **Voice & Audio:** Input/output device, noise suppression, PTT keybind
- **Keybinds:** Customizable shortcuts
- **About:** Version, changelog, bug report

**Files:** `appearance-settings.tsx`, new `settings-view.tsx`

---

### 10. Chat Composer Needs Markdown Preview
**Where:** `message-composer.tsx`
**Problem:** Users can write markdown but have no way to preview it before sending. The context chips (Mention, Attach, Snippet) are nice but there's no way to see what the formatted output will look like.
**Recommendation:** Add a subtle preview toggle that shows the rendered markdown above the input when active. Use the existing `MessageContent` renderer so what-you-see matches what-you-get.

**Files:** `message-composer.tsx`, `message-content.tsx`

---

### 11. Hub Sidebar Needs Tooltips + Reordering
**Where:** `server-sidebar.tsx`
**Problem:** Hub icons are small colored circles with no labels. Users with 5+ hubs won't remember which icon is which. No way to reorder hubs.
**Recommendation:**
- Add tooltips on hover showing hub name (some may exist, verify consistency)
- Add drag-to-reorder (persist order to localStorage)
- Add a subtle unread indicator (magenta dot or count badge) on hub icons with unread messages

**Files:** `server-sidebar.tsx`

---

### 12. Voice Channel UX Polish
**Where:** `voice-panel.tsx`, `voice-controls.tsx`, channel-sidebar voice items
**Problem:** Double-click to join voice is not discoverable. No visual feedback when connecting. No "connecting..." state.
**Recommendation:**
- Add a visible "Join Voice" button on voice channel items (not just double-click)
- Add connecting/reconnecting states with a spinner
- Show voice quality indicator (latency is in the HUD but not in the sidebar)
- Add a "You're in voice" banner at the top of the channel sidebar when connected

**Files:** `channel-sidebar.tsx:98-283`, `voice-panel.tsx`

---

### 13. Cosmos View — Hub Discovery
**Where:** `cosmos-view.tsx`, `hub-nebula.tsx`
**Problem:** The cosmos view is beautiful but purely decorative after initial setup. Once you have your hubs, you just click through them.
**Recommendation:** Make it useful:
- Show live member counts on each nebula ("3 online")
- Show unread indicators on nebulae with activity
- Add a "Browse Public Hubs" or "Discover" section for hub discovery
- Quick-preview on hover: hub name, member count, last active

**Files:** `cosmos-view.tsx`, `hub-nebula.tsx`

---

## TIER 3: Big Bets

### 14. Threads / Reply System
**Where:** Chat system (new feature)
**Problem:** All messages are flat in a channel. As conversations grow, it's impossible to follow multiple topics. This is the #1 feature gap vs. Discord/Slack.
**Recommendation:** Add reply-to and thread support:
- Click "Reply" on a message to start a threaded reply
- Show replied-to context above the message (like Discord)
- Optional: Full thread sidebar view (like Slack)
- Server-side: Add `replyToId` field to messages table

**Files:** `message-item.tsx`, `message-composer.tsx`, `message-store.ts`, server routes

---

### 15. User Profiles & Status
**Where:** Global (new feature)
**Problem:** Users are just handles and avatars. No profile, no custom status, no bio, no "about me." This makes the app feel thin.
**Recommendation:** Add user profile cards:
- Click on any user avatar/name → profile popover
- Fields: avatar, handle, custom status ("Playing Starfield"), bio, member since
- "About Me" section with markdown support
- Activity status (what hub they're in, if in voice)
- Action buttons: Message, Add Friend, Block

**Files:** New `user-profile-card.tsx`, `user-context-menu.tsx` (enhance)

---

### 16. Onboarding Quick Tour Needs Work
**Where:** `onboarding-flow.tsx`, `quick-tour/`
**Problem:** The state machine is well-built but the tour has only 3 slides. Users still won't understand the spatial metaphor (cosmos = hub selector, solar system = voice visualization, orbits = channels).
**Recommendation:**
- Add interactive highlights that point to actual UI elements (like a spotlight tour)
- Include the spatial metaphor explanation: "Your hubs appear as nebulae. Click one to enter its solar system."
- Add a "first voice join" guided moment
- Make the tour replayable from settings (this exists but button doesn't actually trigger it)

**Files:** `quick-tour/quick-tour-overlay.tsx`, `onboarding-flow.tsx`

---

### 17. Responsive Admin Console
**Where:** `admin/admin-console.tsx`
**Problem:** The admin console is a modal overlay. With growing features (roles, permissions, members, bans, invites), it needs proper navigation and more space.
**Recommendation:** Convert to a full-page view (replaces chat area when open) with sidebar tab navigation instead of a modal. This gives each section room to breathe and allows future expansion (audit logs, analytics, moderation tools).

**Files:** `admin-console.tsx`, `hub-overview.tsx`, `member-list.tsx`, `role-editor.tsx`

---

## Design System Improvements

### 18. Consolidate Hardcoded Colors
**Problem:** Components use both CSS variables (`var(--color-accent)`) and hardcoded hex (`#00f0ff`). This makes theming impossible and creates maintenance burden.
**Recommendation:** Audit all components and replace hardcoded colors with CSS variable references. Create a lint rule or code convention to prevent new hardcoded values.

**Worst offenders:** `orbital-canvas.tsx`, `cosmos-canvas-bg.tsx`, `message-item.tsx`

---

### 19. Icon System Upgrade
**Problem:** Every component defines its own inline SVG icons (see `message-item.tsx:62-104` — 5 icon components). This leads to inconsistent sizing, stroke widths, and duplication.
**Recommendation:** Create a centralized `Icon` component or adopt a minimal icon library. Define a standard icon set with consistent 16x16/20x20 sizes and 1.5px stroke width. This also makes it easier to add icon animations later.

---

### 20. Typography Scale
**Problem:** Font sizes are defined ad-hoc: `text-[9px]`, `text-[10px]`, `text-[11px]`, `text-xs`, `text-sm`, `text-base`, plus CSS variable overrides. No consistent typographic scale.
**Recommendation:** Define a strict type scale in the theme:
```
caption:  10px  (labels, timestamps, badges)
body-sm:  12px  (secondary text, metadata)
body:     14px  (primary text, messages)
heading:  16px  (section headers)
title:    20px  (page titles)
display:  24px+ (hero text, onboarding)
```

---

## Priority Order for Implementation

If I were to implement these in order of impact-per-effort:

1. **#2** — Presence dots (quick, high polish)
2. **#3** — Custom confirm dialogs (quick, eliminates jank)
3. **#6** — Readable timestamps (quick, immediate UX win)
4. **#5** — Scrollbar fix (quick, Windows-specific)
5. **#1** — Empty states (medium, big feel improvement)
6. **#12** — Voice join UX (medium, removes confusion)
7. **#11** — Hub sidebar tooltips (medium, navigation clarity)
8. **#7** — Message virtualization (medium, performance)
9. **#8** — Notification center (medium, core feature gap)
10. **#14** — Threads/replies (large, competitive necessity)

---

*Generated from full codebase review on 2026-03-10*
