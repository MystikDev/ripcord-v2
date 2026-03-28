//! Media Foundation H.264 encoder.
//!
//! Uses MFTEnumEx with MFT_ENUM_FLAG_HARDWARE to auto-select GPU-accelerated
//! encoding: NVENC (NVIDIA), AMF (AMD), Quick Sync (Intel). Falls back to the
//! Windows software H.264 encoder if no hardware encoder is available.
//!
//! Input:  BGRA frames (converted to NV12 internally)
//! Output: H.264 Annex B bitstream (start-code delimited NAL units)

use crate::encoder::{CaptureProfile, EncodedFrame, VideoEncoder};
use std::ptr;
use windows::core::GUID;
use windows::Win32::Media::MediaFoundation::*;
use windows::Win32::System::Com::*;

// GUIDs not always exposed as constants
const MF_MT_MAJOR_TYPE_GUID: GUID = MF_MT_MAJOR_TYPE;
const MF_MT_SUBTYPE_GUID: GUID = MF_MT_SUBTYPE;
const MF_MT_AVG_BITRATE_GUID: GUID = MF_MT_AVG_BITRATE;
const MF_MT_INTERLACE_MODE_GUID: GUID = MF_MT_INTERLACE_MODE;
const MF_MT_FRAME_SIZE_GUID: GUID = MF_MT_FRAME_SIZE;
const MF_MT_FRAME_RATE_GUID: GUID = MF_MT_FRAME_RATE;

/// Media Foundation H.264 encoder.
pub struct MfH264Encoder {
    transform: Option<IMFTransform>,
    width: u32,
    height: u32,
    is_hardware: bool,
    encoder_name: String,
    frame_count: u64,
    keyframe_interval: u32,
    // Pre-allocated NV12 buffer
    nv12_buf: Vec<u8>,
}

impl MfH264Encoder {
    pub fn new() -> Self {
        Self {
            transform: None,
            width: 0,
            height: 0,
            is_hardware: false,
            encoder_name: String::new(),
            frame_count: 0,
            keyframe_interval: 60,
            nv12_buf: Vec::new(),
        }
    }
}

impl Default for MfH264Encoder {
    fn default() -> Self {
        Self::new()
    }
}

// Safety: IMFTransform COM objects are MTA (multi-threaded apartment) safe.
// Access is serialized through the pipeline's single capture thread.
unsafe impl Send for MfH264Encoder {}

impl VideoEncoder for MfH264Encoder {
    fn init(&mut self, width: u32, height: u32, profile: &CaptureProfile) -> Result<(), String> {
        self.width = width;
        self.height = height;
        self.keyframe_interval = profile.target_fps() * profile.keyframe_interval_sec();
        self.frame_count = 0;

        // Pre-allocate NV12 buffer: Y plane (w*h) + UV plane (w*h/2)
        let nv12_size = (width * height * 3 / 2) as usize;
        self.nv12_buf = vec![0u8; nv12_size];

        // Start MF
        unsafe {
            MFStartup(MF_VERSION, MFSTARTUP_NOSOCKET)
                .map_err(|e| format!("MFStartup: {e}"))?;
        }

        // Find H.264 encoder — prefer hardware
        let output_type = MFT_REGISTER_TYPE_INFO {
            guidMajorType: MFMediaType_Video,
            guidSubtype: MFVideoFormat_H264,
        };

        let (transform, is_hw, name) = find_h264_encoder(&output_type)?;
        self.transform = Some(transform);
        self.is_hardware = is_hw;
        self.encoder_name = name;

        let transform = self.transform.as_ref().unwrap();

        // Configure output type (H.264)
        let output_media_type = create_h264_output_type(width, height, profile)?;
        unsafe {
            transform
                .SetOutputType(0, &output_media_type, 0)
                .map_err(|e| format!("SetOutputType: {e}"))?;
        }

        // Configure input type (NV12)
        let input_media_type = create_nv12_input_type(width, height, profile)?;
        unsafe {
            transform
                .SetInputType(0, &input_media_type, 0)
                .map_err(|e| format!("SetInputType: {e}"))?;
        }

        // Start streaming
        unsafe {
            transform
                .ProcessMessage(MFT_MESSAGE_NOTIFY_BEGIN_STREAMING, 0)
                .map_err(|e| format!("BEGIN_STREAMING: {e}"))?;
            transform
                .ProcessMessage(MFT_MESSAGE_NOTIFY_START_OF_STREAM, 0)
                .map_err(|e| format!("START_OF_STREAM: {e}"))?;
        }

        log::info!(
            "MF H.264 encoder initialized: {}x{} @ {}fps, {}kbps, {} (hw={})",
            width,
            height,
            profile.target_fps(),
            profile.target_bitrate() / 1000,
            self.encoder_name,
            self.is_hardware,
        );

        Ok(())
    }

