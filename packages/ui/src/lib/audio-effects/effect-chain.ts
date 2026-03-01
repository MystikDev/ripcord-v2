/**
 * @module effect-chain
 * Manages an ordered chain of AudioEffect instances.
 *
 * Sits between per-user GainNodes and the EQ chain in voice-audio-renderer.
 * When the chain is empty, input routes directly to output (wire-through).
 *
 * Usage:
 *   const chain = new EffectChain(audioContext);
 *   // per-user gainNode.connect(chain.input);
 *   // chain.output.connect(eqBassFilter);
 *   chain.addEffect('compressor');
 *   chain.addEffect('delay');
 */

import type {
  AudioEffect,
  EffectChainConfig,
  EffectInstanceConfig,
} from './effect-types';
import { getEffectFactory } from './builtin';

// ---------------------------------------------------------------------------
// Simple ID generator (avoids crypto.randomUUID which isn't available in all
// AudioWorklet scopes, though we're on the main thread here).
// ---------------------------------------------------------------------------

let _idCounter = 0;
function generateId(): string {
  return `fx_${Date.now().toString(36)}_${(++_idCounter).toString(36)}`;
}

// ---------------------------------------------------------------------------
// EffectChain
// ---------------------------------------------------------------------------

export class EffectChain {
  /** Connect per-user GainNodes here. */
  readonly input: GainNode;
  /** Connect this to the EQ chain (or destination). */
  readonly output: GainNode;

  private ctx: AudioContext;
  private effects: AudioEffect[] = [];
  private onChange: (() => void) | null = null;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();

    // Empty chain: wire-through
    this.input.connect(this.output);
  }

  /** Register a callback that fires whenever the chain structure changes. */
  setOnChange(cb: (() => void) | null): void {
    this.onChange = cb;
  }

  /** Current number of effects in the chain. */
  get length(): number {
    return this.effects.length;
  }

  /** Get the ordered list of active effects (read-only snapshot). */
  getEffects(): readonly AudioEffect[] {
    return this.effects;
  }

  // -----------------------------------------------------------------------
  // Mutations
  // -----------------------------------------------------------------------

  /**
   * Add an effect to the chain.
   * @param definitionId  Built-in effect id (e.g. 'compressor')
   * @param index         Insert position. Defaults to end of chain.
   * @param initialParams Optional initial parameter overrides.
   * @returns The instance ID of the created effect, or null on failure.
   */
  addEffect(
    definitionId: string,
    index?: number,
    initialParams?: Record<string, number>,
  ): string | null {
    const factory = getEffectFactory(definitionId);
    if (!factory) {
      console.warn(`[EffectChain] Unknown effect: ${definitionId}`);
      return null;
    }

    const instanceId = generateId();
    const effect = factory(this.ctx, instanceId, initialParams);

    const insertAt = index !== undefined ? Math.min(index, this.effects.length) : this.effects.length;
    this.effects.splice(insertAt, 0, effect);

    this.rewire();
    this.onChange?.();
    return instanceId;
  }

  /** Remove an effect by instance ID. */
  removeEffect(instanceId: string): boolean {
    const idx = this.effects.findIndex((e) => e.instanceId === instanceId);
    if (idx === -1) return false;

    const [removed] = this.effects.splice(idx, 1);
    removed.dispose();

    this.rewire();
    this.onChange?.();
    return true;
  }

  /** Move an effect to a new position in the chain. */
  moveEffect(instanceId: string, newIndex: number): boolean {
    const idx = this.effects.findIndex((e) => e.instanceId === instanceId);
    if (idx === -1) return false;

    const [effect] = this.effects.splice(idx, 1);
    const clamped = Math.min(newIndex, this.effects.length);
    this.effects.splice(clamped, 0, effect);

    this.rewire();
    this.onChange?.();
    return true;
  }

  /** Update a parameter on a specific effect instance. */
  setParam(instanceId: string, key: string, value: number): void {
    const effect = this.effects.find((e) => e.instanceId === instanceId);
    if (!effect) return;
    effect.setParam(key, value);
    this.onChange?.();
  }

  /** Toggle bypass on a specific effect instance. */
  setBypassed(instanceId: string, bypassed: boolean): void {
    const effect = this.effects.find((e) => e.instanceId === instanceId);
    if (!effect) return;
    effect.setBypassed(bypassed);
    this.onChange?.();
  }

  // -----------------------------------------------------------------------
  // Serialisation
  // -----------------------------------------------------------------------

  /** Serialise the chain state for persistence. */
  getConfig(): EffectChainConfig {
    return {
      effects: this.effects.map((e) => ({
        id: e.definition.id,
        instanceId: e.instanceId,
        params: Object.fromEntries(
          Object.entries(e.params).map(([k, v]) => [k, v.value]),
        ),
        bypassed: e.bypassed,
      })),
    };
  }

  /** Restore chain state from a saved config. */
  loadConfig(config: EffectChainConfig): void {
    // Dispose all existing effects
    for (const e of this.effects) e.dispose();
    this.effects = [];

    // Recreate from config
    for (const item of config.effects) {
      const factory = getEffectFactory(item.id);
      if (!factory) {
        console.warn(`[EffectChain] Skipping unknown effect in config: ${item.id}`);
        continue;
      }

      const effect = factory(this.ctx, item.instanceId, item.params);
      if (item.bypassed) effect.setBypassed(true);
      this.effects.push(effect);
    }

    this.rewire();
    this.onChange?.();
  }

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  /** Tear down everything. */
  dispose(): void {
    for (const e of this.effects) e.dispose();
    this.effects = [];
    try {
      this.input.disconnect();
      this.output.disconnect();
    } catch { /* ignore */ }
  }

  // -----------------------------------------------------------------------
  // Internal wiring
  // -----------------------------------------------------------------------

  /**
   * Disconnect everything and rewire the chain from scratch.
   * This is O(n) where n = number of effects, but n is typically < 10
   * and this only runs on add/remove/move — never on param change.
   */
  private rewire(): void {
    // Disconnect input from everything
    try { this.input.disconnect(); } catch { /* ignore */ }

    if (this.effects.length === 0) {
      // Empty chain: wire-through
      this.input.connect(this.output);
      return;
    }

    // input → first effect
    this.input.connect(this.effects[0].input);

    // Chain effects together
    for (let i = 0; i < this.effects.length - 1; i++) {
      try { this.effects[i].output.disconnect(); } catch { /* ignore */ }
      this.effects[i].output.connect(this.effects[i + 1].input);
    }

    // Last effect → output
    const last = this.effects[this.effects.length - 1];
    try { last.output.disconnect(); } catch { /* ignore */ }
    last.output.connect(this.output);
  }
}
