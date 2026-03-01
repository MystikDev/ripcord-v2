/**
 * @module limiter
 * Hard limiter effect — a compressor with ratio=20 and knee=0.
 */

import type { AudioEffect, EffectDefinition, EffectFactory, EffectParam } from '../effect-types';

export const limiterDefinition: EffectDefinition = {
  id: 'limiter',
  name: 'Limiter',
  category: 'dynamics',
  description: 'Hard ceiling — prevents audio from exceeding a threshold.',
  defaultParams: {
    threshold: { value: -6, min: -60, max: 0, step: 0.5, label: 'Threshold', unit: 'dB' },
    release:   { value: 0.1, min: 0.01, max: 1, step: 0.01, label: 'Release', unit: 's' },
  },
};

export const createLimiter: EffectFactory = (ctx, instanceId, initialParams) => {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const compressor = ctx.createDynamicsCompressor();
  const bypass = ctx.createGain();

  // Hard limiter settings
  compressor.ratio.value = 20;
  compressor.knee.value = 0;
  compressor.attack.value = 0.001;

  const params: Record<string, EffectParam> = {};
  for (const [k, v] of Object.entries(limiterDefinition.defaultParams)) {
    params[k] = { ...v, value: initialParams?.[k] ?? v.value };
  }

  compressor.threshold.value = params.threshold.value;
  compressor.release.value = params.release.value;

  input.connect(compressor);
  compressor.connect(output);

  let isBypassed = false;

  const effect: AudioEffect = {
    definition: limiterDefinition,
    instanceId,
    input,
    output,
    bypassed: isBypassed,
    params,

    setParam(key, value) {
      if (!params[key]) return;
      params[key] = { ...params[key], value };
      switch (key) {
        case 'threshold': compressor.threshold.value = value; break;
        case 'release':   compressor.release.value = value; break;
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
        input.connect(compressor);
        compressor.connect(output);
      }
    },

    dispose() {
      try {
        input.disconnect();
        compressor.disconnect();
        bypass.disconnect();
        output.disconnect();
      } catch { /* ignore */ }
    },
  };

  return effect;
};
