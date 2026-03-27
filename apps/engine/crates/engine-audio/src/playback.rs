use ringbuf::traits::Consumer;
use ringbuf::HeapCons;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use windows::Win32::Media::Audio::*;
use windows::Win32::System::Threading::{
    AvRevertMmThreadCharacteristics, AvSetMmThreadCharacteristicsW,
};

const WAVE_FORMAT_IEEE_FLOAT: u16 = 0x0003;

use crate::device;

/// Plays audio from a ring buffer to a WASAPI output device.
pub struct AudioPlayback {
    running: Arc<AtomicBool>,
    thread: Option<std::thread::JoinHandle<()>>,
}

impl AudioPlayback {
    /// Start playback to the given device (or default if empty).
    /// Reads f32 mono 48kHz samples from `consumer`.
    pub fn start(device_id: &str, mut consumer: HeapCons<f32>) -> Result<Self, String> {
        let running = Arc::new(AtomicBool::new(true));
        let running_clone = running.clone();
        let device_id = device_id.to_string();

        let thread = std::thread::Builder::new()
            .name("audio-playback".into())
            .spawn(move || {
                device::init_com();
                if let Err(e) = playback_loop(&device_id, &mut consumer, &running_clone) {
                    log::error!("Playback thread error: {e}");
                }
            })
            .map_err(|e| format!("Failed to spawn playback thread: {e}"))?;

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

impl Drop for AudioPlayback {
    fn drop(&mut self) {
        self.stop();
    }
}

fn playback_loop(
    device_id: &str,
    consumer: &mut HeapCons<f32>,
    running: &AtomicBool,
) -> Result<(), String> {
    unsafe {
        let device = device::get_device_by_id(device_id, device::DeviceDirection::Output)
            .ok_or("Output device not found")?;

        let client: IAudioClient = device
            .Activate(windows::Win32::System::Com::CLSCTX_ALL, None)
            .map_err(|e| format!("Activate IAudioClient: {e}"))?;

        let mix_format_ptr = client
            .GetMixFormat()
            .map_err(|e| format!("GetMixFormat: {e}"))?;
        let mix_format = &*mix_format_ptr;

        // Use the device's native format for output
        let out_channels = mix_format.nChannels as usize;
        let is_float = mix_format.wFormatTag == WAVE_FORMAT_IEEE_FLOAT as u16;

        let buffer_duration = 100_000; // 10ms
        client
            .Initialize(
                AUDCLNT_SHAREMODE_SHARED,
                AUDCLNT_STREAMFLAGS_EVENTCALLBACK,
                buffer_duration,
                0,
                mix_format,
                None,
            )
            .map_err(|e| format!("Initialize: {e}"))?;

        let event = windows::Win32::System::Threading::CreateEventW(None, false, false, None)
            .map_err(|e| format!("CreateEvent: {e}"))?;
        client
            .SetEventHandle(event)
            .map_err(|e| format!("SetEventHandle: {e}"))?;

        let render_client: IAudioRenderClient = client
            .GetService()
            .map_err(|e| format!("GetService<IAudioRenderClient>: {e}"))?;

        let buffer_size = client
            .GetBufferSize()
            .map_err(|e| format!("GetBufferSize: {e}"))?;

        let mut task_index = 0u32;
        let task = AvSetMmThreadCharacteristicsW(
            windows::core::w!("Pro Audio"),
            &mut task_index,
        )
        .unwrap_or_default();

        client.Start().map_err(|e| format!("Start: {e}"))?;

        let sr = mix_format.nSamplesPerSec;
        log::info!("Playback started: {}Hz {}ch", sr, out_channels);

        while running.load(Ordering::Relaxed) {
            windows::Win32::System::Threading::WaitForSingleObject(event, 10);

            let padding = client.GetCurrentPadding().unwrap_or(0);
            let frames_available = buffer_size - padding;

            if frames_available == 0 {
                continue;
            }

            let buffer_ptr = match render_client.GetBuffer(frames_available) {
                Ok(p) => p,
                Err(_) => continue,
            };

            if is_float {
                let output = std::slice::from_raw_parts_mut(
                    buffer_ptr as *mut f32,
                    frames_available as usize * out_channels,
                );

                for frame in output.chunks_mut(out_channels) {
                    // Read one mono sample from the ring buffer
                    let sample = consumer.try_pop().unwrap_or(0.0);
                    // Duplicate to all output channels
                    for ch in frame.iter_mut() {
                        *ch = sample;
                    }
                }
            } else {
                // i16 output
                let output = std::slice::from_raw_parts_mut(
                    buffer_ptr as *mut i16,
                    frames_available as usize * out_channels,
                );

                for frame in output.chunks_mut(out_channels) {
                    let sample = consumer.try_pop().unwrap_or(0.0);
                    let sample_i16 = (sample * 32767.0).clamp(-32768.0, 32767.0) as i16;
                    for ch in frame.iter_mut() {
                        *ch = sample_i16;
                    }
                }
            }

            let _ = render_client.ReleaseBuffer(frames_available, 0);
        }

        client.Stop().map_err(|e| format!("Stop: {e}"))?;

        if !task.is_invalid() {
            let _ = AvRevertMmThreadCharacteristics(task);
        }

        let _ = windows::Win32::Foundation::CloseHandle(event);
    }

    Ok(())
}
