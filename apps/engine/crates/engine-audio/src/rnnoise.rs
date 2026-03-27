use nnnoiseless::DenoiseState;

/// Frame size for RNNoise processing (fixed at 480 samples = 10ms at 48kHz).
pub const FRAME_SIZE: usize = 480;

/// Wrapper around the nnnoiseless (pure Rust RNNoise port) denoiser.
pub struct RnnoiseState {
    state: Box<DenoiseState<'static>>,
}

impl RnnoiseState {
    /// Create a new RNNoise denoiser instance.
    pub fn new() -> Self {
        Self {
            state: DenoiseState::new(),
        }
    }

    /// Process a frame of audio in-place.
    ///
    /// Input/output is f32 samples scaled to 16-bit range (-32768..32767).
    /// The frame must be exactly `FRAME_SIZE` (480) samples.
    ///
    /// Returns the voice activity probability (0.0 to 1.0).
    pub fn process(&mut self, frame: &mut [f32; FRAME_SIZE]) -> f32 {
        let mut output = [0.0f32; FRAME_SIZE];
        let vad = self.state.process_frame(&mut output, frame);
        frame.copy_from_slice(&output);
        vad
    }
}

impl Default for RnnoiseState {
    fn default() -> Self {
        Self::new()
    }
}
