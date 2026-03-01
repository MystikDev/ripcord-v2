/**
 * @module effects-panel
 * UI for managing the audio effects chain.
 * Shows the current chain as a vertical list of expandable cards,
 * with an "Add Effect" dropdown at the bottom.
 */
'use client';

import { useState, useCallback, useSyncExternalStore } from 'react';
import { Dialog, DialogTrigger, DialogContent } from '../ui/dialog';
import { Separator } from '../ui/separator';
import { EffectControls, BypassToggle } from './effect-controls';
import { getSharedEffectChain } from './voice-audio-renderer';
import { useEffectsStore } from '../../stores/effects-store';
import { builtinDefinitions } from '../../lib/audio-effects/builtin';
import type { AudioEffect, EffectDefinition } from '../../lib/audio-effects/effect-types';
import clsx from 'clsx';

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={clsx('transition-transform', open && 'rotate-90')}
    >
      <path d="M6 4l4 4-4 4" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 4h12M5.333 4V2.667a1.333 1.333 0 011.334-1.334h2.666a1.333 1.333 0 011.334 1.334V4m2 0v9.333a1.333 1.333 0 01-1.334 1.334H4.667a1.333 1.333 0 01-1.334-1.334V4h9.334z" />
    </svg>
  );
}

function ArrowUpIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 12V4M4 8l4-4 4 4" />
    </svg>
  );
}

function ArrowDownIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 4v8M4 8l4 4 4-4" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M8 3v10M3 8h10" />
    </svg>
  );
}

function EffectsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 4h3m2 0h7M2 8h7m2 0h3M2 12h5m2 0h5" />
      <circle cx="7" cy="4" r="1.5" fill="currentColor" />
      <circle cx="11" cy="8" r="1.5" fill="currentColor" />
      <circle cx="9" cy="12" r="1.5" fill="currentColor" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Category badge
// ---------------------------------------------------------------------------

const CATEGORY_COLORS: Record<string, string> = {
  dynamics: 'bg-orange-500/15 text-orange-400',
  filter: 'bg-blue-500/15 text-blue-400',
  time: 'bg-purple-500/15 text-purple-400',
  utility: 'bg-gray-500/15 text-gray-400',
};

