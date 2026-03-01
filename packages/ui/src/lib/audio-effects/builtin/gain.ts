/**
 * @module gain
 * Simple gain/volume utility effect.
 */

import type { AudioEffect, EffectDefinition, EffectFactory, EffectParam } from '../effect-types';

export const gainDefinition: EffectDefinition = {
  id: 'gain',
  name: 'Gain',
  category: 'utility',
  description: 'Adjusts volume level — boost or cut the signal.',
  defaultParams: {
    gain: { value: 0, min: -24, max: 24, step: 0.5, label: 'Gain', unit: 'dB' },
  },
};

export const createGain: EffectFactory = (ctx, instanceId, initialParams) => {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const gainNode = ctx.createGain();
  const bypassNode = ctx.createGain();

  const params: Record<string, EffectParam> = {};
  for (const [k, v] of Object.entries(gainDefinition.defaultParams)) {
    params[k] = { ...v, value: initialParams?.[k] ?? v.value };
  }

  // Convert dB to linear gain
  gainNode.gain.value = Math.pow(10, params.gain.value / 20);

  input.connect(gainNode);
  gainNode.connect(output);

  let isBypassed = false;

  const effect: AudioEffect = {
    definition: gainDefinition,
    instanceId,
    input,
    output,
    bypassed: isBypassed,
    params,

    setParam(key, value) {
      if (!params[key]) return;
      params[key] = { ...params[key], value };
      if (key === 'gain') {
        gainNode.gain.value = Math.pow(10, value / 20);
      }
    },

    setBypassed(b) {
      isBypassed = b;
      effect.bypassed = b;
      if (b) {
        input.disconnect();
        input.connect(bypassNode);
        bypassNode.connect(output);
      } else {
        input.disconnect();
        bypassNode.disconnect();
        input.connect(gainNode);
        gainNode.connect(output);
      }
    },

    dispose() {
      try {
        input.disconnect();
        gainNode.disconnect();
        bypassNode.disconnect();
        output.disconnect();
      } catch { /* ignore */ }
    },
  };

  return effect;
};
