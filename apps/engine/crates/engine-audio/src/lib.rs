pub mod capture;
pub mod device;
pub mod playback;
pub mod processor;
pub mod rnnoise;
pub mod vst3;

use std::path::Path;

use capture::AudioCapture;
use device::{AudioDevice, DeviceDirection};
use playback::AudioPlayback;
use processor::{AudioProcessor, ProcessorControls, AUDIO_LEVEL};
use ringbuf::traits::Split;
use ringbuf::HeapRb;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

/// Ring buffer capacity in samples (~100ms at 48kHz).
const RING_BUFFER_SIZE: usize = 48000 / 10;

/// The audio engine manages the full pipeline: capture → process → output.
pub struct AudioEngine {
    capture: Mutex<Option<AudioCapture>>,
    playback: Mutex<Option<AudioPlayback>>,
    processor: Mutex<Option<AudioProcessor>>,
    controls: Arc<ProcessorControls>,
    active: AtomicBool,
}

impl AudioEngine {
    pub fn new() -> Self {
        Self {
            capture: Mutex::new(None),
            playback: Mutex::new(None),
            processor: Mutex::new(None),
            controls: Arc::new(ProcessorControls::new()),
            active: AtomicBool::new(false),
        }
    }

    /// List available audio devices.
    pub fn list_devices(&self) -> (Vec<AudioDevice>, Vec<AudioDevice>) {
        device::init_com();
        let inputs = device::enumerate(DeviceDirection::Input);
        let outputs = device::enumerate(DeviceDirection::Output);
        (inputs, outputs)
    }

    /// Start the audio pipeline with the given input/output devices.
    /// Pass empty string or "default" for the default device.
    pub fn start(&self, input_device: &str, output_device: &str) -> Result<(), String> {
        if self.active.load(Ordering::Relaxed) {
            self.stop();
        }

        // Create ring buffers:
        // capture → processor (raw mic input)
        let capture_rb = HeapRb::<f32>::new(RING_BUFFER_SIZE);
        let (capture_prod, capture_cons) = capture_rb.split();

        // processor → playback (processed output)
        let output_rb = HeapRb::<f32>::new(RING_BUFFER_SIZE);
        let (output_prod, output_cons) = output_rb.split();

        // Start capture (mic → ring buffer)
        let cap = AudioCapture::start(input_device, capture_prod)?;

        // Start processor (ring buffer → processing chain → ring buffer)
        let proc = AudioProcessor::start(capture_cons, output_prod, self.controls.clone())?;

        // Start playback (ring buffer → speakers)
        let play = AudioPlayback::start(output_device, output_cons)?;

        *self.capture.lock().unwrap() = Some(cap);
        *self.processor.lock().unwrap() = Some(proc);
        *self.playback.lock().unwrap() = Some(play);
        self.active.store(true, Ordering::Relaxed);

        log::info!("Audio engine started");
        Ok(())
    }

    /// Stop the audio pipeline.
    pub fn stop(&self) {
        // Stop in reverse order: playback → processor → capture
        if let Some(mut play) = self.playback.lock().unwrap().take() {
            play.stop();
        }
        if let Some(mut proc) = self.processor.lock().unwrap().take() {
            proc.stop();
        }
        if let Some(mut cap) = self.capture.lock().unwrap().take() {
            cap.stop();
        }
        self.active.store(false, Ordering::Relaxed);
        log::info!("Audio engine stopped");
    }

    /// Check if the audio pipeline is running.
    pub fn is_active(&self) -> bool {
        self.active.load(Ordering::Relaxed)
    }

    /// Enable or disable noise suppression.
    pub fn set_suppression(&self, enabled: bool) {
        self.controls
            .suppression_enabled
            .store(enabled, Ordering::Relaxed);
        log::info!("Noise suppression: {}", if enabled { "ON" } else { "OFF" });
    }

    /// Set gain in dB (e.g. -3.0, 0.0, 6.0).
    pub fn set_gain(&self, db: f32) {
        let db_10 = (db * 10.0) as i32;
        self.controls.gain_db.store(db_10, Ordering::Relaxed);
    }

    /// Get the current audio level (RMS) for VU meters.
    /// Returns a value from 0.0 to ~1.0.
    pub fn get_level(&self) -> f32 {
        f32::from_bits(AUDIO_LEVEL.load(Ordering::Relaxed))
    }

    /// Load a VST3 plugin into a slot.
    pub fn load_vst(&self, slot: usize, path: &str) -> Result<vst3::Vst3PluginInfo, String> {
        if slot >= vst3::MAX_SLOTS {
            return Err(format!("Slot {slot} out of range (max {})", vst3::MAX_SLOTS));
        }
        let mut slots = self.controls.vst_slots.lock().map_err(|e| e.to_string())?;
        slots[slot].load(Path::new(path), 48000.0, 480)
    }

    /// Unload a VST3 plugin from a slot.
    pub fn unload_vst(&self, slot: usize) -> Result<(), String> {
        if slot >= vst3::MAX_SLOTS {
            return Err(format!("Slot {slot} out of range"));
        }
        let mut slots = self.controls.vst_slots.lock().map_err(|e| e.to_string())?;
        slots[slot].unload();
        Ok(())
    }

    /// List parameters for a loaded VST3 plugin.
    pub fn list_vst_params(&self, slot: usize) -> Result<Vec<vst3::Vst3Param>, String> {
        if slot >= vst3::MAX_SLOTS {
            return Err(format!("Slot {slot} out of range"));
        }
        let slots = self.controls.vst_slots.lock().map_err(|e| e.to_string())?;
        match &slots[slot].plugin {
            Some(plugin) => Ok(plugin.get_parameters()),
            None => Err(format!("No plugin loaded in slot {slot}")),
        }
    }

    /// Set a VST3 parameter value (normalized 0.0-1.0).
    pub fn set_vst_param(&self, slot: usize, param_id: u32, value: f64) -> Result<bool, String> {
        if slot >= vst3::MAX_SLOTS {
            return Err(format!("Slot {slot} out of range"));
        }
        let slots = self.controls.vst_slots.lock().map_err(|e| e.to_string())?;
        match &slots[slot].plugin {
            Some(plugin) => Ok(plugin.set_parameter(param_id, value)),
            None => Err(format!("No plugin loaded in slot {slot}")),
        }
    }

    /// Bypass/unbypass a VST3 plugin slot.
    pub fn set_vst_bypass(&self, slot: usize, bypass: bool) -> Result<(), String> {
        if slot >= vst3::MAX_SLOTS {
            return Err(format!("Slot {slot} out of range"));
        }
        let mut slots = self.controls.vst_slots.lock().map_err(|e| e.to_string())?;
        slots[slot].set_bypass(bypass);
        Ok(())
    }
}

impl Default for AudioEngine {
    fn default() -> Self {
        Self::new()
    }
}

impl Drop for AudioEngine {
    fn drop(&mut self) {
        self.stop();
    }
}
