/**
 * @module Avatar
 * Circular user avatar built on Radix UI Avatar primitives.
 * Displays an image with a fallback showing the first two characters of the provided string.
 * Supports sm, md, and lg sizes. Pass `style` to override sizes with CSS variables.
 */
'use client';

import * as AvatarPrimitive from '@radix-ui/react-avatar';
import clsx from 'clsx';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface AvatarProps {
  src?: string;
  alt?: string;
  fallback: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  style?: React.CSSProperties;
}

const sizeMap = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
} as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Avatar({ src, alt, fallback, size = 'md', className, style }: AvatarProps) {
  return (
    <AvatarPrimitive.Root
      className={clsx(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-3',
        sizeMap[size],
        className,
      )}
      style={style}
    >
      {src && (
        <AvatarPrimitive.Image
          src={src}
          alt={alt ?? fallback}
          className="h-full w-full object-cover"
        />
      )}
      <AvatarPrimitive.Fallback
        className="flex h-full w-full items-center justify-center font-medium text-text-secondary"
        delayMs={src ? 600 : 0}
      >
        {fallback.slice(0, 2).toUpperCase()}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}
