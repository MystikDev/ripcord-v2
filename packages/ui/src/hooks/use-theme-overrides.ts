/**
 * @module use-theme-overrides
 * Applies user-configurable font size, icon size, and color overrides by
 * writing to CSS custom properties on the document root. Reads from the
 * persisted settings store so changes survive reloads.
 */
'use client';

import { useEffect } from 'react';
import { useSettingsStore } from '../stores/settings-store';

/**
 * Must be called once from a top-level layout component (e.g. AppShell).
 * Reactively updates CSS variables when the user changes appearance settings.
 */
export function useThemeOverrides(): void {
  const fontSize = useSettingsStore((s) => s.fontSize);
  const fontColor = useSettingsStore((s) => s.fontColor);
  const iconSize = useSettingsStore((s) => s.iconSize);
  const usernameColor = useSettingsStore((s) => s.usernameColor);
  const chatTextColor = useSettingsStore((s) => s.chatTextColor);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--font-size-base', `${fontSize}px`);
    root.style.setProperty('--font-size-sm', `${Math.max(10, fontSize - 2)}px`);
    root.style.setProperty('--font-size-xs', `${Math.max(9, fontSize - 4)}px`);
  }, [fontSize]);

  useEffect(() => {
    const root = document.documentElement;
    if (fontColor) {
      root.style.setProperty('--color-text-primary', fontColor);
    } else {
      // Restore the theme default
      root.style.setProperty('--color-text-primary', '#e8ecf4');
    }
  }, [fontColor]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--icon-size-base', `${iconSize}px`);
  }, [iconSize]);

  useEffect(() => {
    const root = document.documentElement;
    if (usernameColor) {
      root.style.setProperty('--color-username', usernameColor);
    } else {
      root.style.removeProperty('--color-username');
    }
  }, [usernameColor]);

  useEffect(() => {
    const root = document.documentElement;
    if (chatTextColor) {
      root.style.setProperty('--color-chat-text', chatTextColor);
    } else {
      root.style.removeProperty('--color-chat-text');
    }
  }, [chatTextColor]);
}
