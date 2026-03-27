# Ripcord v2 — Task Tracker

## Completed — Security Hardening (v0.3.0)
- [x] Enable CSP in tauri.conf.json (was `null`)
- [x] Fix open redirect in all 4 auth pages (login/register)
- [x] Add WebSocket maxPayload limit (64KB)
- [x] Add CSRF protection via Content-Type enforcement (auth + API services)
- [x] Add WebAuthn counter validation (cloned authenticator detection)
- [x] Move docker-compose secrets to env var substitution
- [x] Remove access token from localStorage persistence (memory-only)
- [x] Add magic bytes validation on server-side image uploads
- [x] Add subscription array size limit (200) on gateway

## Completed — Update Checker Fix (v0.3.1)
- [x] Poll for updates every 30 minutes (was once at startup only)
- [x] Add 15-second timeout per update check
- [x] Send system notification via tauri-plugin-notification when update ready
- [x] Re-show banner if user dismissed and new update downloads
- [x] Stop polling once update is found and installed

## Completed — Link Previews + Text Document Icons (v0.7.2)
- [x] Install `tauri-plugin-http` (Rust crate + npm + capability)
- [x] Create `url-utils.ts` — URL detection + text segmentation
- [x] Create `link-metadata.ts` — client-side OG metadata fetcher with cache
- [x] Create `message-content.tsx` — linkified text with clickable URLs
- [x] Create `link-preview.tsx` — inline OG preview card (title, description, thumbnail)
- [x] Wire `MessageContent` + `LinkPreview` into `message-item.tsx`
- [x] Add text document icon to `attachment-preview.tsx` (text/plain, JSON, CSV, etc.)
- [x] TypeScript typecheck passes

## Completed — UX Fixes (v0.7.4)
- [x] Replace voice disconnect icon with bold hang-up phone + solid red button
- [x] Add drag-and-drop file upload to chat area (with visual drop overlay)
- [x] Fix X button to close app instead of minimizing to tray

## Completed — Voice Deafen (v0.7.5)
- [x] Add `isDeafened` state + `toggleDeafen` action to settings store (persisted)
- [x] Add deafen button (headphone icon) to voice controls bar
- [x] Send gateway `selfDeaf` update (opcode 23) so other users see deafen icon
- [x] Create `use-deafen-remote-audio.ts` hook — mutes all remote audio tracks
- [x] Wire hook into voice panel alongside existing volume/noise hooks
- [x] TypeScript typecheck passes

## Completed — iMessage Typing Bubbles (v0.7.7)
- [x] Add `@keyframes typing-dot` pulse animation to globals.css
- [x] Create `typing-bubble.tsx` — iMessage-style speech bubble with avatar + pulsing dots
- [x] Refactor `typing-indicator.tsx` — AnimatePresence with per-user bubbles, self-filtering
- [x] TypeScript typecheck passes

## Ripcord Engine — Implementation Plan

**Spec:** `docs/superpowers/specs/2026-03-27-ripcord-engine-design.md`
**Approach:** Raw Win32 + WebView2, Rust, Windows-only

### Phase 1: Skeleton — Window + WebView2 + IPC (Foundation)
_Goal: Rust exe opens Win32 window, embeds WebView2, loads Vite dev server, JSON-RPC IPC works._

- [ ] 1.1 Scaffold `apps/engine/` Cargo workspace with crates: `engine-core`, `engine-webview`, `engine-window`, `engine-ipc`
- [ ] 1.2 `engine-window`: borderless Win32 window, message pump, `WM_NCHITTEST` drag/resize, DPI scaling
- [ ] 1.3 `engine-webview`: embed WebView2 via `webview2-com`, attach to HWND, load `http://localhost:1420`
- [ ] 1.4 `engine-ipc`: JSON-RPC 2.0 dispatcher — `WebMessageReceived` → route → `ExecuteScript` response
- [ ] 1.5 `engine-ipc`: TypeScript client — `engine.invoke()` via `window.chrome.webview.postMessage`
- [ ] 1.6 `engine-core`: orchestrator — starts window, embeds webview, registers IPC, runs message pump
- [ ] 1.7 Wire `system.*` IPC: `getVersion`, `minimize`, `maximize`, `close`
- [ ] 1.8 Add `pnpm run dev:engine`, verify React app loads with IPC round-trip
- [ ] 1.9 Verify idle RAM under 50MB

### Phase 2: Window Manager — Tray, PiP, Overlay

- [ ] 2.1 System tray: `Shell_NotifyIconW` + context menu
- [ ] 2.2 Minimize-to-tray + restore on click
- [ ] 2.3 Win11 snap layout support
- [ ] 2.4 PiP window: second HWND, `WS_EX_TOPMOST`, resizable, draggable
- [ ] 2.5 Overlay window: transparent, click-through (`WS_EX_LAYERED | WS_EX_TRANSPARENT`)
- [ ] 2.6 Wire `window.*` IPC: `setPiP`, `setOverlay`, `setTrayTooltip`
- [ ] 2.7 Multi-monitor DPI verification

### Phase 3: Audio Engine — WASAPI + Noise Suppression

