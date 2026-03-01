// ---------------------------------------------------------------------------
// Notification Sounds — Web Audio API tone synthesis
//
// Generates short chime tones for voice channel join/leave events.
// No external sound files needed — tones are synthesized on the fly.
//
// All functions are fire-and-forget and wrapped in try/catch so sound
// failures never disrupt app functionality.
// ---------------------------------------------------------------------------

/** Shared AudioContext instance, lazily created on first use. */
let audioCtx: AudioContext | null = null;

function getContext(): AudioContext | null {
  try {
    if (!audioCtx || audioCtx.state === 'closed') {
      audioCtx = new AudioContext();
    }
    // Resume if suspended (browsers require user gesture first)
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  } catch {
    return null;
  }
}

/**
 * Play a short two-note tone.
 *
 * @param freq1 - First note frequency (Hz)
 * @param freq2 - Second note frequency (Hz)
 * @param noteLength - Duration of each note in seconds
 */
function playTwoNoteTone(freq1: number, freq2: number, noteLength = 0.09): void {
  const ctx = getContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const volume = 0.15; // Subtle, not obnoxious

  // --- Note 1 ---
  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.type = 'sine';
  osc1.frequency.value = freq1;
  gain1.gain.setValueAtTime(volume, now);
  gain1.gain.exponentialRampToValueAtTime(0.001, now + noteLength);
  osc1.connect(gain1);
  gain1.connect(ctx.destination);
  osc1.start(now);
  osc1.stop(now + noteLength);

  // --- Note 2 (starts right after note 1) ---
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = 'sine';
  osc2.frequency.value = freq2;
  gain2.gain.setValueAtTime(volume, now + noteLength);
  gain2.gain.exponentialRampToValueAtTime(0.001, now + noteLength * 2);
  osc2.connect(gain2);
  gain2.connect(ctx.destination);
  osc2.start(now + noteLength);
  osc2.stop(now + noteLength * 2 + 0.05);
}

/**
 * Play a short three-note tone (ascending arpeggio).
 *
 * @param freq1 - First note frequency (Hz)
 * @param freq2 - Second note frequency (Hz)
 * @param freq3 - Third note frequency (Hz)
 * @param noteLength - Duration of each note in seconds
 */
function playThreeNoteTone(freq1: number, freq2: number, freq3: number, noteLength = 0.09): void {
  const ctx = getContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const volume = 0.15;

  // --- Note 1 ---
  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.type = 'sine';
  osc1.frequency.value = freq1;
  gain1.gain.setValueAtTime(volume, now);
  gain1.gain.exponentialRampToValueAtTime(0.001, now + noteLength);
  osc1.connect(gain1);
  gain1.connect(ctx.destination);
  osc1.start(now);
  osc1.stop(now + noteLength);

  // --- Note 2 ---
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = 'sine';
  osc2.frequency.value = freq2;
  gain2.gain.setValueAtTime(volume, now + noteLength);
  gain2.gain.exponentialRampToValueAtTime(0.001, now + noteLength * 2);
  osc2.connect(gain2);
  gain2.connect(ctx.destination);
  osc2.start(now + noteLength);
  osc2.stop(now + noteLength * 2);

  // --- Note 3 ---
  const osc3 = ctx.createOscillator();
  const gain3 = ctx.createGain();
  osc3.type = 'sine';
  osc3.frequency.value = freq3;
  gain3.gain.setValueAtTime(volume, now + noteLength * 2);
  gain3.gain.exponentialRampToValueAtTime(0.001, now + noteLength * 3);
  osc3.connect(gain3);
  gain3.connect(ctx.destination);
  osc3.start(now + noteLength * 2);
  osc3.stop(now + noteLength * 3 + 0.05);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Rising two-note chime (C5 → E5) — played when a user joins voice. */
export function playJoinSound(): void {
  try {
    playTwoNoteTone(523.25, 659.25); // C5 → E5
  } catch {
    // Never let sound errors propagate
  }
}

/** Falling two-note chime (E5 → C5) — played when a user leaves voice. */
export function playLeaveSound(): void {
  try {
    playTwoNoteTone(659.25, 523.25); // E5 → C5
  } catch {
    // Never let sound errors propagate
  }
}

/** Ascending three-note arpeggio (G5 → B5 → D6) — played when a screen share starts. */
export function playScreenShareSound(): void {
  try {
    playThreeNoteTone(783.99, 987.77, 1174.66); // G5 → B5 → D6
  } catch {
    // Never let sound errors propagate
  }
}
