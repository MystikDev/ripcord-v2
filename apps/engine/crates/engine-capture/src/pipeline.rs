use crossbeam_channel::Sender;
use serde::Serialize;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Instant;

use crate::device;
use crate::duplicator::Duplicator;
use crate::encoder::{CaptureProfile, EncodedFrame, RawEncoder, VideoEncoder};
use crate::mf_h264::MfH264Encoder;

/// Live capture statistics.
#[derive(Debug, Clone, Serialize)]
pub struct CaptureStats {
    pub fps: f32,
    pub bitrate_kbps: u32,
    pub encoder: String,
    pub width: u32,
    pub height: u32,
    pub frames_captured: u64,
}

/// Shared atomic stats for lock-free reading from IPC thread.
struct AtomicStats {
    fps_x10: AtomicU32,          // fps * 10 for one decimal place
    bitrate_kbps: AtomicU32,
    frames_captured: AtomicU64,
}

/// The capture pipeline: DXGI capture thread → encoder → output callback.
pub struct CapturePipeline {
    running: Arc<AtomicBool>,
    thread: Option<std::thread::JoinHandle<()>>,
    stats: Arc<AtomicStats>,
    profile: CaptureProfile,
    encoder_name: String,
    width: u32,
    height: u32,
}

impl CapturePipeline {
    /// Start capturing from a monitor.
    /// `output_index` — monitor index (0 = primary).
    /// `on_frame` — callback receiving encoded frames (called from capture thread).
    pub fn start_monitor(
        output_index: u32,
        profile: CaptureProfile,
    ) -> Result<Self, String> {
        let running = Arc::new(AtomicBool::new(true));
        let running_clone = running.clone();

        let stats = Arc::new(AtomicStats {
            fps_x10: AtomicU32::new(0),
            bitrate_kbps: AtomicU32::new(0),
            frames_captured: AtomicU64::new(0),
        });
        let stats_clone = stats.clone();

        let (device, context, adapter) = device::create_d3d11_device()?;
        let vendor = device::detect_gpu_vendor(&adapter);
        log::info!("GPU vendor: {vendor}");

        let mut duplicator = Duplicator::new(&device, &context, &adapter, output_index)?;
        let (width, height) = duplicator.dimensions();

        // Try MF H.264 (auto-selects NVENC/AMF/QSV, falls back to software H.264)
        // If MF fails entirely, fall back to raw passthrough encoder.
        let mut encoder: Box<dyn VideoEncoder> = {
            let mut mf = MfH264Encoder::new();
            match mf.init(width, height, &profile) {
                Ok(()) => {
                    log::info!("Using MediaFoundation H.264 encoder: {}", mf.name());
                    Box::new(mf)
                }
                Err(e) => {
                    log::warn!("MF H.264 encoder unavailable ({e}), falling back to raw encoder");
                    let mut raw = RawEncoder::new();
                    raw.init(width, height, &profile)?;
                    Box::new(raw)
                }
            }
        };
        let encoder_name = encoder.name().to_string();

        let target_fps = profile.target_fps();

        let thread = std::thread::Builder::new()
            .name("capture-pipeline".into())
            .spawn(move || {
                capture_loop(
                    &mut duplicator,
                    &mut *encoder,
                    &running_clone,
                    &stats_clone,
                    target_fps,
                );
            })
            .map_err(|e| format!("Failed to spawn capture thread: {e}"))?;

        log::info!(
            "Capture pipeline started: monitor {output_index}, {}x{}, {} encoder",
            width,
            height,
            encoder_name
        );

        Ok(Self {
            running,
            thread: Some(thread),
            stats,
            profile,
            encoder_name,
            width,
            height,
        })
    }

    /// Stop the capture pipeline.
    pub fn stop(&mut self) {
        self.running.store(false, Ordering::Relaxed);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
        log::info!("Capture pipeline stopped");
    }

