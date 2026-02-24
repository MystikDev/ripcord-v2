/**
 * @module command-palette
 * Autocomplete dropdown for slash commands. Appears when the composer input
 * starts with `/` and supports keyboard navigation (arrows, Enter/Tab, Escape).
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { matchCommands, type SlashCommand } from '../../lib/ai/commands';

interface CommandPaletteProps {
  input: string;
  onSelect: (command: SlashCommand) => void;
  onClose: () => void;
  visible: boolean;
}

export function CommandPalette({ input, onSelect, onClose, visible }: CommandPaletteProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const matches = matchCommands(input);

  useEffect(() => {
    setSelectedIndex(0);
  }, [input]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!visible) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, matches.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      if (matches[selectedIndex]) {
        onSelect(matches[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }, [visible, matches, selectedIndex, onSelect, onClose]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (!visible || matches.length === 0) return null;

  return (
    <div className="absolute bottom-full left-0 mb-1 w-72 rounded-lg border border-border bg-surface-2 py-1 shadow-lg">
      {matches.map((cmd, idx) => (
        <button
          key={cmd.name}
          onClick={() => onSelect(cmd)}
          className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors ${
            idx === selectedIndex ? 'bg-surface-3 text-text-primary' : 'text-text-secondary hover:bg-surface-3'
          }`}
        >
          <span className="flex h-6 w-6 items-center justify-center rounded bg-accent/10 text-xs font-bold text-accent">
            /
          </span>
          <div>
            <p className="font-medium">/{cmd.name}</p>
            <p className="text-xs text-text-muted">{cmd.description}</p>
          </div>
        </button>
      ))}
    </div>
  );
}
