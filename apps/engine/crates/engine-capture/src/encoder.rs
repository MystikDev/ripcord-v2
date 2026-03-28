use serde::Serialize;

/// Encoded video frame (H.264 NAL units).
pub struct EncodedFrame {
    pub data: Vec<u8>,
    pub is_keyframe: bool,
    pub pts_ms: u64,
}

/// Capture quality preset.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum CaptureProfile {
    /// 3840x2160@30fps, 8-12 Mbps, high quality
    Quality4k,
    /// 1920x1080@60fps, 4-6 Mbps, performance
    Performance1080,
    /// Starts 1080p, scales up if bandwidth allows
    Adaptive,
}

impl CaptureProfile {
    pub fn target_width(&self) -> u32 {
        match self {
            CaptureProfile::Quality4k => 3840,
            CaptureProfile::Performance1080 | CaptureProfile::Adaptive => 1920,
        }
    }

    pub fn target_height(&self) -> u32 {
        match self {
            CaptureProfile::Quality4k => 2160,
            CaptureProfile::Performance1080 | CaptureProfile::Adaptive => 1080,
        }
    }

    pub fn target_fps(&self) -> u32 {
        match self {
            CaptureProfile::Quality4k => 30,
            CaptureProfile::Performance1080 => 60,
            CaptureProfile::Adaptive => 30,
        }
    }

    pub fn target_bitrate(&self) -> u32 {
        match self {
            CaptureProfile::Quality4k => 10_000_000,      // 10 Mbps
            CaptureProfile::Performance1080 => 5_000_000,  // 5 Mbps
            CaptureProfile::Adaptive => 4_000_000,         // 4 Mbps start
        }
    }

    pub fn keyframe_interval_sec(&self) -> u32 {
        2
    }
}

impl Default for CaptureProfile {
    fn default() -> Self {
        CaptureProfile::Performance1080
    }
}

/// Trait for video encoders. Implementations can use hardware (NVENC, AMF, QSV)
/// or software (Media Foundation, x264) encoders.
pub trait VideoEncoder: Send {
    /// Initialize the encoder with the given parameters.
    fn init(&mut self, width: u32, height: u32, profile: &CaptureProfile) -> Result<(), String>;

    /// Encode a BGRA frame. Returns encoded H.264 NAL units.
    /// `bgra_data` is row-major BGRA pixel data, `stride` is bytes per row.
    fn encode(&mut self, bgra_data: &[u8], stride: u32, pts_ms: u64) -> Result<Option<EncodedFrame>, String>;

    /// Flush any buffered frames.
    fn flush(&mut self) -> Result<Vec<EncodedFrame>, String>;

    /// Get the encoder name for stats reporting.
    fn name(&self) -> &str;
}

/// Software encoder — stores raw BGRA frames for transport.
/// This is a minimal passthrough "encoder" that just packages frames.
/// In production, this would be replaced with Media Foundation H.264 or NVENC.
pub struct RawEncoder {
    width: u32,
    height: u32,
    frame_count: u64,
    keyframe_interval: u32,
    fps: u32,
}

impl RawEncoder {
    pub fn new() -> Self {
        Self {
            width: 0,
            height: 0,
            frame_count: 0,
            keyframe_interval: 60,
            fps: 30,
        }
    }
}

impl Default for RawEncoder {
    fn default() -> Self {
        Self::new()
    }
}

impl VideoEncoder for RawEncoder {
    fn init(&mut self, width: u32, height: u32, profile: &CaptureProfile) -> Result<(), String> {
        self.width = width;
        self.height = height;
        self.fps = profile.target_fps();
        self.keyframe_interval = self.fps * profile.keyframe_interval_sec();
        self.frame_count = 0;
        log::info!("RawEncoder initialized: {}x{} @ {}fps", width, height, self.fps);
        Ok(())
    }

    fn encode(&mut self, bgra_data: &[u8], _stride: u32, pts_ms: u64) -> Result<Option<EncodedFrame>, String> {
        let is_keyframe = self.frame_count % self.keyframe_interval as u64 == 0;
        self.frame_count += 1;

        // For the raw encoder, just pass through the BGRA data.
        // A real encoder would convert to NV12 and produce H.264 NAL units.
        Ok(Some(EncodedFrame {
            data: bgra_data.to_vec(),
            is_keyframe,
            pts_ms,
        }))
    }

    fn flush(&mut self) -> Result<Vec<EncodedFrame>, String> {
        Ok(Vec::new())
    }

    fn name(&self) -> &str {
        "raw-bgra"
    }
}
