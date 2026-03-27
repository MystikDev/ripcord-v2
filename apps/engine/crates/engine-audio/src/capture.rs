use ringbuf::traits::Producer;
use ringbuf::HeapProd;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use windows::Win32::Media::Audio::*;
use windows::Win32::System::Threading::{
    AvRevertMmThreadCharacteristics, AvSetMmThreadCharacteristicsW,
};

/// WAVE_FORMAT_IEEE_FLOAT tag value.
const WAVE_FORMAT_IEEE_FLOAT: u16 = 0x0003;

use crate::device;

/// Target format for capture: 48kHz, mono, f32.
pub const SAMPLE_RATE: u32 = 48000;
pub const CHANNELS: u16 = 1;
pub const BITS_PER_SAMPLE: u16 = 32;

/// Captures audio from a WASAPI input device and writes f32 samples to a ring buffer.
pub struct AudioCapture {
    running: Arc<AtomicBool>,
    thread: Option<std::thread::JoinHandle<()>>,
}

impl AudioCapture {
    /// Start capturing from the given device (or default if empty).
    /// Samples are written as f32 mono 48kHz into `producer`.
    pub fn start(device_id: &str, mut producer: HeapProd<f32>) -> Result<Self, String> {
        let running = Arc::new(AtomicBool::new(true));
        let running_clone = running.clone();
        let device_id = device_id.to_string();

        let thread = std::thread::Builder::new()
            .name("audio-capture".into())
            .spawn(move || {
                device::init_com();
                if let Err(e) = capture_loop(&device_id, &mut producer, &running_clone) {
                    log::error!("Capture thread error: {e}");
                }
            })
            .map_err(|e| format!("Failed to spawn capture thread: {e}"))?;

        Ok(Self {
            running,
            thread: Some(thread),
        })
    }

    /// Stop capturing.
    pub fn stop(&mut self) {
        self.running.store(false, Ordering::Relaxed);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

impl Drop for AudioCapture {
    fn drop(&mut self) {
        self.stop();
    }
}

fn capture_loop(
    device_id: &str,
    producer: &mut HeapProd<f32>,
    running: &AtomicBool,
) -> Result<(), String> {
    unsafe {
        let device = device::get_device_by_id(device_id, device::DeviceDirection::Input)
            .ok_or("Input device not found")?;

        let client: IAudioClient = device
            .Activate(windows::Win32::System::Com::CLSCTX_ALL, None)
            .map_err(|e| format!("Activate IAudioClient: {e}"))?;

        // Get the device's mix format
        let mix_format_ptr = client
            .GetMixFormat()
            .map_err(|e| format!("GetMixFormat: {e}"))?;
        let mix_format = &*mix_format_ptr;

        // Configure our desired format: 48kHz mono f32
        let desired_format = WAVEFORMATEX {
            wFormatTag: WAVE_FORMAT_IEEE_FLOAT as u16,
            nChannels: CHANNELS,
            nSamplesPerSec: SAMPLE_RATE,
            nAvgBytesPerSec: SAMPLE_RATE * (BITS_PER_SAMPLE as u32 / 8),
            nBlockAlign: BITS_PER_SAMPLE / 8,
            wBitsPerSample: BITS_PER_SAMPLE,
            cbSize: 0,
        };

        // Try our desired format first, fall back to device mix format
        let use_format = if client
            .IsFormatSupported(
                AUDCLNT_SHAREMODE_SHARED,
                &desired_format,
                Some(std::ptr::null_mut() as *mut *mut WAVEFORMATEX),
            )
            .is_ok()
        {
            desired_format
        } else {
            let sr = mix_format.nSamplesPerSec;
            let ch = mix_format.nChannels;
            log::warn!(
                "Desired format not supported, using device format: {}Hz {}ch",
                sr, ch
            );
            *mix_format
        };

        // Initialize in shared mode with 10ms buffer
        let buffer_duration = 100_000; // 10ms in 100-nanosecond units
        client
            .Initialize(
                AUDCLNT_SHAREMODE_SHARED,
                AUDCLNT_STREAMFLAGS_EVENTCALLBACK,
                buffer_duration,
                0,
                &use_format,
                None,
            )
            .map_err(|e| format!("Initialize: {e}"))?;

        // Create and set the event for buffer-ready notification
        let event = windows::Win32::System::Threading::CreateEventW(None, false, false, None)
            .map_err(|e| format!("CreateEvent: {e}"))?;
        client
            .SetEventHandle(event)
            .map_err(|e| format!("SetEventHandle: {e}"))?;

        let capture_client: IAudioCaptureClient = client
            .GetService()
            .map_err(|e| format!("GetService<IAudioCaptureClient>: {e}"))?;

        // Boost thread priority for real-time audio
        let mut task_index = 0u32;
        let task = AvSetMmThreadCharacteristicsW(
            windows::core::w!("Pro Audio"),
            &mut task_index,
        )
        .unwrap_or_default();

        client.Start().map_err(|e| format!("Start: {e}"))?;

        let source_channels = use_format.nChannels as usize;
        let source_rate = use_format.nSamplesPerSec;
        let is_float = use_format.wFormatTag == WAVE_FORMAT_IEEE_FLOAT as u16;

        let bps = use_format.wBitsPerSample;
        log::info!(
            "Capture started: {}Hz {}ch {}bit float={}",
            source_rate, source_channels, bps, is_float
        );

        while running.load(Ordering::Relaxed) {
            // Wait for buffer event (10ms timeout)
            windows::Win32::System::Threading::WaitForSingleObject(event, 10);

            loop {
                let mut buffer_ptr = std::ptr::null_mut();
                let mut frames_available = 0u32;
                let mut flags = 0u32;

                let hr = capture_client.GetBuffer(
                    &mut buffer_ptr,
                    &mut frames_available,
                    &mut flags,
                    None,
                    None,
                );

                if hr.is_err() || frames_available == 0 {
                    break;
                }

                let silent = flags & (AUDCLNT_BUFFERFLAGS_SILENT.0 as u32) != 0;

                if silent {
                    // Write silence
                    for _ in 0..frames_available {
                        let _ = producer.try_push(0.0);
                    }
                } else if is_float && source_channels == 1 {
                    // Ideal path: f32 mono — direct copy
                    let samples = std::slice::from_raw_parts(
                        buffer_ptr as *const f32,
                        frames_available as usize,
                    );
                    for &s in samples {
                        let _ = producer.try_push(s);
                    }
                } else if is_float {
                    // f32 multi-channel — downmix to mono by averaging
                    let samples = std::slice::from_raw_parts(
                        buffer_ptr as *const f32,
                        frames_available as usize * source_channels,
                    );
                    for frame in samples.chunks(source_channels) {
                        let mono: f32 =
                            frame.iter().sum::<f32>() / source_channels as f32;
                        let _ = producer.try_push(mono);
                    }
                } else {
                    // i16 format — convert to f32 mono
                    let samples = std::slice::from_raw_parts(
                        buffer_ptr as *const i16,
                        frames_available as usize * source_channels,
                    );
                    for frame in samples.chunks(source_channels) {
                        let mono: f32 = frame.iter().map(|&s| s as f32 / 32768.0).sum::<f32>()
                            / source_channels as f32;
                        let _ = producer.try_push(mono);
                    }
                }

                let _ = capture_client.ReleaseBuffer(frames_available);
            }
        }

        client.Stop().map_err(|e| format!("Stop: {e}"))?;

        if !task.is_invalid() {
            let _ = AvRevertMmThreadCharacteristics(task);
        }

        let _ = windows::Win32::Foundation::CloseHandle(event);
    }

    Ok(())
}