- [ ] 3.1 Scaffold `engine-audio`. WASAPI shared-mode capture: enumerate devices, open stream, ring buffer
- [ ] 3.2 WASAPI playback: output device selection
- [ ] 3.3 Audio processing thread: high-priority, 10ms blocks, lock-free buffers
- [ ] 3.4 Vendor RNNoise C source, compile via `cc` in `build.rs`
- [ ] 3.5 RNNoise FFI: process 48kHz mono frames, toggle via IPC
- [ ] 3.6 Mixer: sum mic + optional sources, per-source gain, stereo output
- [ ] 3.7 Output limiter
- [ ] 3.8 Wire `audio.*` IPC: `listDevices`, `setDevice`, `setSuppression`, `setGain`, `getLevel`
- [ ] 3.9 Verify mic → RNNoise → output with background noise test

### Phase 4: VST3 Plugin Hosting

- [ ] 4.1 Vendor VST3 SDK headers
- [ ] 4.2 VST3 loader: scan bundles, instantiate `IComponent` + `IAudioProcessor`
- [ ] 4.3 Plugin slot system: N slots between RNNoise and mixer
- [ ] 4.4 In-place processing on audio thread, zero-alloc
- [ ] 4.5 Hot-swap with crossfade
- [ ] 4.6 Per-slot bypass toggle
- [ ] 4.7 Parameter enumeration + get/set via IPC
- [ ] 4.8 Wire `audio.loadVST`, `unloadVST`, `setVSTParam`
- [ ] 4.9 Verify with real VST3 plugin (e.g. free EQ)

### Phase 5: Screen Capture — DXGI + Hardware Encoding

- [ ] 5.1 Scaffold `engine-capture`. DXGI Desktop Duplication: `ID3D11Texture2D` frames
- [ ] 5.2 Source enumeration: monitors + windows with thumbnails
- [ ] 5.3 Window capture by HWND
- [ ] 5.4 Mouse cursor compositing
- [ ] 5.5 Dirty-rect tracking
- [ ] 5.6 GPU vendor detection (NVENC/AMF/QSV)
- [ ] 5.7 NVENC encoder: FFI, GPU texture → H.264/H.265 NAL units
- [ ] 5.8 AMF encoder path
- [ ] 5.9 Quick Sync encoder path
- [ ] 5.10 x264 CPU fallback
- [ ] 5.11 Preset profiles: `4k-quality`, `1080-performance`, `adaptive`
- [ ] 5.12 Wire `capture.*` IPC: `listSources`, `start`, `stop`, `setProfile`, `getStats`
- [ ] 5.13 Verify 4K capture + NVENC encode

### Phase 6: Screen Share Transport — WebRTC-lite

- [ ] 6.1 Integrate `str0m` for ICE + DTLS-SRTP + RTP/RTCP
- [ ] 6.2 RTP packetizer
- [ ] 6.3 Gateway signaling opcodes: `SCREEN_OFFER/ANSWER/ICE/STOP`
- [ ] 6.4 SDP exchange + ICE trickle through gateway
- [ ] 6.5 P2P UDP connection
- [ ] 6.6 TURN relay fallback
- [ ] 6.7 Bandwidth estimation (REMB) + adaptive quality
- [ ] 6.8 Receiving: RTP depacketizer → MediaFoundation HW decoder
- [ ] 6.9 Wire decoded frames to compositor
- [ ] 6.10 Verify end-to-end: capture → encode → transport → decode → display

### Phase 7: Compositor — DirectComposition + D3D11

- [ ] 7.1 Scaffold `engine-compositor`. Init `ID3D11Device` + `IDCompositionDevice`
- [ ] 7.2 DComp visual tree layered on WebView2 HWND
- [ ] 7.3 Screen share surface in PiP / main view
- [ ] 7.4 VU meter surface (shader, 60fps)
- [ ] 7.5 Call overlay HUD
- [ ] 7.6 Vsync-aligned presentation
- [ ] 7.7 Wire `compositor.attachSurface`
- [ ] 7.8 Verify: screen share in PiP + VU meters in overlay

### Phase 8: Integration + Frontend Migration

- [ ] 8.1 Create `packages/engine-types` — shared IPC schema, codegen TS + Rust
- [ ] 8.2 Replace Tauri `invoke()` calls with `engine.invoke()`
- [ ] 8.3 Replace `@tauri-apps/plugin-*` imports with engine IPC
- [ ] 8.4 Port PTT hook from current `lib.rs` to `engine-window`
- [ ] 8.5 Port auto-updater (HTTP check + download)
- [ ] 8.6 Remove Tauri dependencies from `apps/desktop/package.json`
- [ ] 8.7 Production bundling: `ripcord-engine.exe` + `dist/` + `WebView2Loader.dll` → installer
- [ ] 8.8 Verify full lifecycle: launch → login → chat → voice → screen share → update → quit
- [ ] 8.9 Memory profiling: confirm under 50MB idle

---

## Backlog — Security (Future Sprints)
- [ ] Encrypt AI API keys in localStorage (or proxy through backend)
- [ ] Add token blacklist on logout (Redis-based)
- [ ] Increase password minimum from 8 to 12 chars
- [ ] Add per-account rate limiting (not just per-IP)
- [ ] Add rate limiting to moderation endpoints (kick/ban/invite)
- [ ] Tighten production CSP (remove `http:` from connect-src, `data:` from img-src)
- [ ] Add cargo-deny to CI for Rust dependency CVE auditing
