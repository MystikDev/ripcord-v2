/**
 * @module keyboard-shortcuts-dialog
 * Cheatsheet overlay listing all keyboard shortcuts. Opens with '?' key.
 */
'use client';

import { useEffect, useState, useCallback } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';

const SHORTCUT_SECTIONS = [
  {
    title: 'Navigation',
    shortcuts: [
      { keys: ['Ctrl', 'K'], description: 'Quick switcher' },
      { keys: ['Escape'], description: 'Close panel / dialog' },
    ],
  },
  {
    title: 'Messages',
    shortcuts: [
      { keys: ['Enter'], description: 'Send message' },
      { keys: ['Shift', 'Enter'], description: 'New line' },
      { keys: ['/'], description: 'AI commands' },
    ],
  },
  {
    title: 'Voice',
    shortcuts: [
      { keys: ['Ctrl', 'Shift', 'M'], description: 'Toggle mute' },
      { keys: ['Ctrl', 'Shift', 'D'], description: 'Toggle deafen' },
    ],
  },
  {
    title: 'General',
    shortcuts: [
      { keys: ['?'], description: 'Show keyboard shortcuts' },
    ],
  },
];

// Detect platform for modifier key display
const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);

function formatKey(key: string): string {
  if (key === 'Ctrl') return isMac ? '\u2318' : 'Ctrl';
  if (key === 'Shift') return isMac ? '\u21E7' : 'Shift';
  if (key === 'Alt') return isMac ? '\u2325' : 'Alt';
  if (key === 'Escape') return 'Esc';
  if (key === 'Enter') return '\u21B5';
  return key;
}

function KeyBadge({ children }: { children: string }) {
  return (
    <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-white/10 bg-white/5 px-1.5 font-mono text-[11px] text-text-secondary">
      {children}
    </kbd>
  );
}

export function KeyboardShortcutsDialog() {
  const [open, setOpen] = useState(false);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Don't trigger when typing in inputs
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if ((e.target as HTMLElement)?.isContentEditable) return;

    if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      setOpen((prev) => !prev);
    }
  }, []);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface-1 p-6 shadow-2xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95">
          <DialogPrimitive.Title className="text-lg font-semibold text-text-primary mb-5 display-text">
            Keyboard Shortcuts
          </DialogPrimitive.Title>

          <div className="space-y-5">
            {SHORTCUT_SECTIONS.map((section) => (
              <div key={section.title}>
                <h3 className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/35 mb-2">
                  {section.title}
                </h3>
                <div className="space-y-1.5">
                  {section.shortcuts.map((shortcut) => (
                    <div key={shortcut.description} className="flex items-center justify-between py-1">
                      <span className="text-sm text-text-secondary">{shortcut.description}</span>
                      <div className="flex items-center gap-1">
                        {shortcut.keys.map((key, i) => (
                          <span key={i} className="flex items-center gap-1">
                            {i > 0 && <span className="text-text-muted text-xs">+</span>}
                            <KeyBadge>{formatKey(key)}</KeyBadge>
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <DialogPrimitive.Close className="absolute right-4 top-4 rounded-md p-1 text-text-muted hover:bg-surface-2 hover:text-text-primary transition-colors">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M1 1l12 12M13 1L1 13" />
            </svg>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
