'use client';

/**
 * @module use-push-to-talk
 * Provides a push-to-talk keybinding hook that supports both keyboard keys and
 * mouse buttons. When running inside Tauri on Windows, background PTT is
 * supported via native key-state polling (`GetAsyncKeyState`). On macOS/Linux
 * the Tauri global shortcut plugin handles background key events natively.
 *
 * DOM listeners are the primary handler when the window is focused. When the
 * window loses focus, the hook switches to one of two strategies:
 *
 * 1. **Windows** — polls `check_key_pressed` (Tauri command wrapping
 *    `GetAsyncKeyState`) every 100 ms. This detects both press and release
 *    without consuming the key (other apps still receive it).
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
// Helpers — cached Tauri invoke
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
 * - On Windows: polls GetAsyncKeyState for background PTT
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

    // Track whether native key-state polling is available (Windows only).
    // -1 from the Tauri command means "not supported" (macOS/Linux).
    let pollingSupported: boolean | null = null; // null = not yet determined
    let pollInterval: ReturnType<typeof setInterval> | null = null;

    // Track whether the Tauri global shortcut was successfully registered
    // (used as fallback on macOS/Linux where Pressed/Released both work).
    let hasTauriShortcut = false;

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

    // ----- Keyboard handlers -----

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

    // ----- Key-state polling (Windows background PTT) -----

    async function pollKeyState() {
      const invoke = await getInvoke();
      if (!invoke || vkCode === null) {
        stopPolling();
        return;
      }

      try {
        const result = await invoke('check_key_pressed', { keyCode: vkCode }) as number;

        if (result === -1) {
          // Platform doesn't support polling (macOS/Linux) — stop polling,
          // the Tauri global shortcut handles release on those platforms.
          pollingSupported = false;
          stopPolling();
          return;
        }

        pollingSupported = true;

        if (result === 1 && !activeRef.current) {
          // Key is pressed while backgrounded — activate
          activate();
        } else if (result === 0 && activeRef.current) {
          // Key was released while backgrounded — deactivate
          deactivate();
          stopPolling();
        }
      } catch {
        // IPC failed — stop polling to avoid spamming errors
        stopPolling();
      }
    }

    function startPolling() {
      if (pollInterval || isMouse || vkCode === null) return;
      // Immediate first check then poll every 100ms
      pollKeyState();
      pollInterval = setInterval(pollKeyState, 100);
    }

    function stopPolling() {
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    }

    // ----- Focus tracking -----

    function handleFocus() {
      isFocusedRef.current = true;
      // DOM listeners take over — stop polling
      stopPolling();
    }

    function handleBlur() {
      isFocusedRef.current = false;

      if (isMouse) {
        // Mouse PTT can't work in background — deactivate
        deactivate();
        return;
      }

      // For keyboard keys: try native key-state polling first (Windows).
      // If polling is known to be unsupported, rely on Tauri global shortcut.
      if (pollingSupported === false) {
        // macOS/Linux: Tauri global shortcut handles background PTT.
        // Don't deactivate — the Released event will come through.
        if (!hasTauriShortcut) {
          // No Tauri at all (web browser) — deactivate on blur
          deactivate();
        }
        return;
      }

      // Either polling is supported (Windows) or we haven't checked yet.
      // Start polling — the first tick will determine support.
      startPolling();
    }

    // ----- Register DOM listeners -----

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);

    // ----- Tauri global shortcut (background PTT for macOS/Linux) -----
    // On Windows polling handles everything, but the global shortcut still
    // works for activation (Pressed). On macOS/Linux it also delivers
    // Released, so it's the primary background mechanism there.

    const tauriKey = !isMouse ? toTauriAccelerator(key) : null;
    let tauriCleanup: (() => void) | null = null;

    if (tauriKey) {
      (async () => {
        try {
          const { register, unregister } = await import(
            '@tauri-apps/plugin-global-shortcut'
          );

          await register(tauriKey, (event: ShortcutEvent) => {
            if (event.state === 'Pressed') {
              // Only activate from Tauri when the window is NOT focused —
              // the DOM listener handles the focused case.
              if (!isFocusedRef.current && !activeRef.current) {
                activate();
                // On Windows, start polling for release detection
                if (pollingSupported !== false) {
                  startPolling();
                }
              }
            } else if (event.state === 'Released') {
              // macOS/Linux: honour the release to prevent stuck-key state
              if (activeRef.current) {
                deactivate();
                stopPolling();
              }
            }
          });

          hasTauriShortcut = true;

          tauriCleanup = () => {
            hasTauriShortcut = false;
            unregister(tauriKey).catch(() => {
              /* best-effort cleanup */
            });
          };
        } catch {
          // Not running in Tauri — global shortcut unavailable, DOM-only PTT
          hasTauriShortcut = false;
        }
      })();
    }

    // Pre-resolve invoke so polling starts fast when needed
    getInvoke();

    // ----- Cleanup -----

    return () => {
      stopPolling();

      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);

      tauriCleanup?.();
    };
  }, [key, enabled, onActivate, onDeactivate, shouldIgnoreKeyboard]);

  return { isActive };
}
