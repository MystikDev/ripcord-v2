/**
 * @module icon
 * Centralized icon component for consistent sizing and stroke widths.
 * Wraps inline SVG icons with standard size presets.
 */
'use client';

import type { ReactNode } from 'react';
import clsx from 'clsx';

const SIZE_MAP = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
  xl: 24,
} as const;

interface IconProps {
  size?: keyof typeof SIZE_MAP;
  className?: string;
  children: ReactNode;
}

/**
 * Wraps an SVG icon with consistent sizing. Pass the SVG as children.
 * The wrapper sets width/height on the container and passes size context.
 */
export function Icon({ size = 'md', className, children }: IconProps) {
  const px = SIZE_MAP[size];
  return (
    <span
      className={clsx('inline-flex items-center justify-center shrink-0', className)}
      style={{ width: px, height: px }}
    >
      {children}
    </span>
  );
}

// ─── Common Icons ─── //
// These are the most-used icons across the app, centralized here to avoid
// defining them inline in every component.

export function IconHash({ size = 'md', className }: { size?: keyof typeof SIZE_MAP; className?: string }) {
  const px = SIZE_MAP[size];
  return (
    <svg width={px} height={px} viewBox="0 0 16 16" fill="currentColor" className={className}>
      <path d="M2.5 3.5A1.5 1.5 0 014 2h8a1.5 1.5 0 011.5 1.5v7A1.5 1.5 0 0112 12H5.5L2.5 14.5v-11z" />
    </svg>
  );
}

export function IconMic({ size = 'md', className }: { size?: keyof typeof SIZE_MAP; className?: string }) {
  const px = SIZE_MAP[size];
  return (
    <svg width={px} height={px} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="5.5" y="1" width="5" height="8" rx="2.5" />
      <path d="M3 7.5a5 5 0 0 0 10 0" />
      <path d="M8 12v2.5" />
      <path d="M5.5 14.5h5" />
    </svg>
  );
}

export function IconSettings({ size = 'md', className }: { size?: keyof typeof SIZE_MAP; className?: string }) {
  const px = SIZE_MAP[size];
  return (
    <svg width={px} height={px} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" />
    </svg>
  );
}

export function IconPin({ size = 'md', className }: { size?: keyof typeof SIZE_MAP; className?: string }) {
  const px = SIZE_MAP[size];
  return (
    <svg width={px} height={px} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M9.828 1.172a1 1 0 011.414 0l3.586 3.586a1 1 0 010 1.414L12 9l-1 4-4-4-4.5 4.5M7 9L2.172 4.172l2.828-2.829L9.828 6" />
    </svg>
  );
}

export function IconBookmark({ size = 'md', className, filled }: { size?: keyof typeof SIZE_MAP; className?: string; filled?: boolean }) {
  const px = SIZE_MAP[size];
  return (
    <svg width={px} height={px} viewBox="0 0 16 16" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 2h10a1 1 0 011 1v12l-6-3-6 3V3a1 1 0 011-1z" />
    </svg>
  );
}

export function IconReply({ size = 'md', className }: { size?: keyof typeof SIZE_MAP; className?: string }) {
  const px = SIZE_MAP[size];
  return (
    <svg width={px} height={px} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M6 8L2 5l4-3" />
      <path d="M2 5h8a4 4 0 014 4v2" />
    </svg>
  );
}

export function IconTrash({ size = 'md', className }: { size?: keyof typeof SIZE_MAP; className?: string }) {
  const px = SIZE_MAP[size];
  return (
    <svg width={px} height={px} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 9a1 1 0 001 1h6a1 1 0 001-1l1-9" />
    </svg>
  );
}

export function IconEdit({ size = 'md', className }: { size?: keyof typeof SIZE_MAP; className?: string }) {
  const px = SIZE_MAP[size];
  return (
    <svg width={px} height={px} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M11.5 2.5a1.414 1.414 0 012 2L5 13H2v-3L11.5 2.5z" />
    </svg>
  );
}

export function IconClose({ size = 'md', className }: { size?: keyof typeof SIZE_MAP; className?: string }) {
  const px = SIZE_MAP[size];
  return (
    <svg width={px} height={px} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={className}>
      <path d="M2 2l12 12M14 2L2 14" />
    </svg>
  );
}

export function IconPlus({ size = 'md', className }: { size?: keyof typeof SIZE_MAP; className?: string }) {
  const px = SIZE_MAP[size];
  return (
    <svg width={px} height={px} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className={className}>
      <path d="M8 2v12M2 8h12" />
    </svg>
  );
}

export function IconChevronLeft({ size = 'md', className }: { size?: keyof typeof SIZE_MAP; className?: string }) {
  const px = SIZE_MAP[size];
  return (
    <svg width={px} height={px} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M10 3L5 8l5 5" />
    </svg>
  );
}