    /// Get current capture statistics.
    pub fn get_stats(&self) -> CaptureStats {
        CaptureStats {
            fps: self.stats.fps_x10.load(Ordering::Relaxed) as f32 / 10.0,
            bitrate_kbps: self.stats.bitrate_kbps.load(Ordering::Relaxed),
            encoder: self.encoder_name.clone(),
            width: self.width,
            height: self.height,
            frames_captured: self.stats.frames_captured.load(Ordering::Relaxed),
        }
    }

    /// Start capturing from a monitor, sending encoded frames to the given channel.
    /// Used by the media pipeline to route encoded H.264 data to the transport layer.
    pub fn start_monitor_with_output(
        output_index: u32,
        profile: CaptureProfile,
        frame_tx: Sender<EncodedFrame>,
    ) -> Result<Self, String> {
        let running = Arc::new(AtomicBool::new(true));
        let running_clone = running.clone();

        let stats = Arc::new(AtomicStats {
            fps_x10: AtomicU32::new(0),
            bitrate_kbps: AtomicU32::new(0),
            frames_captured: AtomicU64::new(0),
        });
        let stats_clone = stats.clone();

        let (device, context, adapter) = device::create_d3d11_device()?;
        let vendor = device::detect_gpu_vendor(&adapter);
        log::info!("GPU vendor: {vendor}");

        let mut duplicator = Duplicator::new(&device, &context, &adapter, output_index)?;
        let (width, height) = duplicator.dimensions();

        let mut encoder: Box<dyn VideoEncoder> = {
            let mut mf = MfH264Encoder::new();
            match mf.init(width, height, &profile) {
                Ok(()) => {
                    log::info!("Using MediaFoundation H.264 encoder: {}", mf.name());
                    Box::new(mf)
                }
                Err(e) => {
                    log::warn!("MF H.264 encoder unavailable ({e}), falling back to raw encoder");
                    let mut raw = RawEncoder::new();
                    raw.init(width, height, &profile)?;
                    Box::new(raw)
                }
            }
        };
        let encoder_name = encoder.name().to_string();

        let target_fps = profile.target_fps();

        let thread = std::thread::Builder::new()
            .name("capture-pipeline".into())
            .spawn(move || {
                capture_loop_with_output(
                    &mut duplicator,
                    &mut *encoder,
                    &running_clone,
                    &stats_clone,
                    target_fps,
                    &frame_tx,
                );
            })
            .map_err(|e| format!("Failed to spawn capture thread: {e}"))?;

        log::info!(
            "Capture pipeline started with output: monitor {output_index}, {}x{}, {} encoder",
            width, height, encoder_name
        );

        Ok(Self {
            running,
            thread: Some(thread),
            stats,
            profile,
            encoder_name,
            width,
            height,
        })
    }

    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::Relaxed)
    }

    pub fn profile(&self) -> CaptureProfile {
        self.profile
    }
}

impl Drop for CapturePipeline {
    fn drop(&mut self) {
        self.stop();
    }
}

