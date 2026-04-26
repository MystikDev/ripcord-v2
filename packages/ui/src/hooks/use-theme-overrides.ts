/**
 * @module use-theme-overrides
 * Applies the active theme palette and the user-configurable font size,
 * icon size, and color overrides by writing CSS custom properties on the
 * document root. Reads from the persisted settings store so changes survive
 * reloads.
 *
 * Order: theme palette is applied FIRST, then user overrides on top, so
 * personal color choices (e.g. `fontColor: '#FFD700'`) win across all themes.
 */
'use client';

import { useEffect } from 'react';
import { useSettingsStore } from '../stores/settings-store';
import { applyTheme, THEMES } from '../lib/themes';

/**
 * Must be called once from a top-level layout component (e.g. AppShell).
 * Reactively updates CSS variables when the user changes appearance settings.
 */
export function useThemeOverrides(): void {
  const themeId = useSettingsStore((s) => s.themeId);
  const fontSize = useSettingsStore((s) => s.fontSize);
  const fontColor = useSettingsStore((s) => s.fontColor);
  const iconSize = useSettingsStore((s) => s.iconSize);
  const usernameColor = useSettingsStore((s) => s.usernameColor);
  const chatTextColor = useSettingsStore((s) => s.chatTextColor);

  useEffect(() => {
    const root = document.documentElement;

    // 1. Apply the full theme palette first — sets every theme variable.
    applyTheme(THEMES[themeId] ?? THEMES.orbit);

    // 2. Apply user-specific overrides on top so they always win.
    if (fontColor) {
      root.style.setProperty('--color-text-primary', fontColor);
    }
    if (usernameColor) {
      root.style.setProperty('--color-username', usernameColor);
    } else {
      root.style.removeProperty('--color-username');
    }
    if (chatTextColor) {
      root.style.setProperty('--color-chat-text', chatTextColor);
    } else {
      root.style.removeProperty('--color-chat-text');
    }

    // Sizes — theme-independent.
    root.style.setProperty('--font-size-base', `${fontSize}px`);
    root.style.setProperty('--font-size-sm', `${Math.max(10, fontSize - 2)}px`);
    root.style.setProperty('--font-size-xs', `${Math.max(9, fontSize - 4)}px`);
    root.style.setProperty('--icon-size-base', `${iconSize}px`);
  }, [themeId, fontColor, usernameColor, chatTextColor, fontSize, iconSize]);
}
