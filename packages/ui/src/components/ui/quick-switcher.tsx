/**
 * @module quick-switcher
 * Ctrl+K / Cmd+K overlay for quickly jumping between hubs, channels, and DMs.
 * Fuzzy text search across all loaded data with arrow-key navigation.
 */
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useHubStore, type Hub, type Channel, type DmChannel } from '../../stores/server-store';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SwitcherItem {
  id: string;
  label: string;
  sublabel?: string;
  group: 'Hubs' | 'Channels' | 'Direct Messages';
  onSelect: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Simple case-insensitive substring match. */
function matches(text: string, query: string): boolean {
  return text.toLowerCase().includes(query.toLowerCase());
}

function buildItems(
  hubs: Hub[],
  channels: Channel[],
  dmChannels: DmChannel[],
  setActiveHub: (id: string) => void,
  setActiveChannel: (id: string) => void,
  setActiveDmChannel: (id: string) => void,
): SwitcherItem[] {
  const items: SwitcherItem[] = [];

  for (const hub of hubs) {
    items.push({
      id: `hub:${hub.id}`,
      label: hub.name,
      group: 'Hubs',
      onSelect: () => setActiveHub(hub.id),
    });
  }

  for (const ch of channels) {
    const hubName = hubs.find((h) => h.id === ch.hubId)?.name;
    items.push({
      id: `ch:${ch.id}`,
      label: `#${ch.name}`,
      sublabel: hubName,
      group: 'Channels',
      onSelect: () => setActiveChannel(ch.id),
    });
  }

  for (const dm of dmChannels) {
    const otherNames = dm.participants.map((p) => p.handle).join(', ');
    items.push({
      id: `dm:${dm.channelId}`,
      label: otherNames || 'DM',
      group: 'Direct Messages',
      onSelect: () => setActiveDmChannel(dm.channelId),
    });
  }

  return items;
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-text-muted">
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5L14 14" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface QuickSwitcherProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function QuickSwitcher({ open, onOpenChange }: QuickSwitcherProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Store data
  const hubs = useHubStore((s) => s.hubs);
  const channels = useHubStore((s) => s.channels);
  const dmChannels = useHubStore((s) => s.dmChannels);
  const setActiveHub = useHubStore((s) => s.setActiveHub);
  const setActiveChannel = useHubStore((s) => s.setActiveChannel);
  const setActiveDmChannel = useHubStore((s) => s.setActiveDmChannel);

  // Build + filter items
  const allItems = useMemo(
    () => buildItems(hubs, channels, dmChannels, setActiveHub, setActiveChannel, setActiveDmChannel),
    [hubs, channels, dmChannels, setActiveHub, setActiveChannel, setActiveDmChannel],
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return allItems;
    return allItems.filter(
      (item) => matches(item.label, query) || (item.sublabel && matches(item.sublabel, query)),
    );
  }, [allItems, query]);

  // Reset state when opening
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      // Focus input after dialog animation
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Clamp selection when results change
  useEffect(() => {
    setSelectedIndex((prev) => Math.min(prev, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const selectItem = useCallback(
    (item: SwitcherItem) => {
      item.onSelect();
      onOpenChange(false);
    },
    [onOpenChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filtered[selectedIndex]) {
          selectItem(filtered[selectedIndex]);
        }
      }
    },
    [filtered, selectedIndex, selectItem],
  );

  // Group items for rendering
  const groups = useMemo(() => {
    const map = new Map<string, { items: SwitcherItem[]; startIndex: number }>();
    let idx = 0;
    for (const item of filtered) {
      let group = map.get(item.group);
      if (!group) {
        group = { items: [], startIndex: idx };
        map.set(item.group, group);
      }
      group.items.push(item);
      idx++;
    }
    return map;
  }, [filtered]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-[20%] z-50 w-full max-w-lg -translate-x-1/2 rounded-xl border border-border bg-surface-1 shadow-2xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
          onKeyDown={handleKeyDown}
        >
          {/* Visually hidden title for a11y */}
          <DialogPrimitive.Title className="sr-only">Quick Switcher</DialogPrimitive.Title>

          {/* Search input */}
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <SearchIcon />
            <input
              ref={inputRef}
              type="text"
              placeholder="Where would you like to go?"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedIndex(0);
              }}
              className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none"
            />
            <kbd className="hidden rounded bg-surface-3 px-1.5 py-0.5 text-[10px] text-text-muted sm:inline-block">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div ref={listRef} className="max-h-80 overflow-y-auto p-2">
            {filtered.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-text-muted">
                No results found
              </p>
            ) : (
              Array.from(groups.entries()).map(([groupName, { items, startIndex }]) => (
                <div key={groupName}>
                  <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                    {groupName}
                  </p>
                  {items.map((item, i) => {
                    const globalIndex = startIndex + i;
                    const isSelected = globalIndex === selectedIndex;
                    return (
                      <button
                        key={item.id}
                        data-index={globalIndex}
                        onClick={() => selectItem(item)}
                        onMouseEnter={() => setSelectedIndex(globalIndex)}
                        className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                          isSelected
                            ? 'bg-accent/15 text-text-primary'
                            : 'text-text-secondary hover:bg-surface-2'
                        }`}
                      >
                        <span className="truncate font-medium">{item.label}</span>
                        {item.sublabel && (
                          <span className="truncate text-xs text-text-muted">
                            {item.sublabel}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          {/* Footer hint */}
          <div className="flex items-center gap-3 border-t border-border px-4 py-2 text-[10px] text-text-muted">
            <span><kbd className="rounded bg-surface-3 px-1 py-0.5">↑↓</kbd> navigate</span>
            <span><kbd className="rounded bg-surface-3 px-1 py-0.5">↵</kbd> select</span>
            <span><kbd className="rounded bg-surface-3 px-1 py-0.5">esc</kbd> close</span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
