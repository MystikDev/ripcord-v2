/**
 * @module themes
 * Theme palette definitions and applier. Each theme overrides the CSS custom
 * properties defined in globals.css `@theme` block via inline styles on the
 * document root, which take precedence over the build-time defaults.
 *
 * User-specific overrides (fontColor, usernameColor, chatTextColor) are
 * applied AFTER the theme palette so they always win.
 */

export type ThemeId = 'orbit' | 'midnight' | 'aurora' | 'solar' | 'crimson' | 'mono';

export interface ThemePalette {
  // Surfaces
  void: string;
  bg: string;
  surface1: string;
  surface2: string;
  surface3: string;
  border: string;
  // Text
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  // Accents
  accent: string;
  accentHover: string;
  accentMagenta: string;
  accentYellow: string;
  accentViolet: string;
  // Semantic
  cyan: string;       // legacy alias used in some components
  success: string;
  warning: string;
  danger: string;
  // RGB triplets (no alpha) for use in rgba() inside CSS rules
  glassRgb: string;
  accentRgb: string;
  accentMagentaRgb: string;
  accentVioletRgb: string;
}

export interface Theme {
  id: ThemeId;
  name: string;
  description: string;
  palette: ThemePalette;
}

export const THEMES: Record<ThemeId, Theme> = {
  orbit: {
    id: 'orbit',
    name: 'Orbit',
    description: 'Cyan & magenta cyberpunk',
    palette: {
      void: '#050505',
      bg: '#050508',
      surface1: '#0a0a0f',
      surface2: '#111118',
      surface3: '#1a1a24',
      border: '#1c1c2a',
      textPrimary: '#e8ecf4',
      textSecondary: '#8892a8',
      textMuted: '#5c657a',
      accent: '#00f0ff',
      accentHover: '#00c8d9',
      accentMagenta: '#ff006e',
      accentYellow: '#ffbe0b',
      accentViolet: '#8338ec',
      cyan: '#00f0ff',
      success: '#34d399',
      warning: '#fbbf24',
      danger: '#f87171',
      glassRgb: '17, 17, 24',
      accentRgb: '0, 240, 255',
      accentMagentaRgb: '255, 0, 110',
      accentVioletRgb: '131, 56, 236',
    },
  },
  midnight: {
    id: 'midnight',
    name: 'Midnight',
    description: 'Cool blurple, less neon',
    palette: {
      void: '#07080d',
      bg: '#0b0d14',
      surface1: '#11141d',
      surface2: '#181c28',
      surface3: '#232838',
      border: '#2a2f3f',
      textPrimary: '#e6e8ee',
      textSecondary: '#9ba3b4',
      textMuted: '#6b7388',
      accent: '#5865f2',
      accentHover: '#4752c4',
      accentMagenta: '#eb459e',
      accentYellow: '#f0b232',
      accentViolet: '#9b6dff',
      cyan: '#5865f2',
      success: '#57f287',
      warning: '#fee75c',
      danger: '#ed4245',
      glassRgb: '24, 28, 40',
      accentRgb: '88, 101, 242',
      accentMagentaRgb: '235, 69, 158',
      accentVioletRgb: '155, 109, 255',
    },
  },
  aurora: {
    id: 'aurora',
    name: 'Aurora',
    description: 'Mint & purple boreal',
    palette: {
      void: '#04080a',
      bg: '#060d10',
      surface1: '#0a1418',
      surface2: '#0f1e25',
      surface3: '#182d35',
      border: '#1f3a45',
      textPrimary: '#e8f4f0',
      textSecondary: '#88a8a0',
      textMuted: '#5c7a72',
      accent: '#5eead4',
      accentHover: '#2dd4bf',
      accentMagenta: '#c084fc',
      accentYellow: '#fde047',
      accentViolet: '#a855f7',
      cyan: '#5eead4',
      success: '#6ee7b7',
      warning: '#facc15',
      danger: '#fb7185',
      glassRgb: '15, 30, 37',
      accentRgb: '94, 234, 212',
      accentMagentaRgb: '192, 132, 252',
      accentVioletRgb: '168, 85, 247',
    },
  },
  solar: {
    id: 'solar',
    name: 'Solar Flare',
    description: 'Warm sunset orange',
    palette: {
      void: '#0a0604',
      bg: '#120906',
      surface1: '#1a0e08',
      surface2: '#25160d',
      surface3: '#382014',
      border: '#4a2a1a',
      textPrimary: '#fdecd6',
      textSecondary: '#c9a78a',
      textMuted: '#8a6e58',
      accent: '#ff8a3d',
      accentHover: '#ea6a1a',
      accentMagenta: '#ff3b6e',
      accentYellow: '#ffd23f',
      accentViolet: '#c026d3',
      cyan: '#ff8a3d',
      success: '#fbbf24',
      warning: '#fde68a',
      danger: '#ef4444',
      glassRgb: '37, 22, 13',
      accentRgb: '255, 138, 61',
      accentMagentaRgb: '255, 59, 110',
      accentVioletRgb: '192, 38, 211',
    },
  },
  crimson: {
    id: 'crimson',
    name: 'Crimson',
    description: 'Dramatic blood red',
    palette: {
      void: '#0a0303',
      bg: '#100505',
      surface1: '#180808',
      surface2: '#240c0c',
      surface3: '#361212',
      border: '#4a1a1a',
      textPrimary: '#f4e6e6',
      textSecondary: '#b89090',
      textMuted: '#7a5a5a',
      accent: '#ef4444',
      accentHover: '#dc2626',
      accentMagenta: '#f472b6',
      accentYellow: '#fbbf24',
      accentViolet: '#a855f7',
      cyan: '#ef4444',
      success: '#84cc16',
      warning: '#fbbf24',
      danger: '#f87171',
      glassRgb: '36, 12, 12',
      accentRgb: '239, 68, 68',
      accentMagentaRgb: '244, 114, 182',
      accentVioletRgb: '168, 85, 247',
    },
  },
  mono: {
    id: 'mono',
    name: 'Mono',
    description: 'Grayscale zen',
    palette: {
      void: '#050505',
      bg: '#0a0a0a',
      surface1: '#111111',
      surface2: '#1a1a1a',
      surface3: '#262626',
      border: '#2a2a2a',
      textPrimary: '#f0f0f0',
      textSecondary: '#a0a0a0',
      textMuted: '#6a6a6a',
      accent: '#e5e5e5',
      accentHover: '#ffffff',
      // Subtle hue-free differentiation so unread pulse, holo-text gradient,
      // and other multi-color UI cues retain visual hierarchy in mono.
      accentMagenta: '#a3a3a3',
      accentYellow: '#bababa',
      accentViolet: '#8a8a8a',
      cyan: '#e5e5e5',
      success: '#a3a3a3',
      warning: '#d4d4d4',
      danger: '#fafafa',
      glassRgb: '26, 26, 26',
      accentRgb: '229, 229, 229',
      accentMagentaRgb: '163, 163, 163',
      accentVioletRgb: '138, 138, 138',
    },
  },
};

