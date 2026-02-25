/**
 * @module whats-new-dialog
 * Modal dialog shown after login when the app version has changed.
 * Displays release highlights and offers a "Don't show again" checkbox.
 */
'use client';

import { useState, useCallback } from 'react';
import { Dialog, DialogContent } from './dialog';
import { Button } from './button';
import type { ChangelogEntry } from '../../lib/changelog';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface WhatsNewDialogProps {
  open: boolean;
  onClose: (dontShowAgain: boolean) => void;
  entry: ChangelogEntry;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WhatsNewDialog({ open, onClose, entry }: WhatsNewDialogProps) {
  const [dontShow, setDontShow] = useState(false);

  const handleClose = useCallback(() => {
    onClose(dontShow);
  }, [onClose, dontShow]);

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) handleClose();
      }}
    >
      <DialogContent
        title={`What's New in v${entry.version}`}
        description={entry.date}
        className="max-w-lg"
      >
        <ul className="space-y-2">
          {entry.highlights.map((item, i) => (
            <li key={i} className="flex gap-2 text-sm text-text-secondary">
              <span className="mt-0.5 shrink-0 text-accent">&#x2022;</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>

        <div className="mt-6 flex items-center justify-between">
          <label className="flex items-center gap-2 text-xs text-text-muted cursor-pointer select-none">
            <input
              type="checkbox"
              checked={dontShow}
              onChange={(e) => setDontShow(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-border accent-accent"
            />
            Don&apos;t show update notes
          </label>

          <Button variant="primary" size="sm" onClick={handleClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
