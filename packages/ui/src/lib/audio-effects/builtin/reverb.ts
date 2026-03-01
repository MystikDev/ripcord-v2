/**
 * @module reverb
 * Convolution reverb effect using a synthetically generated impulse response.
 * Wet/dry mix via parallel signal paths.
 */

import type { AudioEffect, EffectDefinition, EffectFactory, EffectParam } from '../effect-types';

export const reverbDefinition: EffectDefinition = {
  id: 'reverb',
  name: 'Reverb',
  category: 'time',
  description: 'Adds room ambience — from small rooms to large halls.',
  defaultParams: {
    decay: { value: 1.5, min: 0.1, max: 6, step: 0.1, label: 'Decay', unit: 's' },
    mix:   { value: 0.3, min: 0, max: 1, step: 0.01, label: 'Mix', unit: '%' },
  },
};

/**
 * Generate a synthetic impulse response (exponential decay noise).
 * This avoids needing to ship external IR files.
 */
function generateIR(ctx: AudioContext, decay: number): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = Math.floor(sampleRate * decay);
  const buffer = ctx.createBuffer(2, length, sampleRate);

  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      // White noise × exponential decay
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2);
    }
  }

  return buffer;
}

export const createReverb: EffectFactory = (ctx, instanceId, initialParams) => {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const bypassNode = ctx.createGain();

  const dryGain = ctx.createGain();
  const wetGain = ctx.createGain();
  const convolver = ctx.createConvolver();

  const params: Record<string, EffectParam> = {};
  for (const [k, v] of Object.entries(reverbDefinition.defaultParams)) {
    params[k] = { ...v, value: initialParams?.[k] ?? v.value };
  }

  // Generate initial IR
  convolver.buffer = generateIR(ctx, params.decay.value);

  const mix = params.mix.value;
  dryGain.gain.value = 1 - mix;
  wetGain.gain.value = mix;

  // Wire: input → dry → output
  //       input → convolver → wet → output
  input.connect(dryGain);
  dryGain.connect(output);

  input.connect(convolver);
  convolver.connect(wetGain);
  wetGain.connect(output);

  let isBypassed = false;

  const effect: AudioEffect = {
    definition: reverbDefinition,
    instanceId,
    input,
    output,
    bypassed: isBypassed,
    params,

    setParam(key, value) {
      if (!params[key]) return;
      params[key] = { ...params[key], value };
      switch (key) {
        case 'decay':
          convolver.buffer = generateIR(ctx, value);
          break;
        case 'mix':
          dryGain.gain.value = 1 - value;
          wetGain.gain.value = value;
          break;
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
        input.connect(dryGain);
        dryGain.connect(output);
        input.connect(convolver);
      }
    },

    dispose() {
      try {
        input.disconnect();
        dryGain.disconnect();
        convolver.disconnect();
        wetGain.disconnect();
        bypassNode.disconnect();
        output.disconnect();
      } catch { /* ignore */ }
    },
  };

  return effect;
};