    fn encode(
        &mut self,
        bgra_data: &[u8],
        stride: u32,
        pts_ms: u64,
    ) -> Result<Option<EncodedFrame>, String> {
        let transform = self
            .transform
            .as_ref()
            .ok_or("Encoder not initialized")?;

        // Convert BGRA → NV12
        bgra_to_nv12(bgra_data, stride, self.width, self.height, &mut self.nv12_buf);

        // Create MF sample with NV12 data
        let sample = create_sample(&self.nv12_buf, pts_ms)?;

        // Feed input
        unsafe {
            transform
                .ProcessInput(0, &sample, 0)
                .map_err(|e| format!("ProcessInput: {e}"))?;
        }

        // Try to read output
        let encoded = read_output(transform)?;
        if let Some(data) = encoded {
            let is_keyframe = self.frame_count % self.keyframe_interval as u64 == 0;
            self.frame_count += 1;
            Ok(Some(EncodedFrame {
                data,
                is_keyframe,
                pts_ms,
            }))
        } else {
            self.frame_count += 1;
            Ok(None)
        }
    }

    fn flush(&mut self) -> Result<Vec<EncodedFrame>, String> {
        let mut frames = Vec::new();
        if let Some(ref transform) = self.transform {
            unsafe {
                let _ = transform.ProcessMessage(MFT_MESSAGE_COMMAND_DRAIN, 0);
            }
            // Drain all remaining output
            loop {
                match read_output(transform) {
                    Ok(Some(data)) => {
                        frames.push(EncodedFrame {
                            data,
                            is_keyframe: false,
                            pts_ms: 0,
                        });
                    }
                    _ => break,
                }
            }
        }
        Ok(frames)
    }

    fn name(&self) -> &str {
        if self.encoder_name.is_empty() {
            "mf-h264"
        } else {
            &self.encoder_name
        }
    }
}

impl Drop for MfH264Encoder {
    fn drop(&mut self) {
        if let Some(ref transform) = self.transform {
            unsafe {
                let _ = transform.ProcessMessage(MFT_MESSAGE_NOTIFY_END_OF_STREAM, 0);
                let _ = transform.ProcessMessage(MFT_MESSAGE_COMMAND_FLUSH, 0);
            }
        }
        self.transform = None;
        unsafe {
            let _ = MFShutdown();
        }
    }
}

// ---------------------------------------------------------------------------
// MF helpers
// ---------------------------------------------------------------------------

/// Find an H.264 encoder MFT. Tries hardware first, then software.
fn find_h264_encoder(
    output_type: &MFT_REGISTER_TYPE_INFO,
) -> Result<(IMFTransform, bool, String), String> {
    // Try hardware first
    if let Ok(result) = try_enum_encoder(output_type, true) {
        return Ok(result);
    }
    // Fall back to software
    try_enum_encoder(output_type, false)
}

