# Ripcord Engine — Design Spec

**Date:** 2026-03-27
**Status:** Approved
**Approach:** Raw Win32 + WebView2 (no Tauri, no framework)

## Overview

Ripcord Engine is a purpose-built Windows-only native runtime in Rust that replaces Tauri 2 as the desktop shell for Ripcord. It embeds the existing React/Vite frontend via WebView2 while providing native superpowers: VST3 mic processing, ML noise suppression, full 4K screen share pipeline, hardware video decode, custom window management, GPU compositing, and low-latency audio mixing.

**Goals:**
- Under 50MB idle RAM
- Zero framework bloat — every line of code serves Ripcord
- Frontend dev experience unchanged (Vite HMR, same React code)

**Platform:** Windows only (Win10 1903+, Win11)

## Architecture

Six independent native modules coordinated by a thin orchestrator:

```
┌─────────────────────────────────────────────────┐
│                 Ripcord Engine                   │
│                                                  │
│  ┌───────────┐  ┌───────────┐  ┌──────────────┐ │
│  │  Webview   │  │  Window   │  │     IPC      │ │
│  │  Shell     │  │  Manager  │  │    Bridge    │ │
│  │ (WebView2) │  │ (Win32)   │  │  (JSON-RPC)  │ │
│  └─────┬─────┘  └─────┬─────┘  └──────┬───────┘ │
│        │               │               │         │
│  ┌─────┴───────────────┴───────────────┴───────┐ │
│  │              Orchestrator                    │ │
│  │         (message pump + lifecycle)           │ │
│  └─────┬───────────┬──────────────┬────────────┘ │
│        │           │              │               │
│  ┌─────┴─────┐ ┌──┴───────┐ ┌───┴────────────┐  │
│  │   Audio   │ │  Capture  │ │   Compositor   │  │
│  │  Engine   │ │  Pipeline │ │  (DComp/D3D)   │  │
│  │           │ │           │ │                │  │
│  │ • WASAPI  │ │ • DXGI DD │ │ • GPU overlay  │  │
│  │ • VST3    │ │ • NVENC   │ │ • PiP windows  │  │
│  │ • RNNoise │ │ • WebRTC  │ │ • Native HUD   │  │
│  │ • Mixer   │ │ • HW Dec  │ │                │  │
│  └───────────┘ └──────────┘ └────────────────┘  │
└─────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────┐
│          Existing React Frontend                 │
│     (packages/ui + apps/desktop/src)             │
└─────────────────────────────────────────────────┘
```

**Key principles:**
- Each module owns its own thread(s), communicates via channels (`crossbeam` or `tokio::mpsc`)
- Orchestrator runs the Win32 message pump on the main thread
- No module depends on another directly — all communication through the orchestrator

## Module 1: Webview Shell + IPC Bridge

### Webview Shell
- Direct WebView2 embedding via `webview2-com` crate (thin COM bindings)
- Creates `CoreWebView2` instance attached to the main HWND
- Dev: loads Vite dev server (`http://localhost:1420`)
- Prod: loads bundled `dist/` files via virtual host mapping
- CSP and security settings configured programmatically

### IPC Bridge
Replaces Tauri's `invoke` with purpose-built JSON-RPC 2.0:

- **Frontend → Rust:** `window.postMessage` intercepted by WebView2's `WebMessageReceived`. Messages are `{ method, params, id }`.
- **Rust → Frontend:** `ExecuteScript` calls to resolve/reject promises or push events.
- **Type safety:** Shared schema generates both the Rust dispatch table and a TypeScript client (`engine.invoke(...)` with full autocomplete).
- **Namespaced commands:**
  - `audio.*` — mic, VST, suppression, mixer
  - `capture.*` — screen share start/stop, settings
  - `window.*` — PiP, overlay, snap
  - `compositor.*` — GPU layer management
  - `system.*` — lifecycle, updates, tray

### Dropped from Tauri
- Generic plugin system
- Cross-platform abstractions
- CLI scaffolding / bundler
- Permissions/capability system

## Module 2: Audio Engine

