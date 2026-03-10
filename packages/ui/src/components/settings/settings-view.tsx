/**
 * @module settings-view
 * Full settings page replacing the chat area when open. Tabbed sidebar
 * navigation with Account, Appearance, Voice & Audio, and About sections.
 */
'use client';

import { useState, useEffect } from 'react';
import { useSettingsStore } from '../../stores/settings-store';
import { useAuthStore } from '../../stores/auth-store';
import { Avatar } from '../ui/avatar';
import { ConfirmDialog } from '../ui/confirm-dialog';
import { getAppVersion } from '../../lib/constants';

// ---------------------------------------------------------------------------
// Color presets (shared with appearance-settings.tsx)
// ---------------------------------------------------------------------------

const COLOR_PRESETS = [
  { label: 'Default', value: null, hex: '#E8ECF4' },
  { label: 'Warm White', value: '#FFF5E6', hex: '#FFF5E6' },
  { label: 'Cool Blue', value: '#B8D4E3', hex: '#B8D4E3' },
  { label: 'Mint', value: '#A8E6CF', hex: '#A8E6CF' },
  { label: 'Soft Pink', value: '#FFB3BA', hex: '#FFB3BA' },
  { label: 'Lavender', value: '#C9B1FF', hex: '#C9B1FF' },
  { label: 'Gold', value: '#FFD700', hex: '#FFD700' },
  { label: 'Amber', value: '#FBBF24', hex: '#FBBF24' },
];

const CHAT_TEXT_COLOR_PRESETS = [
  { label: 'Default', value: null, hex: '#B0B7C3' },
  { label: 'White', value: '#E8ECF4', hex: '#E8ECF4' },
  { label: 'Warm White', value: '#FFF5E6', hex: '#FFF5E6' },
  { label: 'Cool Blue', value: '#B8D4E3', hex: '#B8D4E3' },
  { label: 'Mint', value: '#A8E6CF', hex: '#A8E6CF' },
  { label: 'Soft Pink', value: '#FFB3BA', hex: '#FFB3BA' },
  { label: 'Lavender', value: '#C9B1FF', hex: '#C9B1FF' },
  { label: 'Gold', value: '#FFD700', hex: '#FFD700' },
];

const USERNAME_COLOR_PRESETS = [
  { label: 'Default', value: null, hex: '#E8ECF4' },
  { label: 'Cyan', value: '#2EE6FF', hex: '#2EE6FF' },
  { label: 'Coral', value: '#FF6B6B', hex: '#FF6B6B' },
  { label: 'Mint', value: '#A8E6CF', hex: '#A8E6CF' },
  { label: 'Lavender', value: '#C9B1FF', hex: '#C9B1FF' },
  { label: 'Gold', value: '#FFD700', hex: '#FFD700' },
  { label: 'Sky Blue', value: '#87CEEB', hex: '#87CEEB' },
  { label: 'Peach', value: '#FFAB91', hex: '#FFAB91' },
];

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------

const TABS = [
  { id: 'account', label: 'Account' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'audio', label: 'Voice & Audio' },
  { id: 'about', label: 'About' },
] as const;

// Tab icon SVGs
function TabIcon({ id }: { id: string }) {
  switch (id) {
    case 'account':
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="8" cy="5" r="3" />
          <path d="M2 14a6 6 0 0112 0" />
        </svg>
      );
    case 'appearance':
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="8" cy="8" r="3" />
          <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" />
        </svg>
      );
    case 'audio':
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="5.5" y="1" width="5" height="8" rx="2.5" />
          <path d="M3 7.5a5 5 0 0 0 10 0" />
          <path d="M8 12v2.5" />
          <path d="M5.5 14.5h5" />
        </svg>
      );
    case 'about':
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="8" cy="8" r="7" />
          <path d="M8 11V8" />
          <circle cx="8" cy="5" r="0.5" fill="currentColor" stroke="none" />
        </svg>
      );
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Account Tab
// ---------------------------------------------------------------------------