fn try_enum_encoder(
    output_type: &MFT_REGISTER_TYPE_INFO,
    hardware: bool,
) -> Result<(IMFTransform, bool, String), String> {
    let flags = if hardware {
        MFT_ENUM_FLAG_HARDWARE | MFT_ENUM_FLAG_SORTANDFILTER
    } else {
        MFT_ENUM_FLAG_SYNCMFT | MFT_ENUM_FLAG_ASYNCMFT | MFT_ENUM_FLAG_SORTANDFILTER
    };

    let mut activate_array: *mut Option<IMFActivate> = ptr::null_mut();
    let mut count: u32 = 0;

    unsafe {
        MFTEnumEx(
            MFT_CATEGORY_VIDEO_ENCODER,
            flags,
            None,
            Some(output_type),
            &mut activate_array,
            &mut count,
        )
        .map_err(|e| format!("MFTEnumEx: {e}"))?;
    }

    if count == 0 || activate_array.is_null() {
        return Err(format!(
            "No {} H.264 encoder found",
            if hardware { "hardware" } else { "software" }
        ));
    }

    // Use the first (highest priority) encoder
    let activate = unsafe {
        let arr = std::slice::from_raw_parts(activate_array, count as usize);
        arr[0]
            .as_ref()
            .ok_or("Null IMFActivate")?
            .clone()
    };

    // Get friendly name
    let name = unsafe {
        let mut name_ptr = windows::core::PWSTR::null();
        let mut name_len = 0u32;
        let name = if activate
            .GetAllocatedString(&MFT_FRIENDLY_NAME_Attribute, &mut name_ptr, &mut name_len)
            .is_ok()
        {
            let s = name_ptr.to_string().unwrap_or_default();
            CoTaskMemFree(Some(name_ptr.as_ptr() as *const _));
            s
        } else {
            String::from(if hardware { "hw-h264" } else { "sw-h264" })
        };

        // Free the activate array
        for i in 0..count as usize {
            let arr = std::slice::from_raw_parts(activate_array, count as usize);
            drop(arr[i].clone());
        }
        CoTaskMemFree(Some(activate_array as *const _));

        name
    };

    // Activate the transform
    let transform: IMFTransform = unsafe {
        activate
            .ActivateObject()
            .map_err(|e| format!("ActivateObject: {e}"))?
    };

    log::info!(
        "Found {} H.264 encoder: {}",
        if hardware { "hardware" } else { "software" },
        name
    );

    Ok((transform, hardware, name))
}

fn create_h264_output_type(
    width: u32,
    height: u32,
    profile: &CaptureProfile,
) -> Result<IMFMediaType, String> {
    unsafe {
        let media_type: IMFMediaType =
            MFCreateMediaType().map_err(|e| format!("MFCreateMediaType: {e}"))?;

        media_type
            .SetGUID(&MF_MT_MAJOR_TYPE_GUID, &MFMediaType_Video)
            .map_err(|e| format!("SetGUID major: {e}"))?;
        media_type
            .SetGUID(&MF_MT_SUBTYPE_GUID, &MFVideoFormat_H264)
            .map_err(|e| format!("SetGUID subtype: {e}"))?;
        media_type
            .SetUINT32(&MF_MT_AVG_BITRATE_GUID, profile.target_bitrate())
            .map_err(|e| format!("SetUINT32 bitrate: {e}"))?;
        media_type
            .SetUINT32(
                &MF_MT_INTERLACE_MODE_GUID,
                MFVideoInterlace_Progressive.0 as u32,
            )
            .map_err(|e| format!("SetUINT32 interlace: {e}"))?;

        // Frame size: pack width and height into a u64
        let frame_size = ((width as u64) << 32) | (height as u64);
        media_type
            .SetUINT64(&MF_MT_FRAME_SIZE_GUID, frame_size)
            .map_err(|e| format!("SetUINT64 frame_size: {e}"))?;

        // Frame rate: numerator/denominator packed into u64
        let frame_rate = ((profile.target_fps() as u64) << 32) | 1u64;
        media_type
            .SetUINT64(&MF_MT_FRAME_RATE_GUID, frame_rate)
            .map_err(|e| format!("SetUINT64 frame_rate: {e}"))?;

        // Request Baseline profile for low latency
        media_type
            .SetUINT32(&MF_MT_MPEG2_PROFILE, eAVEncH264VProfile_Base.0 as u32)
            .map_err(|e| format!("SetUINT32 profile: {e}"))?;

        // Low latency
        let _ = media_type.SetUINT32(&MF_LOW_LATENCY, 1);

        Ok(media_type)
    }
}

