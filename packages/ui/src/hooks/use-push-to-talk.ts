'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { isMouseButton, parseMouseButton } from '../lib/key-display';

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
 */
export function usePushToTalk({
  key = ' ',
  enabled = true,
  onActivate,
  onDeactivate,
}: UsePushToTalkOptions = {}): UsePushToTalkReturn {
  const [isActive, setIsActive] = useState(false);
  const activeRef = useRef(false);

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
      if (isMouse) return; // Only listen for keyboard when key is a keyboard key
      if (e.key !== key) return;
      if (e.repeat) return; // Ignore held-key repeats
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

      // Prevent browser back/forward navigation for Mouse 4/5
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

    // ----- Shared: deactivate on window blur -----

    function handleBlur() {
      if (activeRef.current) {
        activeRef.current = false;
        setIsActive(false);
        onDeactivate?.();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('blur', handleBlur);
    };
  }, [key, enabled, onActivate, onDeactivate, shouldIgnoreKeyboard]);

  return { isActive };
}
