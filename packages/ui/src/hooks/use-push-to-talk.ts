'use client';

/**
 * @module use-push-to-talk
 * Provides a push-to-talk keybinding hook that supports both keyboard keys and
 * mouse buttons. When running inside Tauri on Windows, background PTT is
 * supported via a low-level keyboard hook (`SetWindowsHookEx(WH_KEYBOARD_LL)`)
 * that emits Tauri events (`ptt-hook-down` / `ptt-hook-up`) on press and
 * release — event-driven with zero polling. This is the same mechanism Discord
 * uses for push-to-talk.
 *
 * On macOS/Linux the Tauri global shortcut plugin handles background key events
 * natively (it delivers both Pressed and Released events on those platforms).
 *
 * DOM listeners are the primary handler when the window is focused. When the
 * window loses focus, one of two strategies takes over:
 *
 * 1. **Windows** — the WH_KEYBOARD_LL hook delivers press/release events
 *    system-wide via Tauri events, backed by a GetAsyncKeyState polling
 *    fallback (60ms) for when WebView2 throttles event delivery while
 *    minimized. Does not consume the key (other apps still receive it).
 *
 * 2. **macOS / Linux** — falls back to the Tauri `global-shortcut` plugin
 *    which fires both `Pressed` and `Released` events natively.
 *
 * 3. **Web (non-Tauri)** — PTT deactivates on blur (no background support).
 *
 * Mouse buttons cannot be captured globally on any platform; mouse PTT
 * deactivates when the window loses focus.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ShortcutEvent } from '@tauri-apps/plugin-global-shortcut';
import { isMouseButton, parseMouseButton, toTauriAccelerator, toVirtualKeyCode } from '../lib/key-display';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UsePushToTalkOptions {
  /** The key to bind push-to-talk to. Default: ' ' (Space)
   *  Keyboard keys use KeyboardEvent.key values (e.g. ' ', 'v', 'Control').
   *  Mouse buttons use "Mouse{button}" format (e.g. 'Mouse3', 'Mouse4'). */
  key?: string;
  /** Whether push-to-talk mode is enabled. Default: true */
  enabled?: boolean;
  /** Called when the key is pressed (should unmute) */
  onActivate?: () => void;
  /** Called when the key is released (should mute) */
  onDeactivate?: () => void;
}

export interface UsePushToTalkReturn {
  /** Whether the push-to-talk key is currently held down */
  isActive: boolean;
}

// ---------------------------------------------------------------------------
// Helpers — cached Tauri imports
// ---------------------------------------------------------------------------

/** Resolved `invoke` function from `@tauri-apps/api/core`, or `null` if not
 *  running inside Tauri. Cached after the first (async) resolution. */
let cachedInvoke: ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null = null;
let invokeResolved = false;

async function getInvoke() {
  if (invokeResolved) return cachedInvoke;
  invokeResolved = true;
  try {
    const mod = await import('@tauri-apps/api/core');
    cachedInvoke = mod.invoke;
    return cachedInvoke;
  } catch {
    // Not running in Tauri
    return null;
  }
}

/** Resolved `listen` function from `@tauri-apps/api/event`, or `null`. */
let cachedListen: ((event: string, handler: (event: { payload: unknown }) => void) => Promise<() => void>) | null = null;
let listenResolved = false;

