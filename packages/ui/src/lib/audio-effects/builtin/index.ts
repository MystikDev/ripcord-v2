/**
 * @module builtin/index
 * Registry of all built-in audio effects.
 */

import type { EffectDefinition, EffectFactory } from '../effect-types';

import { compressorDefinition, createCompressor } from './compressor';
import { limiterDefinition, createLimiter } from './limiter';
import { lowPassDefinition, createLowPass } from './low-pass';
import { highPassDefinition, createHighPass } from './high-pass';
import { delayDefinition, createDelay } from './delay';
import { reverbDefinition, createReverb } from './reverb';
import { gainDefinition, createGain } from './gain';

// ---------------------------------------------------------------------------
// Definition registry (for UI listing)
// ---------------------------------------------------------------------------

export const builtinDefinitions: EffectDefinition[] = [
  compressorDefinition,
  limiterDefinition,
  lowPassDefinition,
  highPassDefinition,
  delayDefinition,
  reverbDefinition,
  gainDefinition,
];

// ---------------------------------------------------------------------------
// Factory registry (for creating instances)
// ---------------------------------------------------------------------------

const factoryMap: Record<string, EffectFactory> = {
  compressor: createCompressor,
  limiter: createLimiter,
  'low-pass': createLowPass,
  'high-pass': createHighPass,
  delay: createDelay,
  reverb: createReverb,
  gain: createGain,
};

/**
 * Look up a factory function by definition id.
 * Returns undefined if the id is not recognised.
 */
export function getEffectFactory(id: string): EffectFactory | undefined {
  return factoryMap[id];
}

/**
 * Look up a definition by id.
 */
export function getEffectDefinition(id: string): EffectDefinition | undefined {
  return builtinDefinitions.find((d) => d.id === id);
}
