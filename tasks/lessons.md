# Ripcord v2 — Lessons Learned

## Session: 2026-02-23

### 1. Always write to tasks/todo.md and tasks/lessons.md
- **Mistake**: Completed security hardening and update checker fix without updating task tracking files
- **Rule**: After ANY task completion, update `tasks/todo.md` with results and `tasks/lessons.md` with lessons before telling the user "done"

### 2. Update checkers must poll, not check once
- **Mistake**: Original UpdateChecker only checked once 5 seconds after mount — users with the app already open never learned about updates
- **Rule**: Auto-updaters must poll periodically (30 min is reasonable). Also send system notifications so tray-minimized users get notified.

### 3. Silent error swallowing hides real bugs
- **Mistake**: Update check errors were caught and set to 'idle' with only a console.warn — users had no indication anything was wrong
- **Rule**: Retry on next poll cycle. Log warnings. Only suppress UI noise, never suppress retry logic.

### 4. CSP null is never acceptable
- **Mistake**: Tauri config had `"csp": null` which completely disabled Content Security Policy
- **Rule**: Always set a strict CSP. `script-src 'self'` is the minimum. Add directives incrementally as needed.

### 5. Open redirect via query params is easy to miss
- **Mistake**: `router.push(searchParams.get('redirect') ?? '/')` allows `redirect=https://evil.com`
- **Rule**: Always validate redirects: must start with `/` AND must not start with `//`. Apply to ALL auth pages (login + register, all variants).

### 6. localStorage is not secure storage
- **Mistake**: Access tokens were persisted to localStorage — accessible via XSS or browser extensions
- **Rule**: Access tokens should be memory-only. Only persist refresh tokens. For truly sensitive data (API keys), encrypt before storing or use platform-specific secure storage.

### 7. Docker-compose should never hardcode secrets
- **Mistake**: Postgres password, MinIO credentials, LiveKit keys, and a public IP were hardcoded in docker-compose.yml (committed to git)
- **Rule**: Use `${VAR:-default}` substitution. Defaults are fine for local dev, but production overrides via `.env` or environment.

### 8. MIME type headers can be spoofed — validate magic bytes
- **Mistake**: Image uploads only checked Content-Type header. An attacker could upload a malicious file with `Content-Type: image/png`
- **Rule**: Always validate file magic bytes (first 4-8 bytes) match the declared MIME type on server-side upload handlers.

### 9. WebSocket servers need maxPayload limits
- **Mistake**: No `maxPayload` on the WebSocket server — an attacker could send arbitrarily large messages to exhaust server memory
- **Rule**: Always set `maxPayload` (64KB is reasonable for chat). Also limit array sizes in subscription payloads.

## Session: 2026-02-24

### 10. E2E encryption means link previews must be client-side
- **Context**: Server never sees plaintext message content, so it can't extract URLs to fetch OG metadata
- **Rule**: For E2E encrypted apps, any content-derived features (link previews, search, etc.) must run client-side. Use Tauri HTTP plugin for CORS-free fetching from the desktop app.

### 11. Use dynamic imports for platform-specific APIs in shared packages
- **Context**: `@ripcord/ui` is shared between desktop (Tauri) and web (Next.js). Tauri plugins are only available in the desktop app.
- **Rule**: Use `await import('@tauri-apps/plugin-...')` with try/catch fallback. The dynamic import resolves at runtime in Tauri but fails gracefully on web, avoiding hard dependencies in the shared package.

### 12. Cap repeated UI elements per message
- **Context**: A message could contain many URLs, leading to many link preview cards
- **Rule**: Always cap repeated UI elements (e.g., `.slice(0, 3)` for link previews). Prevents spam and keeps the chat readable.
