/**
 * @module low-pass
 * Low-pass filter — cuts frequencies above the cutoff.
 */

import type { AudioEffect, EffectDefinition, EffectFactory, EffectParam } from '../effect-types';

export const lowPassDefinition: EffectDefinition = {
  id: 'low-pass',
  name: 'Low-Pass Filter',
  category: 'filter',
  description: 'Cuts high frequencies — makes audio sound warmer/darker.',
  defaultParams: {
    frequency: { value: 4000, min: 100, max: 20000, step: 10, label: 'Cutoff', unit: 'Hz' },
    q:         { value: 1, min: 0.1, max: 18, step: 0.1, label: 'Resonance', unit: 'Q' },
  },
};

export const createLowPass: EffectFactory = (ctx, instanceId, initialParams) => {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  const bypass = ctx.createGain();

  filter.type = 'lowpass';

  const params: Record<string, EffectParam> = {};
  for (const [k, v] of Object.entries(lowPassDefinition.defaultParams)) {
    params[k] = { ...v, value: initialParams?.[k] ?? v.value };
  }

  filter.frequency.value = params.frequency.value;
  filter.Q.value = params.q.value;

  input.connect(filter);
  filter.connect(output);

  let isBypassed = false;

  const effect: AudioEffect = {
    definition: lowPassDefinition,
    instanceId,
    input,
    output,
    bypassed: isBypassed,
    params,

    setParam(key, value) {
      if (!params[key]) return;
      params[key] = { ...params[key], value };
      switch (key) {
        case 'frequency': filter.frequency.value = value; break;
        case 'q':         filter.Q.value = value; break;
      }
    },

    setBypassed(b) {
      isBypassed = b;
      effect.bypassed = b;
      if (b) {
        input.disconnect();
        input.connect(bypass);
        bypass.connect(output);
      } else {
        input.disconnect();
        bypass.disconnect();
        input.connect(filter);
        filter.connect(output);
      }
    },

    dispose() {
      try {
        input.disconnect();
        filter.disconnect();
        bypass.disconnect();
        output.disconnect();
      } catch { /* ignore */ }
    },
  };

  return effect;
};
