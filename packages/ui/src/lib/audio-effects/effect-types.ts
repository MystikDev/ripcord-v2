/**
 * @module effect-types
 * Core type definitions for the audio effects plugin framework.
 * All built-in effects implement the AudioEffect interface.
 */

// ---------------------------------------------------------------------------
// Parameter definition
// ---------------------------------------------------------------------------

export interface EffectParam {
  value: number;
  min: number;
  max: number;
  step: number;
  label: string;
  unit?: string; // 'dB', 'Hz', 'ms', '%', 'x'
}

// ---------------------------------------------------------------------------
// Effect definition (static metadata for a type of effect)
// ---------------------------------------------------------------------------

export interface EffectDefinition {
  /** Unique identifier, e.g. 'compressor', 'delay'. */
  id: string;
  /** Human-readable name, e.g. 'Compressor'. */
  name: string;
  /** Category for grouping in UI. */
  category: 'dynamics' | 'filter' | 'time' | 'utility';
  /** Short description of what the effect does. */
  description: string;
  /** Default parameter values for a new instance. */
  defaultParams: Record<string, EffectParam>;
}

// ---------------------------------------------------------------------------
// Effect instance (live audio processing unit)
// ---------------------------------------------------------------------------

export interface AudioEffect {
  /** The definition this instance was created from. */
  definition: EffectDefinition;
  /** Unique instance ID (for distinguishing multiple instances of the same type). */
  instanceId: string;
  /** Connect incoming audio here. */
  input: AudioNode;
  /** Audio comes out here → next effect or EQ chain. */
  output: AudioNode;
  /** Whether the effect is bypassed (dry passthrough). */
  bypassed: boolean;
  /** Current parameter state. */
  params: Record<string, EffectParam>;
  /** Update a single parameter. */
  setParam(key: string, value: number): void;
  /** Toggle bypass. When bypassed, input connects directly to output. */
  setBypassed(bypassed: boolean): void;
  /** Tear down all Web Audio nodes. */
  dispose(): void;
}

// ---------------------------------------------------------------------------
// Factory function type (each built-in effect exports one)
// ---------------------------------------------------------------------------

export type EffectFactory = (
  ctx: AudioContext,
  instanceId: string,
  initialParams?: Record<string, number>,
) => AudioEffect;

// ---------------------------------------------------------------------------
// Serialised chain config (for persistence)
// ---------------------------------------------------------------------------

export interface EffectInstanceConfig {
  /** Effect definition id, e.g. 'compressor'. */
  id: string;
  /** Unique per-instance ID. */
  instanceId: string;
  /** Param key → value overrides. */
  params: Record<string, number>;
  /** Whether bypassed. */
  bypassed: boolean;
}

export interface EffectChainConfig {
  effects: EffectInstanceConfig[];
}