fn capture_loop(
    duplicator: &mut Duplicator,
    encoder: &mut dyn VideoEncoder,
    running: &AtomicBool,
    stats: &AtomicStats,
    target_fps: u32,
) {
    let frame_interval = std::time::Duration::from_micros(1_000_000 / target_fps as u64);
    let mut frame_count: u64 = 0;
    let mut bytes_this_second: u64 = 0;
    let mut frames_this_second: u32 = 0;
    let mut last_stats_update = Instant::now();
    let start_time = Instant::now();

    log::info!("Capture loop started (target {}fps, interval {:?})", target_fps, frame_interval);

    while running.load(Ordering::Relaxed) {
        let frame_start = Instant::now();

        // Acquire frame from DXGI (16ms timeout — roughly one vsync)
        match duplicator.acquire_frame(16) {
            Ok(Some(frame)) => {
                let pts_ms = start_time.elapsed().as_millis() as u64;

                // Encode
                match encoder.encode(&frame.data, frame.stride, pts_ms) {
                    Ok(Some(encoded)) => {
                        bytes_this_second += encoded.data.len() as u64;
                        // In the future, the encoded frame would be sent via WebRTC transport.
                        // For now we just count stats.
                    }
                    Ok(None) => {} // Encoder buffering
                    Err(e) => {
                        log::error!("Encode error: {e}");
                    }
                }

                frame_count += 1;
                frames_this_second += 1;
                stats.frames_captured.store(frame_count, Ordering::Relaxed);
            }
            Ok(None) => {
                // No new frame — desktop hasn't changed
            }
            Err(e) => {
                log::error!("Capture error: {e}");
                // Brief pause before retry on error
                std::thread::sleep(std::time::Duration::from_millis(100));
                continue;
            }
        }

        // Update stats once per second
        let since_stats = last_stats_update.elapsed();
        if since_stats >= std::time::Duration::from_secs(1) {
            let fps = frames_this_second as f32 / since_stats.as_secs_f32();
            let kbps = (bytes_this_second * 8 / 1024) as u32 / since_stats.as_secs().max(1) as u32;

            stats.fps_x10.store((fps * 10.0) as u32, Ordering::Relaxed);
            stats.bitrate_kbps.store(kbps, Ordering::Relaxed);

            frames_this_second = 0;
            bytes_this_second = 0;
            last_stats_update = Instant::now();
        }

        // Rate limit to target FPS
        let elapsed = frame_start.elapsed();
        if elapsed < frame_interval {
            std::thread::sleep(frame_interval - elapsed);
        }
    }
}

/// Capture loop variant that sends encoded frames to a channel.
fn capture_loop_with_output(
    duplicator: &mut Duplicator,
    encoder: &mut dyn VideoEncoder,
    running: &AtomicBool,
    stats: &AtomicStats,
    target_fps: u32,
    frame_tx: &Sender<EncodedFrame>,
) {
    let frame_interval = std::time::Duration::from_micros(1_000_000 / target_fps as u64);
    let mut frame_count: u64 = 0;
    let mut bytes_this_second: u64 = 0;
    let mut frames_this_second: u32 = 0;
    let mut last_stats_update = Instant::now();
    let start_time = Instant::now();

    log::info!("Capture loop started with output (target {}fps)", target_fps);

    while running.load(Ordering::Relaxed) {
        let frame_start = Instant::now();

        match duplicator.acquire_frame(16) {
            Ok(Some(frame)) => {
                let pts_ms = start_time.elapsed().as_millis() as u64;

                match encoder.encode(&frame.data, frame.stride, pts_ms) {
                    Ok(Some(encoded)) => {
                        bytes_this_second += encoded.data.len() as u64;
                        // Send encoded frame to transport layer
                        if frame_tx.try_send(encoded).is_err() {
                            // Channel full or disconnected — drop frame (transport is slower)
                        }
                    }
                    Ok(None) => {}
                    Err(e) => {
                        log::error!("Encode error: {e}");
                    }
                }

                frame_count += 1;
                frames_this_second += 1;
                stats.frames_captured.store(frame_count, Ordering::Relaxed);
            }
            Ok(None) => {}
            Err(e) => {
                log::error!("Capture error: {e}");
                std::thread::sleep(std::time::Duration::from_millis(100));
                continue;
            }
        }

        let since_stats = last_stats_update.elapsed();
        if since_stats >= std::time::Duration::from_secs(1) {
            let fps = frames_this_second as f32 / since_stats.as_secs_f32();
            let kbps = (bytes_this_second * 8 / 1024) as u32 / since_stats.as_secs().max(1) as u32;

            stats.fps_x10.store((fps * 10.0) as u32, Ordering::Relaxed);
            stats.bitrate_kbps.store(kbps, Ordering::Relaxed);

            frames_this_second = 0;
            bytes_this_second = 0;
            last_stats_update = Instant::now();
        }

        let elapsed = frame_start.elapsed();
        if elapsed < frame_interval {
            std::thread::sleep(frame_interval - elapsed);
        }
    }
}
