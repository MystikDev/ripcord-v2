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

## Backlog — Security (Future Sprints)
- [ ] Encrypt AI API keys in localStorage (or proxy through backend)
- [ ] Add token blacklist on logout (Redis-based)
- [ ] Increase password minimum from 8 to 12 chars
- [ ] Add per-account rate limiting (not just per-IP)
- [ ] Add rate limiting to moderation endpoints (kick/ban/invite)
- [ ] Tighten production CSP (remove `http:` from connect-src, `data:` from img-src)
- [ ] Add cargo-deny to CI for Rust dependency CVE auditing
