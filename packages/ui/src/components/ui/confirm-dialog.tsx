/**
 * @module ConfirmDialog
 * Reusable confirmation dialog with danger/default variants.
 * Built on Radix UI Dialog primitives with glassmorphism styling
 * matching the existing Dialog component pattern.
 */
'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Button } from './button';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
  onConfirm: () => void;
  loading?: boolean;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  onConfirm,
  loading,
}: ConfirmDialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <DialogPrimitive.Content
          className={
            'fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 ' +
            'rounded-xl border border-border bg-surface-1 p-6 shadow-2xl ' +
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 ' +
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95'
          }
        >
          <DialogPrimitive.Title className="text-lg font-semibold text-text-primary">
            {title}
          </DialogPrimitive.Title>
          {description && (
            <DialogPrimitive.Description className="mt-1 text-sm text-text-secondary">
              {description}
            </DialogPrimitive.Description>
          )}
          <div className="mt-6 flex justify-end gap-3">
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="sm">
                {cancelLabel}
              </Button>
            </DialogPrimitive.Close>
            <Button
              variant={variant === 'danger' ? 'danger' : 'primary'}
              size="sm"
              onClick={() => {
                onConfirm();
                onOpenChange(false);
              }}
              loading={loading}
            >
              {confirmLabel}
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
