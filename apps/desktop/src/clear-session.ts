/**
 * @module clear-session
 * Forces a fresh login on every app launch by clearing persisted auth state.
 *
 * How it works:
 * - `sessionStorage` is tied to the webview lifetime — destroyed when the Tauri
 *   window closes (X button, tray quit, crash, or update relaunch).
 * - On fresh launch the session flag is absent, so we wipe `ripcord-auth` from
 *   localStorage before the Zustand auth store can hydrate from it.
 * - After the first load we set the flag so navigations within the same session
 *   (e.g. login → app) don't re-clear.
 *
 * IMPORTANT: This module MUST be the first import in main.tsx so it runs before
 * the auth store module is evaluated and reads from localStorage.
 */

if (!sessionStorage.getItem('ripcord-session')) {
  localStorage.removeItem('ripcord-auth');
  sessionStorage.setItem('ripcord-session', '1');
}
