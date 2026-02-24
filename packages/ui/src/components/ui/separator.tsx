/**
 * @module Separator
 * Decorative divider built on Radix UI Separator primitives.
 * Renders as a 1px-tall horizontal rule or a 1px-wide vertical rule.
 */
'use client';

import * as SeparatorPrimitive from '@radix-ui/react-separator';
import clsx from 'clsx';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SeparatorProps {
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Separator({ orientation = 'horizontal', className }: SeparatorProps) {
  return (
    <SeparatorPrimitive.Root
      orientation={orientation}
      decorative
      className={clsx(
        'shrink-0 bg-border',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        className,
      )}
    />
  );
}
