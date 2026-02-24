/**
 * @module ptt-keybind-dialog
 * Dialog for reassigning the push-to-talk keybind. Listens for the next
 * keydown or mousedown event, displays the captured key in a large tile,
 * and offers Save, Cancel, Reset, and Try Again actions.
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { Dialog, DialogTrigger, DialogContent, DialogClose } from '../ui/dialog';
import { Button } from '../ui/button';
import { useSettingsStore } from '../../stores/settings-store';
import { getKeyDisplayLabel, mouseButtonKey } from '../../lib/key-display';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PttKeybindDialog() {
  const pttKey = useSettingsStore((s) => s.pttKey);
  const setPttKey = useSettingsStore((s) => s.setPttKey);
  const resetPttKey = useSettingsStore((s) => s.resetPttKey);

  const [open, setOpen] = useState(false);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);

  // When dialog opens, enter listening mode
  useEffect(() => {
    if (open) {
      setPendingKey(null);
      setIsListening(true);
    } else {
      setIsListening(false);
      setPendingKey(null);
    }
  }, [open]);

  // Listen for a single keydown or mousedown when in listening mode
  useEffect(() => {
    if (!isListening) return;

    function handleKeyDown(e: KeyboardEvent) {
      e.preventDefault();
      e.stopPropagation();

      // Accept any key (including modifiers as standalone PTT keys)
      setPendingKey(e.key);
      setIsListening(false);
    }

    function handleMouseDown(e: MouseEvent) {
      // Ignore primary (left-click) — it's needed for dialog interaction.
      // Allow middle-click (1), right-click (2), and extra buttons (3, 4, etc.)
      if (e.button === 0) return;

      e.preventDefault();
      e.stopPropagation();

      setPendingKey(mouseButtonKey(e.button));
      setIsListening(false);
    }

    function handleContextMenu(e: MouseEvent) {
      // Prevent context menu while listening so right-click can be captured
      e.preventDefault();
    }

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    window.addEventListener('mousedown', handleMouseDown, { capture: true });
    window.addEventListener('contextmenu', handleContextMenu, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      window.removeEventListener('mousedown', handleMouseDown, { capture: true });
      window.removeEventListener('contextmenu', handleContextMenu, { capture: true });
    };
  }, [isListening]);

  const handleSave = useCallback(() => {
    if (pendingKey) {
      setPttKey(pendingKey);
    }
    setOpen(false);
  }, [pendingKey, setPttKey]);

  const handleReset = useCallback(() => {
    resetPttKey();
    setOpen(false);
  }, [resetPttKey]);

  const handleRetry = useCallback(() => {
    setPendingKey(null);
    setIsListening(true);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className="flex h-6 items-center rounded bg-surface-3 px-1.5 text-[10px] font-medium text-text-muted hover:bg-surface-2 hover:text-text-secondary transition-colors"
          title="Change PTT keybind"
        >
          {getKeyDisplayLabel(pttKey)}
        </button>
      </DialogTrigger>
      <DialogContent
        title="Push-to-Talk Keybind"
        description="Press any key or mouse button to set as your push-to-talk bind."
      >
        {/* Key capture display */}
        <div className="flex flex-col items-center gap-4 py-4">
          <div className="flex h-20 w-20 items-center justify-center rounded-xl border-2 border-dashed border-border bg-surface-2 text-xl font-bold text-text-primary">
            {isListening ? (
              <span className="animate-pulse text-sm text-text-muted">...</span>
            ) : pendingKey ? (
              getKeyDisplayLabel(pendingKey)
            ) : (
              getKeyDisplayLabel(pttKey)
            )}
          </div>

          {isListening && (
            <p className="text-xs text-text-muted">Listening for key or mouse button...</p>
          )}

          {pendingKey && !isListening && (
            <p className="text-xs text-text-secondary">
              New key: <span className="font-semibold">{getKeyDisplayLabel(pendingKey)}</span>
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={handleReset}>
            Reset to Default
          </Button>
          <div className="flex gap-2">
            {pendingKey && !isListening && (
              <Button variant="ghost" size="sm" onClick={handleRetry}>
                Try Again
              </Button>
            )}
            <DialogClose asChild>
              <Button variant="secondary" size="sm">
                Cancel
              </Button>
            </DialogClose>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!pendingKey || isListening}
            >
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
