/**
 * @module use-theme-overrides
 * Applies user-configurable font size and color overrides by writing to
 * CSS custom properties on the document root. Reads from the persisted
 * settings store so changes survive reloads.
 */
'use client';

import { useEffect } from 'react';
import { useSettingsStore } from '../stores/settings-store';

/**
 * Must be called once from a top-level layout component (e.g. AppShell).
 * Reactively updates CSS variables when the user changes font settings.
 */
export function useThemeOverrides(): void {
  const fontSize = useSettingsStore((s) => s.fontSize);
  const fontColor = useSettingsStore((s) => s.fontColor);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--font-size-base', `${fontSize}px`);
  }, [fontSize]);

  useEffect(() => {
    const root = document.documentElement;
    if (fontColor) {
      root.style.setProperty('--color-text-primary', fontColor);
    } else {
      // Restore the theme default
      root.style.setProperty('--color-text-primary', '#E8ECF4');
    }
  }, [fontColor]);
}
