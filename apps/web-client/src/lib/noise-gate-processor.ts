import { Track } from 'livekit-client';
import type { AudioProcessorOptions, TrackProcessor } from 'livekit-client';

// ---------------------------------------------------------------------------
// Noise Gate — LiveKit TrackProcessor implementation
//
// Monitors input audio RMS level via an AnalyserNode. When the level drops
// below a configurable threshold the GainNode fades to 0, silencing
// background noise. When it rises above the threshold the gain fades back
// to 1 so speech passes through.
//
// The `strength` value (0-100) controls the threshold:
//   0   → gate always open (no suppression)
//   100 → only loud speech passes through
//
// Typical RMS levels from getFloatTimeDomainData (normalised -1..1):
//   Silence / quiet room   : ~0.001 - 0.005
//   Background noise (fan) : ~0.005 - 0.02
//   Keyboard / mouse clicks: ~0.01  - 0.05
//   Normal speech           : ~0.02  - 0.15
//   Loud speech             : ~0.10  - 0.30
// ---------------------------------------------------------------------------

/** How fast the gate opens when speech is detected (gain increment per tick). */
const ATTACK_SPEED = 0.20;

/** How fast the gate closes after speech ends (gain decrement per tick). */
const RELEASE_SPEED = 0.06;

/**
 * After speech is detected the gate stays open for this many ticks before
 * starting to close. Prevents clipping the tails of words.
 * 7 ticks × 20 ms = 140 ms hold time.
 */
const HOLD_TICKS = 7;

/**
 * Hysteresis ratio — once the gate is open, the close threshold is this
 * fraction of the open threshold. Prevents rapid flutter at the boundary.
 */
const HYSTERESIS_RATIO = 0.6;

/**
 * Maps strength 0-100 → RMS open-threshold 0 → 0.15.
 *
 * The previous range (0-0.05) was far too conservative — background noise
 * from fans, keyboards etc. routinely sits above 0.05 RMS, so the gate
 * never actually closed. 0.15 at max strength means only clear speech
 * passes through.
 */
function strengthToThreshold(strength: number): number {
  return (strength / 100) * 0.15;
}

export class NoiseGateProcessor
  implements TrackProcessor<Track.Kind.Audio, AudioProcessorOptions>
{
  readonly name = 'noise-gate';

  // --- Web Audio nodes ---
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private gainNode: GainNode | null = null;
  private destinationNode: MediaStreamAudioDestinationNode | null = null;

  // --- Gate state ---
  private _strength = 50;
  private currentGain = 1.0;
  private gateOpen = true;
  private holdCounter = 0;
  private monitorTimerId: ReturnType<typeof setInterval> | null = null;
  private analyserBuffer: Float32Array<ArrayBuffer> | null = null;

  // --- Required by TrackProcessor ---
  processedTrack?: MediaStreamTrack;

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  async init(opts: AudioProcessorOptions): Promise<void> {
    const ctx = opts.audioContext ?? new AudioContext();
    this.audioContext = ctx;

    // Build the audio graph:
    // source → analyser → gain → destination
    this.sourceNode = ctx.createMediaStreamSource(new MediaStream([opts.track]));

    this.analyserNode = ctx.createAnalyser();
    this.analyserNode.fftSize = 2048;

    this.gainNode = ctx.createGain();
    this.gainNode.gain.value = 1.0;

    this.destinationNode = ctx.createMediaStreamDestination();

    this.sourceNode.connect(this.analyserNode);
    this.analyserNode.connect(this.gainNode);
    this.gainNode.connect(this.destinationNode);

    this.analyserBuffer = new Float32Array(this.analyserNode.fftSize);

    // Output track for LiveKit to publish
    const tracks = this.destinationNode.stream.getAudioTracks();
    this.processedTrack = tracks[0];

    // Start monitoring loop (setInterval, NOT rAF — rAF pauses on background tabs)
    this.currentGain = 1.0;
    this.gateOpen = true;
    this.holdCounter = 0;
    this.monitorTimerId = setInterval(this.monitorLoop, 20); // 50 Hz
  }

  async restart(opts: AudioProcessorOptions): Promise<void> {
    await this.destroy();
    await this.init(opts);
  }

  async destroy(): Promise<void> {
    if (this.monitorTimerId !== null) {
      clearInterval(this.monitorTimerId);
      this.monitorTimerId = null;
    }

    this.sourceNode?.disconnect();
    this.analyserNode?.disconnect();
    this.gainNode?.disconnect();

    if (this.processedTrack) {
      this.processedTrack.stop();
      this.processedTrack = undefined;
    }

    this.sourceNode = null;
    this.analyserNode = null;
    this.gainNode = null;
    this.destinationNode = null;
    this.audioContext = null;
    this.analyserBuffer = null;
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /** Update the gate threshold in real-time (no audio-chain rebuild). */
  setStrength(value: number): void {
    this._strength = Math.max(0, Math.min(100, value));
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  private monitorLoop = (): void => {
    if (!this.analyserNode || !this.gainNode || !this.analyserBuffer || !this.audioContext) return;

    // 1. Read time-domain waveform
    this.analyserNode.getFloatTimeDomainData(this.analyserBuffer);

    // 2. Calculate RMS
    let sumSquares = 0;
    for (let i = 0; i < this.analyserBuffer.length; i++) {
      const s = this.analyserBuffer[i]!;
      sumSquares += s * s;
    }
    const rms = Math.sqrt(sumSquares / this.analyserBuffer.length);

    // 3. Determine whether the gate should be open (with hysteresis)
    const openThreshold = strengthToThreshold(this._strength);
    const closeThreshold = openThreshold * HYSTERESIS_RATIO;

    if (rms > openThreshold) {
      // Signal above open threshold — open the gate and reset hold counter
      this.gateOpen = true;
      this.holdCounter = HOLD_TICKS;
    } else if (this.gateOpen && rms > closeThreshold) {
      // Between close and open threshold while gate is open — stay open (hysteresis)
      this.holdCounter = HOLD_TICKS;
    } else if (this.holdCounter > 0) {
      // Below close threshold but still in hold period — count down
      this.holdCounter--;
    } else {
      // Hold expired — close the gate
      this.gateOpen = false;
    }

    // 4. Smooth gain transitions (attack / release)
    if (this.gateOpen) {
      this.currentGain = Math.min(1.0, this.currentGain + ATTACK_SPEED);
    } else {
      this.currentGain = Math.max(0.0, this.currentGain - RELEASE_SPEED);
    }

    // 5. Apply via AudioParam exponential smoothing (avoids zipper noise)
    this.gainNode.gain.setTargetAtTime(
      this.currentGain,
      this.audioContext.currentTime,
      0.015, // time constant — ~15 ms exponential approach
    );
  };
}
