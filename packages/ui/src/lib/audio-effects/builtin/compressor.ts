/**
 * @module compressor
 * Dynamics compressor effect using DynamicsCompressorNode.
 */

import type { AudioEffect, EffectDefinition, EffectFactory, EffectParam } from '../effect-types';

export const compressorDefinition: EffectDefinition = {
  id: 'compressor',
  name: 'Compressor',
  category: 'dynamics',
  description: 'Reduces dynamic range — evens out loud and quiet parts.',
  defaultParams: {
    threshold: { value: -24, min: -100, max: 0, step: 1, label: 'Threshold', unit: 'dB' },
    ratio:     { value: 4, min: 1, max: 20, step: 0.5, label: 'Ratio', unit: 'x' },
    knee:      { value: 30, min: 0, max: 40, step: 1, label: 'Knee', unit: 'dB' },
    attack:    { value: 0.003, min: 0, max: 1, step: 0.001, label: 'Attack', unit: 's' },
    release:   { value: 0.25, min: 0, max: 1, step: 0.01, label: 'Release', unit: 's' },
  },
};

export const createCompressor: EffectFactory = (ctx, instanceId, initialParams) => {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const compressor = ctx.createDynamicsCompressor();
  const bypass = ctx.createGain();

  // Clone default params
  const params: Record<string, EffectParam> = {};
  for (const [k, v] of Object.entries(compressorDefinition.defaultParams)) {
    params[k] = { ...v, value: initialParams?.[k] ?? v.value };
  }

  // Apply initial params
  compressor.threshold.value = params.threshold.value;
  compressor.ratio.value = params.ratio.value;
  compressor.knee.value = params.knee.value;
  compressor.attack.value = params.attack.value;
  compressor.release.value = params.release.value;

  // Wire: input → compressor → output
  input.connect(compressor);
  compressor.connect(output);

  let isBypassed = false;

  const effect: AudioEffect = {
    definition: compressorDefinition,
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
        case 'ratio':     compressor.ratio.value = value; break;
        case 'knee':      compressor.knee.value = value; break;
        case 'attack':    compressor.attack.value = value; break;
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