fn create_nv12_input_type(
    width: u32,
    height: u32,
    profile: &CaptureProfile,
) -> Result<IMFMediaType, String> {
    unsafe {
        let media_type: IMFMediaType =
            MFCreateMediaType().map_err(|e| format!("MFCreateMediaType: {e}"))?;

        media_type
            .SetGUID(&MF_MT_MAJOR_TYPE_GUID, &MFMediaType_Video)
            .map_err(|e| format!("SetGUID major: {e}"))?;
        media_type
            .SetGUID(&MF_MT_SUBTYPE_GUID, &MFVideoFormat_NV12)
            .map_err(|e| format!("SetGUID subtype: {e}"))?;
        media_type
            .SetUINT32(
                &MF_MT_INTERLACE_MODE_GUID,
                MFVideoInterlace_Progressive.0 as u32,
            )
            .map_err(|e| format!("SetUINT32 interlace: {e}"))?;

        let frame_size = ((width as u64) << 32) | (height as u64);
        media_type
            .SetUINT64(&MF_MT_FRAME_SIZE_GUID, frame_size)
            .map_err(|e| format!("SetUINT64 frame_size: {e}"))?;

        let frame_rate = ((profile.target_fps() as u64) << 32) | 1u64;
        media_type
            .SetUINT64(&MF_MT_FRAME_RATE_GUID, frame_rate)
            .map_err(|e| format!("SetUINT64 frame_rate: {e}"))?;

        Ok(media_type)
    }
}

/// Create an IMFSample containing the given data.
fn create_sample(data: &[u8], pts_ms: u64) -> Result<IMFSample, String> {
    unsafe {
        let sample: IMFSample =
            MFCreateSample().map_err(|e| format!("MFCreateSample: {e}"))?;

        let buffer: IMFMediaBuffer = MFCreateMemoryBuffer(data.len() as u32)
            .map_err(|e| format!("MFCreateMemoryBuffer: {e}"))?;

        // Copy data into the MF buffer
        let mut buf_ptr: *mut u8 = ptr::null_mut();
        let mut max_len: u32 = 0;
        let mut cur_len: u32 = 0;
        buffer
            .Lock(&mut buf_ptr, Some(&mut max_len), Some(&mut cur_len))
            .map_err(|e| format!("Lock: {e}"))?;

        ptr::copy_nonoverlapping(data.as_ptr(), buf_ptr, data.len());

        buffer
            .Unlock()
            .map_err(|e| format!("Unlock: {e}"))?;
        buffer
            .SetCurrentLength(data.len() as u32)
            .map_err(|e| format!("SetCurrentLength: {e}"))?;

        sample
            .AddBuffer(&buffer)
            .map_err(|e| format!("AddBuffer: {e}"))?;

        // Set timestamp (100-nanosecond units)
        let hns = pts_ms as i64 * 10_000;
        sample
            .SetSampleTime(hns)
            .map_err(|e| format!("SetSampleTime: {e}"))?;

        Ok(sample)
    }
}