Dedicated high-priority thread with real-time processing pipeline:

```
Mic Input (WASAPI) → Input Buffer (ring, lock-free)
    → 1. Noise Suppression (RNNoise, ML)
    → 2. VST3 Plugin Slots (0..N, hot-swappable)
    → 3. Mixer (mic + system audio, per-source gain)
    → 4. Output Limiter
    → To LiveKit (voice) or Capture Pipeline (screen share audio)
```

### Implementation Details
- **WASAPI** shared mode default, exclusive mode opt-in for lowest latency
- **RNNoise** compiled as static C lib via FFI. 48kHz mono, ~3% CPU
- **VST3 hosting** via `vst3-sys` crate:
  - Loads `.vst3` bundles, creates `IComponent` + `IAudioProcessor`
  - Negotiates sample rate/block size on load
  - Processes in-place on audio thread (no allocation, no locks)
  - Crossfade on swap for glitch-free changes
- **Lock-free ring buffers** (`ringbuf` crate) between WASAPI callback and processing thread
- **Mixer** sums sources with per-channel gain, outputs stereo interleaved PCM

### IPC Commands
- `audio.listDevices` → input/output device enumeration
- `audio.setDevice { input, output }`
- `audio.setSuppression { enabled, level }`
- `audio.loadVST { slot, path }` / `audio.unloadVST { slot }`
- `audio.setVSTParam { slot, paramId, value }`
- `audio.setGain { source, level }`
- `audio.getLevel` → current RMS/peak for VU meters

## Module 3: Capture Pipeline (4K Screen Share)

Full native pipeline — capture, encode, transport. No LiveKit for screen share.

### Capture — DXGI Desktop Duplication API
- Acquires frames as `ID3D11Texture2D` on GPU — zero CPU readback
- Full screen, single window, or region capture
- Mouse cursor composited in hardware
- Dirty-rect tracking for bandwidth savings at 4K

### Encoding — Hardware First, CPU Fallback
- GPU vendor detection at startup:
  - **NVIDIA** → NVENC via `nvEncodeAPI`
  - **AMD** → AMF
  - **Intel** → Quick Sync via Media Foundation
  - **Fallback** → x264 CPU encoder
- Encoder receives GPU textures directly (NV12) — no CPU copy in happy path
- Preset profiles:
  - `4k-quality`: 3840×2160@30fps, 8-12 Mbps, H.265
  - `1080-performance`: 1920×1080@60fps, 4-6 Mbps, H.264
  - `adaptive`: starts 1080p, scales up if bandwidth allows
- Keyframe interval: 2 seconds

### Transport — Custom WebRTC-lite
- Purpose-built for screen share, not a full WebRTC stack:
  - ICE for NAT traversal (via `str0m` crate — pure Rust)
  - DTLS-SRTP for encryption
  - RTP framing, RTCP feedback (PLI, REMB bandwidth estimation)
- **Signaling** reuses existing Gateway WebSocket — new opcodes:
  - `SCREEN_OFFER` / `SCREEN_ANSWER` (SDP exchange)
  - `SCREEN_ICE` (ICE candidate trickle)
  - `SCREEN_STOP`
- P2P when NAT allows, TURN relay fallback
- Bandwidth estimation drives adaptive quality

### Receiving — Hardware Decode
- `MediaFoundation` H.264/H.265 hardware decoder
- Decoded frames → `DirectComposition` surface (rendered by Compositor)
- GPU texture end-to-end, no CPU buffer

### IPC Commands
- `capture.listSources` → screens and windows with thumbnails
- `capture.start { sourceId, profile }`
- `capture.stop`
- `capture.setProfile { profile }`
- `capture.getStats` → fps, bitrate, encoder, latency

## Module 4: Window Manager

Raw Win32 window management:

```
Main Window (borderless, custom chrome)
├── WebView2 HWND (React UI fills client area)
├── PiP Window (separate top-level HWND, always-on-top)
│   └── DComp surface (screen share or video)
└── Overlay Window (transparent, click-through)
    └── DComp surface (HUD, notifications, VU meters)
```

