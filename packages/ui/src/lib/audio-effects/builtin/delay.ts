/**
 * @module delay
 * Stereo delay effect with feedback using DelayNode + GainNode.
 * Wet/dry mix controlled via parallel dry and wet paths.
 */

import type { AudioEffect, EffectDefinition, EffectFactory, EffectParam } from '../effect-types';

export const delayDefinition: EffectDefinition = {
  id: 'delay',
  name: 'Delay',
  category: 'time',
  description: 'Echo effect — repeats audio after a short time.',
  defaultParams: {
    time:     { value: 0.25, min: 0.01, max: 2, step: 0.01, label: 'Time', unit: 's' },
    feedback: { value: 0.3, min: 0, max: 0.9, step: 0.01, label: 'Feedback', unit: '%' },
    mix:      { value: 0.3, min: 0, max: 1, step: 0.01, label: 'Mix', unit: '%' },
  },
};

export const createDelay: EffectFactory = (ctx, instanceId, initialParams) => {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const bypassNode = ctx.createGain();

  // Dry path
  const dryGain = ctx.createGain();
  // Wet path
  const delayNode = ctx.createDelay(5); // max 5s
  const feedbackGain = ctx.createGain();
  const wetGain = ctx.createGain();

  const params: Record<string, EffectParam> = {};
  for (const [k, v] of Object.entries(delayDefinition.defaultParams)) {
    params[k] = { ...v, value: initialParams?.[k] ?? v.value };
  }

  delayNode.delayTime.value = params.time.value;
  feedbackGain.gain.value = params.feedback.value;
  const mix = params.mix.value;
  dryGain.gain.value = 1 - mix;
  wetGain.gain.value = mix;

  // Wire: input → dry → output
  //       input → delay → wet → output
  //                delay → feedback → delay (loop)
  input.connect(dryGain);
  dryGain.connect(output);

  input.connect(delayNode);
  delayNode.connect(wetGain);
  wetGain.connect(output);

  delayNode.connect(feedbackGain);
  feedbackGain.connect(delayNode);

  let isBypassed = false;

  const effect: AudioEffect = {
    definition: delayDefinition,
    instanceId,
    input,
    output,
    bypassed: isBypassed,
    params,

    setParam(key, value) {
      if (!params[key]) return;
      params[key] = { ...params[key], value };
      switch (key) {
        case 'time':     delayNode.delayTime.value = value; break;
        case 'feedback': feedbackGain.gain.value = value; break;
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
        input.connect(delayNode);
      }
    },

    dispose() {
      try {
        input.disconnect();
        dryGain.disconnect();
        delayNode.disconnect();
        feedbackGain.disconnect();
        wetGain.disconnect();
        bypassNode.disconnect();
        output.disconnect();
      } catch { /* ignore */ }
    },
  };

  return effect;
};
