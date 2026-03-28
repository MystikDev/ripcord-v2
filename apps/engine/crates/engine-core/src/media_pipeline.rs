//! End-to-end media pipeline.
//!
//! Sender:   Capture → Encode (MF H.264) → Transport (RTP via WebRTC)
//! Receiver: Transport (RTP) → Decode (MF H.264) → Compositor (DirectComposition)
//!
//! The pipeline runs as background threads and communicates via crossbeam channels.

use crossbeam_channel::Receiver;
use engine_capture::encoder::CaptureProfile;
use engine_capture::{CapturePipeline, EncodedFrame, MfH264Decoder};
use engine_compositor::Compositor;
use engine_transport::{IncomingFrame, OutgoingFrame, WebRtcSession};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

/// The end-to-end media pipeline controller.
pub struct MediaPipeline {
    running: Arc<AtomicBool>,
    /// Sender-side: capture pipeline (owns its own thread)
    capture: Option<CapturePipeline>,
    /// Sender-side: bridge thread (reads encoded frames from capture, sends to transport)
    bridge_thread: Option<std::thread::JoinHandle<()>>,
    /// Receiver-side: decoder thread (reads from transport, decodes, blits to compositor)
    decoder_thread: Option<std::thread::JoinHandle<()>>,
}

impl MediaPipeline {
    /// Start the sender pipeline: capture screen → encode H.264 → send via WebRTC.
    pub fn start_sender(
        session: &WebRtcSession,
        monitor_index: u32,
        profile: CaptureProfile,
    ) -> Result<Self, String> {
        let running = Arc::new(AtomicBool::new(true));

        // Create a channel for encoded H.264 frames from capture → transport bridge
        let (encoded_tx, encoded_rx) = crossbeam_channel::bounded::<EncodedFrame>(8);

        // Start the capture pipeline with output hook (DXGI → encode → channel)
        let capture = CapturePipeline::start_monitor_with_output(monitor_index, profile, encoded_tx)?;

        // Bridge thread: reads encoded frames from capture, sends to transport
        let frame_tx = session.frame_sender();
        let running_clone = running.clone();

        let bridge_thread = std::thread::Builder::new()
            .name("media-bridge".into())
            .spawn(move || {
                sender_bridge_loop(encoded_rx, frame_tx, &running_clone);
            })
            .map_err(|e| format!("Spawn bridge thread: {e}"))?;

        log::info!("Media sender pipeline started (monitor {monitor_index})");

        Ok(Self {
            running,
            capture: Some(capture),
            bridge_thread: Some(bridge_thread),
            decoder_thread: None,
        })
    }

    /// Start the receiver pipeline: receive via WebRTC → decode H.264 → blit to compositor.
    pub fn start_receiver(
        session: &WebRtcSession,
        compositor: Arc<Mutex<Option<Compositor>>>,
        surface_index: usize,
    ) -> Result<Self, String> {
        let running = Arc::new(AtomicBool::new(true));
        let running_clone = running.clone();
        let frame_rx = session.frame_receiver();

        let decoder_thread = std::thread::Builder::new()
            .name("media-decoder".into())
            .spawn(move || {
                decode_loop(frame_rx, compositor, surface_index, &running_clone);
            })
            .map_err(|e| format!("Spawn decoder thread: {e}"))?;

        log::info!("Media receiver pipeline started");

        Ok(Self {
            running,
            capture: None,
            bridge_thread: None,
            decoder_thread: Some(decoder_thread),
        })
    }

    /// Stop the pipeline.
    pub fn stop(&mut self) {
        self.running.store(false, Ordering::Relaxed);

        if let Some(mut capture) = self.capture.take() {
            capture.stop();
        }

        if let Some(thread) = self.bridge_thread.take() {
            let _ = thread.join();
        }
        if let Some(thread) = self.decoder_thread.take() {
            let _ = thread.join();
        }

        log::info!("Media pipeline stopped");
    }

    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::Relaxed)
    }
}

impl Drop for MediaPipeline {
    fn drop(&mut self) {
        self.stop();
    }
}

/// Bridge loop: reads encoded H.264 frames from capture and sends them to transport.
fn sender_bridge_loop(
    encoded_rx: Receiver<EncodedFrame>,
    frame_tx: crossbeam_channel::Sender<OutgoingFrame>,
    running: &AtomicBool,
) {
    log::info!("Sender bridge loop started");

    while running.load(Ordering::Relaxed) {
        let encoded = match encoded_rx.recv_timeout(std::time::Duration::from_millis(100)) {
            Ok(frame) => frame,
            Err(crossbeam_channel::RecvTimeoutError::Timeout) => continue,
            Err(crossbeam_channel::RecvTimeoutError::Disconnected) => {
                log::info!("Bridge: capture channel disconnected");
                break;
            }
        };

        let outgoing = OutgoingFrame {
            data: encoded.data,
            is_keyframe: encoded.is_keyframe,
            pts_ms: encoded.pts_ms,
        };

        if frame_tx.try_send(outgoing).is_err() {
            // Transport can't keep up — drop frame
        }
    }

    log::info!("Sender bridge loop stopped");
}

/// Decoder loop: receives H.264 frames from transport, decodes to BGRA, blits to compositor.
fn decode_loop(
    frame_rx: Receiver<IncomingFrame>,
    compositor: Arc<Mutex<Option<Compositor>>>,
    surface_index: usize,
    running: &AtomicBool,
) {
    let mut decoder = MfH264Decoder::new();
    let mut initialized = false;

    log::info!("Decoder loop started");

    while running.load(Ordering::Relaxed) {
        // Block with timeout to allow checking running flag
        let frame = match frame_rx.recv_timeout(std::time::Duration::from_millis(100)) {
            Ok(frame) => frame,
            Err(crossbeam_channel::RecvTimeoutError::Timeout) => continue,
            Err(crossbeam_channel::RecvTimeoutError::Disconnected) => {
                log::info!("Decoder: frame channel disconnected");
                break;
            }
        };

        // Lazy init decoder on first frame (we don't know dimensions until we receive data)
        if !initialized {
            // Default to 1080p30 — the decoder will adapt from the H.264 stream
            if let Err(e) = decoder.init(1920, 1080, 30) {
                log::error!("Decoder init failed: {e}");
                break;
            }
            initialized = true;
        }

        // Decode H.264 → BGRA
        match decoder.decode(&frame.data, frame.pts_ms) {
            Ok(Some(decoded)) => {
                // Blit the decoded BGRA frame to the compositor surface
                if let Ok(mut comp_guard) = compositor.lock() {
                    if let Some(ref mut comp) = *comp_guard {
                        if let Err(e) = comp.blit_frame(
                            surface_index,
                            &decoded.data,
                            decoded.width,
                            decoded.height,
                        ) {
                            log::error!("Compositor blit: {e}");
                        }
                    }
                }
            }
            Ok(None) => {
                // Decoder buffering — needs more frames
            }
            Err(e) => {
                log::error!("Decode error: {e}");
            }
        }
    }

    // Flush remaining frames
    if initialized {
        if let Ok(remaining) = decoder.flush() {
            for decoded in remaining {
                if let Ok(mut comp_guard) = compositor.lock() {
                    if let Some(ref mut comp) = *comp_guard {
                        let _ = comp.blit_frame(
                            surface_index,
                            &decoded.data,
                            decoded.width,
                            decoded.height,
                        );
                    }
                }
            }
        }
    }

    log::info!("Decoder loop stopped");
}