async function getListen() {
  if (listenResolved) return cachedListen;
  listenResolved = true;
  try {
    const mod = await import('@tauri-apps/api/event');
    cachedListen = mod.listen;
    return cachedListen;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Manages push-to-talk keybinding.
 * - Listens for keydown/keyup (keyboard) or mousedown/mouseup (mouse buttons)
 * - Fires onActivate on press, onDeactivate on release
 * - Ignores keyboard events when a text input is focused
 * - Prevents key repeat from firing multiple activations
 * - Prevents default context menu for right-click PTT and browser
 *   back/forward for Mouse 4/5
 * - On Windows: uses WH_KEYBOARD_LL hook for event-driven background PTT
 * - On macOS/Linux: uses Tauri global shortcut for background PTT
 */
export function usePushToTalk({
  key = ' ',
  enabled = true,
  onActivate,
  onDeactivate,
}: UsePushToTalkOptions = {}): UsePushToTalkReturn {
  const [isActive, setIsActive] = useState(false);
  const activeRef = useRef(false);
  const isFocusedRef = useRef(document.hasFocus());

  const shouldIgnoreKeyboard = useCallback((e: KeyboardEvent): boolean => {
    const target = e.target as HTMLElement | null;
    if (!target) return false;

    const tag = target.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    if (target.isContentEditable) return true;

    return false;
  }, []);

  useEffect(() => {
    if (!enabled) {
      // Reset state if disabled while active
      if (activeRef.current) {
        activeRef.current = false;
        setIsActive(false);
        onDeactivate?.();
      }
      return;
    }

    const isMouse = isMouseButton(key);
    const vkCode = !isMouse ? toVirtualKeyCode(key) : null;

    // Whether the LL keyboard hook is active (Windows) — set by async setup
    let hookActive = false;
    // Whether the Tauri global shortcut was registered (macOS/Linux fallback)
    let hasTauriShortcut = false;
    // Guards against cleanup racing with async setup
    let cancelled = false;

    // ----- Activate / Deactivate helpers -----

    function activate() {
      if (activeRef.current) return;
      activeRef.current = true;
      setIsActive(true);
      onActivate?.();
    }

    function deactivate() {
      if (!activeRef.current) return;
      activeRef.current = false;
      setIsActive(false);
      onDeactivate?.();
    }

    // ----- Keyboard handlers (DOM — focused window only) -----

    function handleKeyDown(e: KeyboardEvent) {
      if (isMouse) return;
      if (e.key !== key) return;
      if (e.repeat) return;
      if (shouldIgnoreKeyboard(e)) return;

      e.preventDefault();
      activate();
    }

    function handleKeyUp(e: KeyboardEvent) {
      if (isMouse) return;
      if (e.key !== key) return;
      if (!activeRef.current) return;

      e.preventDefault();
      deactivate();
    }

    // ----- Mouse handlers -----

    const mouseBtn = isMouse ? parseMouseButton(key) : -1;

    function handleMouseDown(e: MouseEvent) {
      if (!isMouse) return;
      if (e.button !== mouseBtn) return;

      e.preventDefault();
      activate();
    }

    function handleMouseUp(e: MouseEvent) {
      if (!isMouse) return;
      if (e.button !== mouseBtn) return;
      if (!activeRef.current) return;

      e.preventDefault();
      deactivate();
    }

    // Prevent context menu when right-click (button 2) is PTT key
    function handleContextMenu(e: MouseEvent) {
      if (isMouse && mouseBtn === 2) {
        e.preventDefault();
      }
    }

    // ----- Focus tracking -----

    function handleFocus() {
      isFocusedRef.current = true;
      stopPoll();
    }

    function handleBlur() {
      isFocusedRef.current = false;

      if (isMouse) {
        // Mouse PTT can't work in background — deactivate
        deactivate();
        return;
      }

      // For keyboard keys: if the LL hook (Windows) is active, start polling
      // as a fallback (WebView2 may throttle Tauri events when minimized).
      if (hookActive) {
        startPoll();
        return;
      }

      if (hasTauriShortcut) return;

      // No native background handler (web browser) — deactivate on blur
      deactivate();
    }

    // ----- Register DOM listeners -----

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);

    // ----- Native background PTT setup (async) -----
    //
    // Strategy: try the WH_KEYBOARD_LL hook first (Windows). If that fails
    // or returns false (non-Windows), fall back to Tauri global shortcut.
    // Serialized to prevent both from registering on the same platform.

    let hookCleanup: (() => void) | null = null;
    let tauriCleanup: (() => void) | null = null;

    // Polling fallback — WebView2 may throttle Tauri event delivery when the
    // window is minimized. GetAsyncKeyState polling bypasses this limitation.
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let pollInvoke: typeof cachedInvoke = null;
    let pollVk: number | null = null;

    function startPoll() {
      if (pollTimer || !pollInvoke || pollVk === null) return;
      const inv = pollInvoke;
      const vk = pollVk;
      pollTimer = setInterval(async () => {
        try {
          const state = (await inv('check_key_pressed', { keyCode: vk })) as number;
          if (state === 1 && !activeRef.current) activate();
          else if (state === 0 && activeRef.current) deactivate();
        } catch { /* ignore */ }
      }, 60);
    }

    function stopPoll() {
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    }

    (async () => {
      if (cancelled || isMouse) return;

      const invoke = await getInvoke();
      const listen = await getListen();

      // --- Try WH_KEYBOARD_LL hook first (Windows) ---
      if (invoke && listen && vkCode !== null) {
        try {
          const success = (await invoke('start_ptt_hook', { keyCode: vkCode })) as boolean;

          if (success && !cancelled) {
            hookActive = true;

            // Listen for hook-emitted press/release events
            const unlistenDown = await listen('ptt-hook-down', () => {
              // Always honour hook events — activate() is a no-op if already
              // active (e.g. DOM keydown fired first while focused).
              activate();
            });

            const unlistenUp = await listen('ptt-hook-up', () => {
              // Always honour release regardless of focus to prevent stuck
              // key state. The deactivate() guard is a no-op if not active.
              deactivate();
            });

            if (cancelled) {
              // Effect was cleaned up while we were setting up — tear down
              unlistenDown();
              unlistenUp();
              invoke('stop_ptt_hook').catch(() => {});
              hookActive = false;
              return;
            }

            // Store refs for polling fallback
            pollInvoke = invoke;
            pollVk = vkCode;
            if (!isFocusedRef.current) startPoll();

            hookCleanup = () => {
              hookActive = false;
              stopPoll();
              unlistenDown();
              unlistenUp();
              invoke('stop_ptt_hook').catch(() => { /* best-effort */ });
            };

            // Hook handles everything on Windows — skip global shortcut
            return;
          }
        } catch {
          // start_ptt_hook command not available — fall through
        }
      }

      // --- Fallback: Tauri global shortcut (macOS/Linux) ---
      // On these platforms the global shortcut plugin delivers both Pressed
      // and Released events natively (unlike Windows where only Pressed
      // fires, which is why we need the LL hook on Windows).

      if (cancelled) return;

      const tauriKey = toTauriAccelerator(key);
      if (!tauriKey) return;

      try {
        const { register, unregister } = await import(
          '@tauri-apps/plugin-global-shortcut'
        );

        await register(tauriKey, (event: ShortcutEvent) => {
          if (event.state === 'Pressed') {
            if (!isFocusedRef.current && !activeRef.current) {
              activate();
            }
          } else if (event.state === 'Released') {
            if (activeRef.current) {
              deactivate();
            }
          }
        });

        if (cancelled) {
          unregister(tauriKey).catch(() => {});
          return;
        }

        hasTauriShortcut = true;

        tauriCleanup = () => {
          hasTauriShortcut = false;
          unregister(tauriKey).catch(() => { /* best-effort */ });
        };
      } catch {
        // Not running in Tauri — DOM-only PTT
        hasTauriShortcut = false;
      }
    })();

    // ----- Cleanup -----

    return () => {
      cancelled = true;
      stopPoll();

      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);

      hookCleanup?.();
      tauriCleanup?.();
    };
  }, [key, enabled, onActivate, onDeactivate, shouldIgnoreKeyboard]);

  return { isActive };
}