function CategoryBadge({ category }: { category: string }) {
  return (
    <span className={clsx('rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase', CATEGORY_COLORS[category] || CATEGORY_COLORS.utility)}>
      {category}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Single effect card
// ---------------------------------------------------------------------------

function EffectCard({
  effect,
  index,
  total,
  onRemove,
  onMoveUp,
  onMoveDown,
  onToggleBypass,
  onParamChange,
}: {
  effect: AudioEffect;
  index: number;
  total: number;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onToggleBypass: () => void;
  onParamChange: (key: string, value: number) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className={clsx(
      'rounded-lg border transition-colors',
      effect.bypassed ? 'border-border/50 bg-surface-1/50' : 'border-border bg-surface-1',
    )}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-text-muted hover:text-text-secondary transition-colors"
        >
          <ChevronIcon open={expanded} />
        </button>

        <span className={clsx(
          'text-sm font-medium flex-1',
          effect.bypassed ? 'text-text-muted' : 'text-text-primary',
        )}>
          {effect.definition.name}
        </span>

        <CategoryBadge category={effect.definition.category} />

        <BypassToggle bypassed={effect.bypassed} onToggle={onToggleBypass} />

        {/* Reorder buttons */}
        <div className="flex gap-0.5">
          <button
            onClick={onMoveUp}
            disabled={index === 0}
            className="rounded p-0.5 text-text-muted hover:text-text-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Move up"
          >
            <ArrowUpIcon />
          </button>
          <button
            onClick={onMoveDown}
            disabled={index === total - 1}
            className="rounded p-0.5 text-text-muted hover:text-text-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Move down"
          >
            <ArrowDownIcon />
          </button>
        </div>

        <button
          onClick={onRemove}
          className="rounded p-1 text-text-muted hover:text-danger transition-colors"
          title="Remove effect"
        >
          <TrashIcon />
        </button>
      </div>

      {/* Expanded parameter controls */}
      {expanded && !effect.bypassed && (
        <div className="border-t border-border/50 px-3 py-2.5">
          <EffectControls params={effect.params} onParamChange={onParamChange} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add Effect Dropdown
// ---------------------------------------------------------------------------

function AddEffectDropdown({ onAdd }: { onAdd: (id: string) => void }) {
  const [open, setOpen] = useState(false);

  // Group definitions by category
  const grouped = builtinDefinitions.reduce<Record<string, EffectDefinition[]>>((acc, def) => {
    if (!acc[def.category]) acc[def.category] = [];
    acc[def.category].push(def);
    return acc;
  }, {});

  const categoryOrder = ['dynamics', 'filter', 'time', 'utility'];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-sm text-text-muted hover:border-accent hover:text-accent transition-colors"
      >
        <PlusIcon />
        Add Effect
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          {/* Dropdown */}
          <div className="absolute bottom-full left-0 right-0 z-50 mb-1 rounded-lg border border-border bg-surface-2 shadow-lg max-h-64 overflow-y-auto">
            {categoryOrder.map((cat) => {
              const defs = grouped[cat];
              if (!defs) return null;
              return (
                <div key={cat}>
                  <div className="px-3 py-1.5 text-[10px] font-semibold uppercase text-text-muted tracking-wider">
                    {cat}
                  </div>
                  {defs.map((def) => (
                    <button
                      key={def.id}
                      onClick={() => { onAdd(def.id); setOpen(false); }}
                      className="flex w-full flex-col px-3 py-2 hover:bg-surface-3 text-left transition-colors"
                    >
                      <span className="text-sm font-medium text-text-primary">{def.name}</span>
                      <span className="text-[11px] text-text-muted">{def.description}</span>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Preset Manager
// ---------------------------------------------------------------------------

function PresetManager() {
  const presets = useEffectsStore((s) => s.presets);
  const savePreset = useEffectsStore((s) => s.savePreset);
  const loadPreset = useEffectsStore((s) => s.loadPreset);
  const deletePreset = useEffectsStore((s) => s.deletePreset);
  const [saveName, setSaveName] = useState('');

  const presetNames = Object.keys(presets);
  const chain = getSharedEffectChain();

  const handleLoad = (name: string) => {
    const config = loadPreset(name);
    if (config && chain) {
      chain.loadConfig(config);
    }
  };

  const handleSave = () => {
    const trimmed = saveName.trim();
    if (!trimmed) return;
    savePreset(trimmed);
    setSaveName('');
  };

  return (
    <div className="flex flex-col gap-2">
      <label className="text-[11px] font-medium text-text-muted uppercase tracking-wider">
        Presets
      </label>

      {/* Load presets */}
      {presetNames.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {presetNames.map((name) => (
            <div key={name} className="flex items-center gap-0.5">
              <button
                onClick={() => handleLoad(name)}
                className="rounded bg-surface-3 px-2 py-1 text-[11px] text-text-secondary hover:bg-surface-2 transition-colors"
              >
                {name}
              </button>
              <button
                onClick={() => deletePreset(name)}
                className="rounded p-0.5 text-text-muted hover:text-danger text-[10px] transition-colors"
                title="Delete preset"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Save preset */}
      <div className="flex gap-1.5">
        <input
          type="text"
          value={saveName}
          onChange={(e) => setSaveName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          placeholder="Preset name..."
          className="flex-1 rounded border border-border bg-surface-2 px-2 py-1 text-[11px] text-text-primary outline-none placeholder:text-text-muted focus:border-accent"
        />
        <button
          onClick={handleSave}
          disabled={!saveName.trim()}
          className="rounded bg-accent/20 px-2 py-1 text-[11px] text-accent hover:bg-accent/30 disabled:opacity-40 transition-colors"
        >
          Save
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Effects Panel (rendered inside a Dialog)
// ---------------------------------------------------------------------------

function EffectsPanelContent() {
  const chain = getSharedEffectChain();

  // Subscribe to revision changes to trigger re-renders when chain mutates
  const revision = useEffectsStore((s) => s.revision);

  // Get the live effect list from the chain
  const effects = chain?.getEffects() ?? [];

  const handleAdd = useCallback((definitionId: string) => {
    chain?.addEffect(definitionId);
  }, [chain]);

  const handleRemove = useCallback((instanceId: string) => {
    chain?.removeEffect(instanceId);
  }, [chain]);

  const handleMoveUp = useCallback((instanceId: string, index: number) => {
    if (index > 0) chain?.moveEffect(instanceId, index - 1);
  }, [chain]);

  const handleMoveDown = useCallback((instanceId: string, index: number) => {
    if (chain && index < chain.length - 1) chain.moveEffect(instanceId, index + 1);
  }, [chain]);

  const handleToggleBypass = useCallback((instanceId: string, currentlyBypassed: boolean) => {
    chain?.setBypassed(instanceId, !currentlyBypassed);
  }, [chain]);

  const handleParamChange = useCallback((instanceId: string, key: string, value: number) => {
    chain?.setParam(instanceId, key, value);
  }, [chain]);

  const handleClearAll = useCallback(() => {
    if (!chain) return;
    const all = [...chain.getEffects()];
    for (const e of all) chain.removeEffect(e.instanceId);
  }, [chain]);

  return (
    <div className="flex flex-col gap-3 py-1">
      {/* Signal flow label */}
      {effects.length > 0 && (
        <div className="text-[10px] text-text-muted uppercase tracking-wider text-center">
          Signal Flow: Input → {effects.map((e) => e.definition.name).join(' → ')} → EQ → Output
        </div>
      )}

      {/* Effect cards */}
      <div className="flex flex-col gap-2 max-h-[50vh] overflow-y-auto pr-1">
        {effects.map((effect, index) => (
          <EffectCard
            key={effect.instanceId}
            effect={effect}
            index={index}
            total={effects.length}
            onRemove={() => handleRemove(effect.instanceId)}
            onMoveUp={() => handleMoveUp(effect.instanceId, index)}
            onMoveDown={() => handleMoveDown(effect.instanceId, index)}
            onToggleBypass={() => handleToggleBypass(effect.instanceId, effect.bypassed)}
            onParamChange={(key, value) => handleParamChange(effect.instanceId, key, value)}
          />
        ))}
      </div>

      {effects.length === 0 && (
        <div className="py-4 text-center text-sm text-text-muted">
          No effects in chain. Add one below.
        </div>
      )}

      {/* Add effect button */}
      <AddEffectDropdown onAdd={handleAdd} />

      {/* Clear all */}
      {effects.length > 0 && (
        <button
          onClick={handleClearAll}
          className="self-center rounded px-2 py-1 text-[11px] text-text-muted hover:text-danger hover:bg-surface-3 transition-colors"
        >
          Clear All Effects
        </button>
      )}

      <Separator />

      {/* Presets */}
      <PresetManager />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exported Dialog Trigger (used in audio-settings.tsx)
// ---------------------------------------------------------------------------

export function EffectsPanel() {
  const [open, setOpen] = useState(false);
  const effectCount = useEffectsStore((s) => s.chainConfig.effects.length);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="flex w-full items-center justify-between rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary hover:bg-surface-3 transition-colors">
          <span className="flex items-center gap-2">
            <EffectsIcon />
            Audio Effects
          </span>
          {effectCount > 0 && (
            <span className="rounded-full bg-accent/20 px-1.5 py-0.5 text-[10px] font-medium text-accent">
              {effectCount}
            </span>
          )}
        </button>
      </DialogTrigger>
      <DialogContent
        title="Audio Effects"
        description="Add and configure audio processing effects for incoming voice."
      >
        <EffectsPanelContent />
      </DialogContent>
    </Dialog>
  );
}
