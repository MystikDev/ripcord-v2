/**
 * @module theme-picker
 * Grid of theme swatch cards. Selecting a theme is instant (no apply button)
 * and persists via the settings store.
 */
'use client';

import { useSettingsStore } from '../../stores/settings-store';
import { THEME_LIST, type Theme } from '../../lib/themes';

export function ThemePicker() {
  const themeId = useSettingsStore((s) => s.themeId);
  const setThemeId = useSettingsStore((s) => s.setThemeId);

  return (
    <div className="mb-6">
      <label className="text-sm font-medium text-text-secondary mb-1 block">Theme</label>
      <p className="text-xs text-text-muted mb-3">
        Choose your color palette. Personal color overrides below still apply.
      </p>
      <div className="grid grid-cols-2 gap-2">
        {THEME_LIST.map((theme) => (
          <ThemeCard
            key={theme.id}
            theme={theme}
            selected={themeId === theme.id}
            onSelect={() => setThemeId(theme.id)}
          />
        ))}
      </div>
    </div>
  );
}

interface ThemeCardProps {
  theme: Theme;
  selected: boolean;
  onSelect: () => void;
}

function ThemeCard({ theme, selected, onSelect }: ThemeCardProps) {
  const { palette } = theme;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`relative rounded-lg border p-3 text-left transition-all ${
        selected
          ? 'border-accent bg-accent/10 ring-2 ring-accent/40'
          : 'border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span
          className={`text-sm font-semibold ${
            selected ? 'text-accent' : 'text-text-primary'
          }`}
        >
          {theme.name}
        </span>
        {selected && (
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-accent"
          >
            <path d="M2 7.5l3 3 7-7" />
          </svg>
        )}
      </div>
      <p className="mb-2 text-[10px] text-text-muted leading-tight">
        {theme.description}
      </p>
      <div className="flex gap-1">
        {[palette.bg, palette.surface2, palette.accent, palette.accentMagenta].map(
          (color, idx) => (
            <div
              key={idx}
              style={{ background: color }}
              className="h-5 w-5 rounded-full border border-white/10 shadow-sm"
            />
          ),
        )}
      </div>
    </button>
  );
}