export const THEME_LIST: Theme[] = [
  THEMES.orbit,
  THEMES.midnight,
  THEMES.aurora,
  THEMES.solar,
  THEMES.crimson,
  THEMES.mono,
];

/**
 * Apply a theme palette to the document root. Sets every theme variable
 * via inline `style.setProperty()` on `:root` — these override the build-time
 * defaults from the `@theme` block in globals.css.
 *
 * Pure DOM call; no React. Safe to invoke during module init before mount.
 */
export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const p = theme.palette;

  root.style.setProperty('--color-void', p.void);
  root.style.setProperty('--color-bg', p.bg);
  root.style.setProperty('--color-surface-1', p.surface1);
  root.style.setProperty('--color-surface-2', p.surface2);
  root.style.setProperty('--color-surface-3', p.surface3);
  root.style.setProperty('--color-border', p.border);

  root.style.setProperty('--color-text-primary', p.textPrimary);
  root.style.setProperty('--color-text-secondary', p.textSecondary);
  root.style.setProperty('--color-text-muted', p.textMuted);

  root.style.setProperty('--color-accent', p.accent);
  root.style.setProperty('--color-accent-hover', p.accentHover);
  root.style.setProperty('--color-accent-magenta', p.accentMagenta);
  root.style.setProperty('--color-accent-yellow', p.accentYellow);
  root.style.setProperty('--color-accent-violet', p.accentViolet);

  root.style.setProperty('--color-cyan', p.cyan);
  root.style.setProperty('--color-success', p.success);
  root.style.setProperty('--color-warning', p.warning);
  root.style.setProperty('--color-danger', p.danger);

  root.style.setProperty('--glass-rgb', p.glassRgb);
  root.style.setProperty('--accent-rgb', p.accentRgb);
  root.style.setProperty('--accent-magenta-rgb', p.accentMagentaRgb);
  root.style.setProperty('--accent-violet-rgb', p.accentVioletRgb);
}
