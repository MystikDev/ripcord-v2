use ringbuf::traits::{Consumer, Producer};
use ringbuf::{HeapCons, HeapProd};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;
use windows::Win32::System::Threading::{
    AvRevertMmThreadCharacteristics, AvSetMmThreadCharacteristicsW,
};

use crate::device;
use crate::rnnoise::RnnoiseState;
use crate::vst3::{PluginSlot, MAX_SLOTS};

/// Processing block size in samples (must match RNNoise frame size = 480 samples at 48kHz = 10ms).
pub const BLOCK_SIZE: usize = 480;

/// Atomic audio level (RMS) for VU meters, stored as f32 bits.
pub static AUDIO_LEVEL: AtomicU32 = AtomicU32::new(0);

/// The audio processing thread reads from capture ring buffer,
/// applies the processing chain, and writes to output ring buffer.
pub struct AudioProcessor {
    running: Arc<AtomicBool>,
    thread: Option<std::thread::JoinHandle<()>>,
}

/// Controls for the processing chain, shared with IPC handlers.
pub struct ProcessorControls {
    pub suppression_enabled: Arc<AtomicBool>,
    pub gain_db: Arc<std::sync::atomic::AtomicI32>, // gain in dB * 10 (e.g. -30 = -3.0dB)
    pub vst_slots: Arc<std::sync::Mutex<Vec<PluginSlot>>>,
}

impl ProcessorControls {
    pub fn new() -> Self {
        let mut slots = Vec::with_capacity(MAX_SLOTS);
        for _ in 0..MAX_SLOTS {
            slots.push(PluginSlot::new());
        }
        Self {
            suppression_enabled: Arc::new(AtomicBool::new(true)),
            gain_db: Arc::new(std::sync::atomic::AtomicI32::new(0)),
            vst_slots: Arc::new(std::sync::Mutex::new(slots)),
        }
    }
}

impl Default for ProcessorControls {
    fn default() -> Self {
        Self::new()
    }
}

impl AudioProcessor {
    /// Start the processing thread.
    /// Reads from `input` (capture), processes, writes to `output` (playback/LiveKit).
    pub fn start(
        mut input: HeapCons<f32>,
        mut output: HeapProd<f32>,
        controls: Arc<ProcessorControls>,
    ) -> Result<Self, String> {
        let running = Arc::new(AtomicBool::new(true));
        let running_clone = running.clone();

        let thread = std::thread::Builder::new()
            .name("audio-processor".into())
            .spawn(move || {
                device::init_com();
                process_loop(&mut input, &mut output, &controls, &running_clone);
            })
            .map_err(|e| format!("Failed to spawn processor thread: {e}"))?;

        Ok(Self {
            running,
            thread: Some(thread),
        })
    }

    pub fn stop(&mut self) {
        self.running.store(false, Ordering::Relaxed);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

impl Drop for AudioProcessor {
    fn drop(&mut self) {
        self.stop();
    }
}

fn process_loop(
    input: &mut HeapCons<f32>,
    output: &mut HeapProd<f32>,
    controls: &ProcessorControls,
    running: &AtomicBool,
) {
    // Initialize RNNoise
    let mut rnnoise = RnnoiseState::new();
    let mut block = [0.0f32; BLOCK_SIZE];
    let mut rnnoise_in = [0.0f32; BLOCK_SIZE];

    // Boost thread priority
    let mut task_index = 0u32;
    let task = unsafe {
        AvSetMmThreadCharacteristicsW(
            windows::core::w!("Pro Audio"),
            &mut task_index,
        )
        .unwrap_or_default()
    };

    log::info!("Audio processor started (block_size={})", BLOCK_SIZE);

    while running.load(Ordering::Relaxed) {
        // Collect a full block of samples
        let mut filled = 0;
        while filled < BLOCK_SIZE {
            match input.try_pop() {
                Some(s) => {
                    block[filled] = s;
                    filled += 1;
                }
                None => {
                    // Not enough samples yet — yield briefly
                    std::thread::sleep(std::time::Duration::from_micros(500));
                    if !running.load(Ordering::Relaxed) {
                        return;
                    }
                }
            }
        }

        // === Processing Chain ===

        // 1. Noise suppression (RNNoise)
        if controls.suppression_enabled.load(Ordering::Relaxed) {
            // RNNoise expects input scaled to 16-bit range
            for (i, &s) in block.iter().enumerate() {
                rnnoise_in[i] = s * 32767.0;
            }
            rnnoise.process(&mut rnnoise_in);
            // Scale back to f32 range
            for (i, &s) in rnnoise_in.iter().enumerate() {
                block[i] = s / 32767.0;
            }
        }

        // 2. VST3 plugin slots
        if let Ok(mut slots) = controls.vst_slots.try_lock() {
            for slot in slots.iter_mut() {
                slot.process(&mut block);
            }
        }

        // 3. Apply gain
        let gain_db = controls.gain_db.load(Ordering::Relaxed) as f32 / 10.0;
        if gain_db != 0.0 {
            let gain_linear = 10.0f32.powf(gain_db / 20.0);
            for s in block.iter_mut() {
                *s *= gain_linear;
            }
        }

        // 4. Output limiter — soft clamp to prevent clipping
        for s in block.iter_mut() {
            *s = soft_clip(*s);
        }

        // Calculate RMS level for VU meters
        let rms = (block.iter().map(|s| s * s).sum::<f32>() / BLOCK_SIZE as f32).sqrt();
        AUDIO_LEVEL.store(rms.to_bits(), Ordering::Relaxed);

        // Write processed block to output
        for &s in block.iter() {
            let _ = output.try_push(s);
        }
    }

    if !task.is_invalid() {
        unsafe {
            let _ = AvRevertMmThreadCharacteristics(task);
        }
    }

    log::info!("Audio processor stopped");
}

/// Soft clipping function — tanh-based, smooth limiting.
#[inline]
fn soft_clip(x: f32) -> f32 {
    if x.abs() < 0.5 {
        x
    } else {
        x.signum() * (1.0 - (-2.0 * (x.abs() - 0.5)).exp().recip())
    }
}