function AccountTab() {
  const handle = useAuthStore((s) => s.handle);
  const userId = useAuthStore((s) => s.userId);
  const avatarUrl = useAuthStore((s) => s.avatarUrl);

  return (
    <div>
      <h3 className="text-lg font-semibold text-text-primary mb-6">Account</h3>

      <div className="rounded-xl border border-white/5 bg-surface-1/30 p-6">
        <div className="flex items-center gap-4 mb-6">
          <Avatar
            src={avatarUrl ?? undefined}
            fallback={handle ?? '??'}
            size="lg"
            className="h-16 w-16 text-lg"
          />
          <div className="min-w-0">
            <p className="text-lg font-semibold text-text-primary truncate">{handle ?? 'Unknown'}</p>
            <p className="text-sm text-text-muted truncate">User ID: {userId ?? 'N/A'}</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-text-muted uppercase tracking-wider">Display Name</label>
            <p className="mt-1 text-sm text-text-primary">{handle ?? 'Not set'}</p>
          </div>
        </div>
      </div>

      <p className="mt-4 text-xs text-text-muted">
        Profile editing coming soon. For now, your display name and avatar are set during account creation.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Appearance Tab
// ---------------------------------------------------------------------------

function AppearanceTab() {
  const fontSize = useSettingsStore((s) => s.fontSize);
  const fontColor = useSettingsStore((s) => s.fontColor);
  const iconSize = useSettingsStore((s) => s.iconSize);
  const usernameColor = useSettingsStore((s) => s.usernameColor);
  const chatTextColor = useSettingsStore((s) => s.chatTextColor);
  const setFontSize = useSettingsStore((s) => s.setFontSize);
  const setFontColor = useSettingsStore((s) => s.setFontColor);
  const setIconSize = useSettingsStore((s) => s.setIconSize);
  const setUsernameColor = useSettingsStore((s) => s.setUsernameColor);
  const setChatTextColor = useSettingsStore((s) => s.setChatTextColor);
  const compactMode = useSettingsStore((s) => s.compactMode);
  const setCompactMode = useSettingsStore((s) => s.setCompactMode);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const handleResetConfirm = () => {
    setFontSize(14);
    setFontColor(null);
    setIconSize(32);
    setUsernameColor(null);
    setChatTextColor(null);
    setShowResetConfirm(false);
  };

  return (
    <div>
      <h3 className="text-lg font-semibold text-text-primary mb-6">Appearance</h3>

      {/* Font Size */}
      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <label className="text-sm font-medium text-text-secondary">Font Size</label>
          <span className="text-sm font-medium text-text-primary">{fontSize}px</span>
        </div>
        <input
          type="range"
          min={12}
          max={20}
          step={1}
          value={fontSize}
          onChange={(e) => setFontSize(Number(e.target.value))}
          className="w-full accent-accent h-1.5 cursor-pointer"
        />
        <div className="mt-1 flex justify-between text-sm text-text-muted">
          <span>12px</span>
          <span>16px</span>
          <span>20px</span>
        </div>
      </div>

      {/* Icon / Avatar Size */}
      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <label className="text-sm font-medium text-text-secondary">Icon Size</label>
          <span className="text-sm font-medium text-text-primary">{iconSize}px</span>
        </div>
        <input
          type="range"
          min={24}
          max={64}
          step={2}
          value={iconSize}
          onChange={(e) => setIconSize(Number(e.target.value))}
          className="w-full accent-accent h-1.5 cursor-pointer"
        />
        <div className="mt-1 flex justify-between text-sm text-text-muted">
          <span>24px</span>
          <span>44px</span>
          <span>64px</span>
        </div>
      </div>

      {/* Text Color */}
      <div className="mb-6">
        <label className="mb-2 block text-sm font-medium text-text-secondary">Text Color</label>
        <div className="flex flex-wrap gap-2">
          {COLOR_PRESETS.map((preset) => (
            <button
              key={preset.label}
              onClick={() => setFontColor(preset.value)}
              className={`flex h-10 items-center gap-1.5 rounded-md border px-3 text-xs transition-colors ${
                (preset.value === fontColor || (preset.value === null && fontColor === null))
                  ? 'border-accent bg-accent/10 text-text-primary'
                  : 'border-border bg-surface-2 text-text-secondary hover:border-text-muted'
              }`}
              title={preset.label}
            >
              <span
                className="h-3.5 w-3.5 rounded-full border border-border"
                style={{ backgroundColor: preset.hex }}
              />
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Username Color */}
      <div className="mb-6">
        <label className="mb-2 block text-sm font-medium text-text-secondary">Username Color</label>
        <div className="flex flex-wrap gap-2">
          {USERNAME_COLOR_PRESETS.map((preset) => (
            <button
              key={preset.label}
              onClick={() => setUsernameColor(preset.value)}
              className={`flex h-10 items-center gap-1.5 rounded-md border px-3 text-xs transition-colors ${
                (preset.value === usernameColor || (preset.value === null && usernameColor === null))
                  ? 'border-accent bg-accent/10 text-text-primary'
                  : 'border-border bg-surface-2 text-text-secondary hover:border-text-muted'
              }`}
              title={preset.label}
            >
              <span
                className="h-3.5 w-3.5 rounded-full border border-border"
                style={{ backgroundColor: preset.hex }}
              />
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chat Text Color */}
      <div className="mb-6">
        <label className="mb-2 block text-sm font-medium text-text-secondary">Chat Text Color</label>
        <div className="flex flex-wrap gap-2">
          {CHAT_TEXT_COLOR_PRESETS.map((preset) => (
            <button
              key={preset.label}
              onClick={() => setChatTextColor(preset.value)}
              className={`flex h-10 items-center gap-1.5 rounded-md border px-3 text-xs transition-colors ${
                (preset.value === chatTextColor || (preset.value === null && chatTextColor === null))
                  ? 'border-accent bg-accent/10 text-text-primary'
                  : 'border-border bg-surface-2 text-text-secondary hover:border-text-muted'
              }`}
              title={preset.label}
            >
              <span
                className="h-3.5 w-3.5 rounded-full border border-border"
                style={{ backgroundColor: preset.hex }}
              />
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Compact Mode */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <label className="text-sm font-medium text-text-secondary">Compact Mode</label>
          <p className="text-[11px] text-text-muted mt-0.5">Hide avatars and use single-line message layout</p>
        </div>
        <button
          onClick={() => setCompactMode(!compactMode)}
          className={`relative h-5 w-9 rounded-full transition-colors ${
            compactMode ? 'bg-accent' : 'bg-surface-3'
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
              compactMode ? 'translate-x-4' : ''
            }`}
          />
        </button>
      </div>

      {/* Preview */}
      <div className="mb-6 rounded-lg bg-surface-2 p-3">
        <p className="text-xs text-text-muted mb-2">Preview</p>
        <div className="flex items-center gap-3">
          <div
            className="shrink-0 rounded-full bg-surface-3 flex items-center justify-center font-medium text-text-secondary"
            style={{
              width: `${iconSize}px`,
              height: `${iconSize}px`,
              fontSize: `${Math.max(10, Math.round(iconSize * 0.35))}px`,
            }}
          >
            AB
          </div>
          <div className="min-w-0">
            <span
              className="font-medium block"
              style={{
                fontSize: `${fontSize}px`,
                color: usernameColor ?? '#E8ECF4',
              }}
            >
              SampleUser
            </span>
            <p
              style={{
                fontSize: `${fontSize}px`,
                color: chatTextColor ?? fontColor ?? undefined,
              }}
              className="text-text-secondary"
            >
              The quick brown fox jumps over the lazy dog.
            </p>
          </div>
        </div>
      </div>

      {/* Reset */}
      <button
        onClick={() => setShowResetConfirm(true)}
        className="w-full rounded-lg border border-border px-4 py-2 text-sm text-text-muted transition-colors hover:bg-surface-2 hover:text-text-secondary"
      >
        Reset to Defaults
      </button>

      {/* Tutorial */}
      <div className="space-y-3 mt-6">
        <h3 className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/35">
          Tutorial
        </h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-mono text-[12px] text-text-primary">Quick Tour</p>
            <p className="font-mono text-[10px] text-text-muted">Replay the onboarding tutorial</p>
          </div>
          <button
            type="button"
            onClick={() => {
              useSettingsStore.getState().triggerTour();
            }}
            className="rounded-lg border border-white/8 bg-white/5 px-4 py-2 font-mono text-[10px] text-text-secondary transition-all duration-150 hover:border-accent/30 hover:bg-accent/10 hover:text-accent cursor-pointer"
          >
            Replay Tour
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={showResetConfirm}
        onOpenChange={setShowResetConfirm}
        title="Reset Appearance"
        description="All appearance settings will be restored to their default values."
        confirmLabel="Reset"
        variant="danger"
        onConfirm={handleResetConfirm}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Voice & Audio Tab
// ---------------------------------------------------------------------------

function AudioTab() {
  const noiseSuppressionEnabled = useSettingsStore((s) => s.noiseSuppressionEnabled);
  const noiseSuppressionStrength = useSettingsStore((s) => s.noiseSuppressionStrength);
  const setNoiseSuppressionEnabled = useSettingsStore((s) => s.setNoiseSuppressionEnabled);
  const setNoiseSuppressionStrength = useSettingsStore((s) => s.setNoiseSuppressionStrength);
  const voiceNotificationSounds = useSettingsStore((s) => s.voiceNotificationSounds);
  const setVoiceNotificationSounds = useSettingsStore((s) => s.setVoiceNotificationSounds);
  const pttEnabled = useSettingsStore((s) => s.pttEnabled);
  const setPttEnabled = useSettingsStore((s) => s.setPttEnabled);
  const pttKey = useSettingsStore((s) => s.pttKey);

  const eqEnabled = useSettingsStore((s) => s.eqEnabled);
  const eqBass = useSettingsStore((s) => s.eqBass);
  const eqMid = useSettingsStore((s) => s.eqMid);
  const eqTreble = useSettingsStore((s) => s.eqTreble);
  const setEqEnabled = useSettingsStore((s) => s.setEqEnabled);
  const setEqBass = useSettingsStore((s) => s.setEqBass);
  const setEqMid = useSettingsStore((s) => s.setEqMid);
  const setEqTreble = useSettingsStore((s) => s.setEqTreble);
  const resetEq = useSettingsStore((s) => s.resetEq);

  const strengthLabel =
    noiseSuppressionStrength === 0 ? 'Off' : noiseSuppressionStrength <= 33 ? 'Low' : noiseSuppressionStrength <= 66 ? 'Medium' : 'High';

  const pttKeyLabel = pttKey === ' ' ? 'Space' : pttKey;

  return (
    <div>
      <h3 className="text-lg font-semibold text-text-primary mb-6">Voice & Audio</h3>

      <p className="text-xs text-text-muted mb-6">
        Device selection (microphone and speaker) is available in the voice panel when connected to a voice channel.
      </p>

      {/* Push to Talk */}
      <div className="mb-6 rounded-xl border border-white/5 bg-surface-1/30 p-4">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-text-secondary">Push to Talk</label>
          <button
            onClick={() => setPttEnabled(!pttEnabled)}
            className={`relative h-5 w-9 rounded-full transition-colors ${
              pttEnabled ? 'bg-accent' : 'bg-surface-3'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                pttEnabled ? 'translate-x-4' : ''
              }`}
            />
          </button>
        </div>
        {pttEnabled && (
          <p className="text-xs text-text-muted">
            Current key: <span className="text-text-secondary font-mono">{pttKeyLabel}</span>
          </p>
        )}
      </div>

      {/* Noise Suppression */}
      <div className="mb-6 rounded-xl border border-white/5 bg-surface-1/30 p-4">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-text-secondary">Noise Suppression</label>
          <button
            onClick={() => setNoiseSuppressionEnabled(!noiseSuppressionEnabled)}
            className={`relative h-5 w-9 rounded-full transition-colors ${
              noiseSuppressionEnabled ? 'bg-accent' : 'bg-surface-3'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                noiseSuppressionEnabled ? 'translate-x-4' : ''
              }`}
            />
          </button>
        </div>
        {noiseSuppressionEnabled && (
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-text-muted">Strength</span>
              <span className="text-[11px] font-medium text-text-secondary">{strengthLabel}</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={noiseSuppressionStrength}
              onChange={(e) => setNoiseSuppressionStrength(Number(e.target.value))}
              className="w-full accent-accent h-1.5 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-text-muted mt-1">
              <span>Off</span>
              <span>Low</span>
              <span>Medium</span>
              <span>High</span>
            </div>
          </div>
        )}
      </div>

      {/* Voice Notification Sounds */}
      <div className="mb-6 rounded-xl border border-white/5 bg-surface-1/30 p-4">
        <div className="flex items-center justify-between">
          <div>
            <label className="text-sm font-medium text-text-secondary">Join/Leave Sounds</label>
            <p className="text-[11px] text-text-muted mt-0.5">Play chime when users join or leave voice</p>
          </div>
          <button
            onClick={() => setVoiceNotificationSounds(!voiceNotificationSounds)}
            className={`relative h-5 w-9 rounded-full transition-colors ${
              voiceNotificationSounds ? 'bg-accent' : 'bg-surface-3'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                voiceNotificationSounds ? 'translate-x-4' : ''
              }`}
            />
          </button>
        </div>
      </div>

      {/* Equalizer */}
      <div className="mb-6 rounded-xl border border-white/5 bg-surface-1/30 p-4">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-text-secondary">Equalizer</label>
          <button
            onClick={() => setEqEnabled(!eqEnabled)}
            className={`relative h-5 w-9 rounded-full transition-colors ${
              eqEnabled ? 'bg-accent' : 'bg-surface-3'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                eqEnabled ? 'translate-x-4' : ''
              }`}
            />
          </button>
        </div>
        {eqEnabled && (
          <div className="space-y-3 mt-3">
            <EqSlider label="Bass" value={eqBass} onChange={setEqBass} />
            <EqSlider label="Mid" value={eqMid} onChange={setEqMid} />
            <EqSlider label="Treble" value={eqTreble} onChange={setEqTreble} />
            {(eqBass !== 0 || eqMid !== 0 || eqTreble !== 0) && (
              <button
                onClick={resetEq}
                className="self-end rounded px-2 py-1 text-[11px] text-text-muted transition-colors hover:bg-surface-3 hover:text-text-secondary"
              >
                Reset to Flat
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Reusable EQ band slider for the audio tab. */
function EqSlider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const displayValue = value > 0 ? `+${value}` : `${value}`;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] text-text-muted">{label}</span>
        <span className="text-[11px] font-medium text-text-secondary">{displayValue} dB</span>
      </div>
      <input
        type="range"
        min={-12}
        max={12}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-accent h-1.5 cursor-pointer"
      />
      <div className="flex justify-between text-[10px] text-text-muted">
        <span>-12</span>
        <span>0</span>
        <span>+12</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// About Tab
// ---------------------------------------------------------------------------

function AboutTab() {
  const version = getAppVersion();

  return (
    <div>
      <h3 className="text-lg font-semibold text-text-primary mb-6">About</h3>

      <div className="rounded-xl border border-white/5 bg-surface-1/30 p-6 text-center">
        {/* Logo / title */}
        <div className="mb-4">
          <h2 className="text-2xl font-bold display-text text-text-primary tracking-wide">RIPCORD</h2>
          <p className="text-sm text-text-muted mt-1">Communication, reimagined.</p>
        </div>

        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-surface-2/50 px-4 py-1.5 mb-6">
          <span className="text-xs text-text-muted">Version</span>
          <span className="text-xs font-mono text-text-primary">{version}</span>
        </div>

        <p className="text-sm text-text-muted max-w-md mx-auto leading-relaxed">
          Ripcord is a modern communication platform with real-time text, voice chat, and spatial hub navigation. Built for communities that demand more.
        </p>
      </div>

      {/* Links */}
      <div className="mt-6 space-y-2">
        <div className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-text-muted">
          <span>Build</span>
          <span className="font-mono text-text-secondary">{version}</span>
        </div>
        <div className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-text-muted">
          <span>Platform</span>
          <span className="font-mono text-text-secondary">Desktop</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings View (main export)
// ---------------------------------------------------------------------------

export function SettingsView() {
  const activeTab = useSettingsStore((s) => s.settingsTab);
  const closeSettings = useSettingsStore((s) => s.closeSettings);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') closeSettings();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [closeSettings]);

  return (
    <div className="flex h-full flex-1">
      {/* Sidebar */}
      <div className="w-52 border-r border-white/5 bg-surface-1/30 backdrop-blur-sm p-4 flex flex-col">
        <h2 className="display-text text-lg font-semibold text-text-primary mb-4">Settings</h2>
        <nav className="space-y-1 flex-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => useSettingsStore.getState().openSettings(tab.id)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                activeTab === tab.id
                  ? 'bg-white/10 text-text-primary'
                  : 'text-text-muted hover:bg-white/5 hover:text-text-secondary'
              }`}
            >
              <TabIcon id={tab.id} />
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Close button at bottom */}
        <button
          onClick={closeSettings}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-text-muted hover:bg-white/5 hover:text-text-secondary transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M12 4L4 12M4 4l8 8" />
          </svg>
          Close Settings
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8 max-w-2xl">
        {activeTab === 'account' && <AccountTab />}
        {activeTab === 'appearance' && <AppearanceTab />}
        {activeTab === 'audio' && <AudioTab />}
        {activeTab === 'about' && <AboutTab />}
      </div>

      {/* Close X button in top-right */}
      <button
        onClick={closeSettings}
        className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-md text-text-muted hover:bg-white/5 hover:text-text-primary transition-colors z-10"
        title="Close Settings"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M4 4l8 8M12 4l-8 8" />
        </svg>
      </button>
    </div>
  );
}
