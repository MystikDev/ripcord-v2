# Ripcord Mobile (iOS)

Capacitor wrapper around the shared `@ripcord/ui` React app, packaged as a
native iOS app distributed via TestFlight / App Store.

## Architecture
- **Vite + React** static build (`dist/`) consumed by Capacitor's WKWebView.
- Forces `layoutMode: 'classic'` on first launch — the Universe/Solar System
  views are mouse-driven and don't translate to touch.
- Voice via LiveKit (browser WebRTC) — works in WKWebView with the
  `NSMicrophoneUsageDescription` and `UIBackgroundModes: audio` Info.plist
  entries set in the iOS project.

## Local development (browser preview, no iOS)
```bash
pnpm install
pnpm --filter ripcord-mobile dev
# open http://localhost:1421
```

## Building the iOS app (requires macOS + Xcode)
```bash
# 1. Build the web layer
pnpm --filter ripcord-mobile build

# 2. First time only: add iOS target (creates apps/mobile/ios/)
pnpm --filter ripcord-mobile exec cap add ios

# 3. Sync web assets into the iOS Xcode project
pnpm --filter ripcord-mobile cap:sync

# 4. Open in Xcode for signing + run
pnpm --filter ripcord-mobile cap:open:ios
```

## CI / TestFlight
Tag `vios-X.Y.Z` to trigger `.github/workflows/ios-release.yml`, which builds
and uploads an IPA to App Store Connect (TestFlight).
