'use client';

/**
 * @module use-push-to-talk
 * Provides a push-to-talk keybinding hook that supports both keyboard keys and
 * mouse buttons. When running inside Tauri, a global shortcut is registered so
 * PTT continues to work even when the app window is backgrounded. DOM listeners
 * are kept as the primary handler when the window is focused (they support the
 * text-input guard and preventDefault), while the Tauri global shortcut only
 * activates when the window loses focus.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { isMouseButton, parseMouseButton, toTauriAccelerator } from '../lib/key-display';

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
 * - Registers a Tauri global shortcut for background PTT (keyboard only)
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
  // Whether we successfully registered a Tauri global shortcut — used to
  // decide whether blur should auto-deactivate (not needed when Tauri can
  // deliver the key-release event globally).
  const hasTauriShortcutRef = useRef(false);

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

    // ----- Keyboard handlers -----

    function handleKeyDown(e: KeyboardEvent) {
      if (isMouse) return;
      if (e.key !== key) return;
      if (e.repeat) return;
      if (shouldIgnoreKeyboard(e)) return;

      e.preventDefault();
      activeRef.current = true;
      setIsActive(true);
      onActivate?.();
    }

    function handleKeyUp(e: KeyboardEvent) {
      if (isMouse) return;
      if (e.key !== key) return;
      if (!activeRef.current) return;

      e.preventDefault();
      activeRef.current = false;
      setIsActive(false);
      onDeactivate?.();
    }

    // ----- Mouse handlers -----

    const mouseBtn = isMouse ? parseMouseButton(key) : -1;

    function handleMouseDown(e: MouseEvent) {
      if (!isMouse) return;
      if (e.button !== mouseBtn) return;

      e.preventDefault();
      activeRef.current = true;
      setIsActive(true);
      onActivate?.();
    }

    function handleMouseUp(e: MouseEvent) {
      if (!isMouse) return;
      if (e.button !== mouseBtn) return;
      if (!activeRef.current) return;

      e.preventDefault();
      activeRef.current = false;
      setIsActive(false);
      onDeactivate?.();
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
    }

    function handleBlur() {
      isFocusedRef.current = false;

      // Deactivate on blur ONLY for mouse buttons or when there's no Tauri
      // global shortcut to deliver the release event in the background.
      if (activeRef.current && (isMouse || !hasTauriShortcutRef.current)) {
        activeRef.current = false;
        setIsActive(false);
        onDeactivate?.();
      }
    }

    // ----- Register DOM listeners -----

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);

    // ----- Tauri global shortcut (background PTT) -----
    // Dynamically imported so the hook works in non-Tauri environments (web).
    // Only keyboard keys are supported — Tauri can't capture mouse globally.

    const tauriKey = !isMouse ? toTauriAccelerator(key) : null;
    let tauriCleanup: (() => void) | null = null;

    if (tauriKey) {
      (async () => {
        try {
          const { register, unregister } = await import(
            '@tauri-apps/plugin-global-shortcut'
          );

          await register(tauriKey, (event) => {
            if (event.state === 'Pressed') {
              // Only activate from Tauri when the window is NOT focused —
              // the DOM listener handles the focused case (with text-input
              // guard and preventDefault).
              if (!isFocusedRef.current && !activeRef.current) {
                activeRef.current = true;
                setIsActive(true);
                onActivate?.();
              }
            } else if (event.state === 'Released') {
              // Always honour the release to prevent stuck-key state,
              // regardless of focus.
              if (activeRef.current) {
                activeRef.current = false;
                setIsActive(false);
                onDeactivate?.();
              }
            }
          });

          hasTauriShortcutRef.current = true;

          tauriCleanup = () => {
            hasTauriShortcutRef.current = false;
            unregister(tauriKey).catch(() => {
              /* best-effort cleanup */
            });
          };
        } catch {
          // Not running in Tauri — global shortcut unavailable, DOM-only PTT
          hasTauriShortcutRef.current = false;
        }
      })();
    }

    // ----- Cleanup -----

    return () => {
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
