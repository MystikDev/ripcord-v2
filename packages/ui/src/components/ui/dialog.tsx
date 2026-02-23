'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';
import clsx from 'clsx';

// ---------------------------------------------------------------------------
// Root re-exports
// ---------------------------------------------------------------------------

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

export interface DialogContentProps {
  children: ReactNode;
  title: string;
  description?: string;
  className?: string;
}

export function DialogContent({
  children,
  title,
  description,
  className,
}: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      {/* Overlay */}
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />

      {/* Content */}
      <DialogPrimitive.Content
        className={clsx(
          'fixed left-1/2 top-1/2 z-50 w-full max-w-md max-h-[85vh] -translate-x-1/2 -translate-y-1/2',
          'overflow-y-auto rounded-xl border border-border bg-surface-1 p-6 shadow-2xl',
          'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
          className,
        )}
      >
        <DialogPrimitive.Title className="text-lg font-semibold text-text-primary">
          {title}
        </DialogPrimitive.Title>
        {description && (
          <DialogPrimitive.Description className="mt-1 text-sm text-text-secondary">
            {description}
          </DialogPrimitive.Description>
        )}
        <div className="mt-4">{children}</div>

        {/* Close button */}
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-md p-1 text-text-muted hover:text-text-primary transition-colors">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M4 4l8 8M12 4l-8 8"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