/// Read encoded output from the MFT. Returns None if no output is ready.
fn read_output(transform: &IMFTransform) -> Result<Option<Vec<u8>>, String> {
    unsafe {
        // Get output stream info to know buffer requirements
        let stream_info = transform
            .GetOutputStreamInfo(0)
            .map_err(|e| format!("GetOutputStreamInfo: {e}"))?;

        let provides_samples =
            (stream_info.dwFlags & (MFT_OUTPUT_STREAM_PROVIDES_SAMPLES.0 as u32)) != 0;

        let mut buffers = [MFT_OUTPUT_DATA_BUFFER::default()];
        buffers[0].dwStreamID = 0;

        if !provides_samples {
            // We need to allocate the output sample
            let sample: IMFSample =
                MFCreateSample().map_err(|e| format!("MFCreateSample (out): {e}"))?;
            let buf_size = stream_info.cbSize.max(1024 * 1024); // At least 1MB
            let buffer: IMFMediaBuffer = MFCreateMemoryBuffer(buf_size)
                .map_err(|e| format!("MFCreateMemoryBuffer (out): {e}"))?;
            sample
                .AddBuffer(&buffer)
                .map_err(|e| format!("AddBuffer (out): {e}"))?;
            buffers[0].pSample = std::mem::ManuallyDrop::new(Some(sample));
        }

        let mut status: u32 = 0;
        let hr = transform.ProcessOutput(0, &mut buffers, &mut status);

        match hr {
            Ok(()) => {}
            Err(e) => {
                // MF_E_TRANSFORM_NEED_MORE_INPUT means encoder needs more frames
                if e.code().0 as u32 == 0xC00D6D72 {
                    return Ok(None);
                }
                // MF_E_TRANSFORM_STREAM_CHANGE — output format changed, re-negotiate
                if e.code().0 as u32 == 0xC00D6D61 {
                    log::warn!("MFT output format changed — re-negotiating");
                    return Ok(None);
                }
                return Err(format!("ProcessOutput: {e}"));
            }
        }

        // Extract data from the output sample
        let sample = std::mem::ManuallyDrop::into_inner(buffers[0].pSample.clone());
        if let Some(sample) = sample {
            let buffer: IMFMediaBuffer = sample
                .ConvertToContiguousBuffer()
                .map_err(|e| format!("ConvertToContiguousBuffer: {e}"))?;

            let mut buf_ptr: *mut u8 = ptr::null_mut();
            let mut cur_len: u32 = 0;
            buffer
                .Lock(&mut buf_ptr, None, Some(&mut cur_len))
                .map_err(|e| format!("Lock (out): {e}"))?;

            let data = std::slice::from_raw_parts(buf_ptr, cur_len as usize).to_vec();

            buffer
                .Unlock()
                .map_err(|e| format!("Unlock (out): {e}"))?;

            Ok(Some(data))
        } else {
            Ok(None)
        }
    }
}

// ---------------------------------------------------------------------------
// BGRA → NV12 color conversion
// ---------------------------------------------------------------------------

/// Convert BGRA pixel data to NV12 (Y plane + interleaved UV plane).
/// NV12 layout: width*height bytes of Y, then width*height/2 bytes of UV.
fn bgra_to_nv12(bgra: &[u8], stride: u32, width: u32, height: u32, nv12: &mut [u8]) {
    let w = width as usize;
    let h = height as usize;
    let src_stride = stride as usize;

    let (y_plane, uv_plane) = nv12.split_at_mut(w * h);

    // Y plane: full resolution
    for y in 0..h {
        let row = &bgra[y * src_stride..];
        for x in 0..w {
            let b = row[x * 4] as i32;
            let g = row[x * 4 + 1] as i32;
            let r = row[x * 4 + 2] as i32;

            // BT.601 Y
            let luma = ((66 * r + 129 * g + 25 * b + 128) >> 8) + 16;
            y_plane[y * w + x] = luma.clamp(0, 255) as u8;
        }
    }

    // UV plane: half resolution, interleaved U V
    let uv_w = w / 2;
    for y in (0..h).step_by(2) {
        let row0 = &bgra[y * src_stride..];
        let row1 = if y + 1 < h {
            &bgra[(y + 1) * src_stride..]
        } else {
            row0
        };

        for x in (0..w).step_by(2) {
            // Average 2x2 block
            let mut r = 0i32;
            let mut g = 0i32;
            let mut b = 0i32;

            for row in [row0, row1] {
                for dx in 0..2usize {
                    let px = (x + dx).min(w - 1);
                    b += row[px * 4] as i32;
                    g += row[px * 4 + 1] as i32;
                    r += row[px * 4 + 2] as i32;
                }
            }

            r >>= 2;
            g >>= 2;
            b >>= 2;

            // BT.601 Cb, Cr
            let u = ((-38 * r - 74 * g + 112 * b + 128) >> 8) + 128;
            let v = ((112 * r - 94 * g - 18 * b + 128) >> 8) + 128;

            let uv_idx = (y / 2) * uv_w * 2 + (x / 2) * 2;
            uv_plane[uv_idx] = u.clamp(0, 255) as u8;
            uv_plane[uv_idx + 1] = v.clamp(0, 255) as u8;
        }
    }
}
