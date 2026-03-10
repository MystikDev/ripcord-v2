/**
 * @module empty-state
 * Reusable empty state component with space-themed illustrations.
 * Used when channels, messages, or selections are empty.
 */
'use client';

import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, subtitle, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center select-none">
      <div className="mb-4 text-text-muted/40">
        {icon}
      </div>
      <h3 className="display-text text-base font-medium text-text-secondary mb-1.5">
        {title}
      </h3>
      {subtitle && (
        <p className="text-sm text-text-muted max-w-xs">
          {subtitle}
        </p>
      )}
      {action && (
        <div className="mt-4">
          {action}
        </div>
      )}
    </div>
  );
}

/* ─── Preset Icons ─── */

/** Satellite dish — for "no channels" state */
export function SatelliteIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-60">
      <circle cx="24" cy="24" r="4" />
      <path d="M24 8a16 16 0 0116 16" opacity="0.3" />
      <path d="M24 14a10 10 0 0110 10" opacity="0.5" />
      <path d="M14 34l-4 4" />
      <path d="M10 38l8-8" />
      <circle cx="10" cy="38" r="2" fill="currentColor" opacity="0.4" />
    </svg>
  );
}

/** Radio waves — for "no messages" state */
export function RadioWavesIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-60">
      <circle cx="24" cy="24" r="3" fill="currentColor" opacity="0.4" />
      <path d="M18.5 18.5a8 8 0 0111 0" opacity="0.7" />
      <path d="M15 15a13 13 0 0118 0" opacity="0.5" />
      <path d="M11.5 11.5a18 18 0 0125 0" opacity="0.3" />
      <path d="M18.5 29.5a8 8 0 0011 0" opacity="0.7" />
      <path d="M15 33a13 13 0 0018 0" opacity="0.5" />
      <path d="M11.5 36.5a18 18 0 0025 0" opacity="0.3" />
    </svg>
  );
}

/** Compass — for "no channel selected" state */
export function CompassIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-60">
      <circle cx="24" cy="24" r="18" opacity="0.3" />
      <circle cx="24" cy="24" r="12" opacity="0.5" />
      <polygon points="20,20 28,16 28,28 20,32" fill="currentColor" opacity="0.3" />
      <polygon points="20,20 16,28 28,28 32,20" fill="none" strokeWidth="1" opacity="0.6" />
      <circle cx="24" cy="24" r="2" fill="currentColor" opacity="0.5" />
    </svg>
  );
}