- **Borderless window** with custom title bar rendered by React. Runtime handles `WM_NCHITTEST` for drag/resize/snap.
- **Snap layouts** via `WM_GETMINMAXINFO` + Win11 snap assist. Custom snap zones for PiP docking.
- **Picture-in-Picture** — second top-level HWND with `WS_EX_TOPMOST`. Resizable, draggable, auto-docks to edges.
- **Overlay window** — `WS_EX_LAYERED | WS_EX_TRANSPARENT` for native floating UI (VU meters, call HUD). Click-through.
- **Multi-monitor** — per-monitor DPI via `WM_DPICHANGED`.
- **System tray** — `Shell_NotifyIconW` with context menu.

### IPC Commands
- `window.setPiP { enabled, sourceType, position }`
- `window.setOverlay { element, visible }`
- `window.minimize` / `window.maximize` / `window.close`
- `window.setTrayTooltip { text }`

## Module 5: Compositor

DirectComposition + Direct3D 11 for GPU-accelerated native rendering:

- **DirectComposition visual tree** layered on top of WebView2 HWND
- **Composited natively (60fps):**
  - Screen share preview (decoded video texture → DComp surface)
  - VU meter / audio level indicators (simple shader)
  - Call overlay HUD (participants, quality, duration)
  - PiP content
- **Stays in webview:**
  - All standard UI (chat, channels, settings, friends)
  - Custom title bar
  - Anything not needing 60fps updates

Uses `IDCompositionDevice` to create visual trees composited with the webview at vsync — no tearing, minimal latency.

### IPC Commands
- `compositor.attachSurface { target, source }`

## Project Structure

```
apps/
├── desktop/                    ← existing React/Vite frontend (unchanged)
│   ├── src/
│   ├── dist/
│   └── package.json
│
├── engine/                     ← NEW: Ripcord Engine
│   ├── Cargo.toml              ← workspace root
│   ├── crates/
│   │   ├── engine-core/        ← orchestrator, message pump, lifecycle
│   │   ├── engine-webview/     ← WebView2 COM wrapper, IPC bridge
│   │   ├── engine-audio/       ← WASAPI, VST3 host, RNNoise, mixer
│   │   ├── engine-capture/     ← DXGI capture, HW encode, transport
│   │   ├── engine-window/      ← Win32 window management, tray
│   │   ├── engine-compositor/  ← DirectComposition, D3D11 surfaces
│   │   └── engine-ipc/         ← JSON-RPC schema, dispatch, codegen
│   ├── vendor/
│   │   ├── rnnoise/            ← RNNoise C source (static build)
│   │   └── vst3sdk/            ← Steinberg VST3 SDK headers
│   ├── build.rs
│   └── src/
│       └── main.rs             ← entry point
│
├── server-api/                 ← unchanged
├── server-gateway/             ← add screen share signaling opcodes
└── server-auth/                ← unchanged

packages/
├── ui/                         ← add engine.invoke() client
├── engine-types/               ← NEW: shared IPC schema (TS + Rust)
└── ...
```

## Dependencies

| Crate | Purpose |
|-------|---------|
| `windows` (0.58) | Win32/COM/DirectX bindings |
| `webview2-com` (0.31) | WebView2 embedding |
| `vst3-sys` | VST3 COM interfaces |
| `str0m` | Pure Rust WebRTC |
| `ringbuf` | Lock-free audio buffers |
| `crossbeam-channel` | Inter-thread messaging |
| `serde` + `serde_json` | IPC serialization |
| `rnnoise` (C, vendored) | ML noise suppression |

## Build Flow

**Production:**
```
pnpm run build:engine
  → cargo build --release → ripcord-engine.exe
  → vite build → dist/
  → bundle script: exe + dist/ + WebView2Loader.dll → installer (NSIS/WiX)
```

**Development:**
```
pnpm run dev:engine
  → cargo run (engine opens webview → localhost:1420)
  → vite dev (HMR, same as today)
```

Frontend dev experience is identical — hot reload, same React code, different shell.
