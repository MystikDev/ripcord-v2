//! Media Foundation H.264 decoder.
//!
//! Uses MFTEnumEx with MFT_ENUM_FLAG_HARDWARE to auto-select GPU-accelerated
//! decoding (NVDEC, AMD VCN, Intel Quick Sync). Falls back to the Windows
//! software H.264 decoder (inbox DXVA-aware MFT) if no hardware decoder found.
//!
//! Input:  H.264 Annex B bitstream (NAL units)
//! Output: BGRA frames ready for compositor blitting

use std::ptr;
use windows::core::GUID;
use windows::Win32::Media::MediaFoundation::*;
use windows::Win32::System::Com::*;

// GUID aliases for clarity
const MF_MT_MAJOR_TYPE_GUID: GUID = MF_MT_MAJOR_TYPE;
const MF_MT_SUBTYPE_GUID: GUID = MF_MT_SUBTYPE;
const MF_MT_INTERLACE_MODE_GUID: GUID = MF_MT_INTERLACE_MODE;
const MF_MT_FRAME_SIZE_GUID: GUID = MF_MT_FRAME_SIZE;
const MF_MT_FRAME_RATE_GUID: GUID = MF_MT_FRAME_RATE;

/// Decoded video frame in BGRA format, ready for compositor.
pub struct DecodedFrame {
    pub data: Vec<u8>,
    pub width: u32,
    pub height: u32,
    pub stride: u32,
    pub pts_ms: u64,
}

/// Media Foundation H.264 decoder.
pub struct MfH264Decoder {
    transform: Option<IMFTransform>,
    width: u32,
    height: u32,
    is_hardware: bool,
    decoder_name: String,
    // MF has been started (needs shutdown on drop)
    mf_started: bool,
}

impl MfH264Decoder {
    pub fn new() -> Self {
        Self {
            transform: None,
            width: 0,
            height: 0,
            is_hardware: false,
            decoder_name: String::new(),
            mf_started: false,
        }
    }

    /// Initialize the decoder for the given resolution and frame rate.
    pub fn init(&mut self, width: u32, height: u32, fps: u32) -> Result<(), String> {
        self.width = width;
        self.height = height;

        unsafe {
            MFStartup(MF_VERSION, MFSTARTUP_NOSOCKET)
                .map_err(|e| format!("MFStartup: {e}"))?;
        }
        self.mf_started = true;

        // Find H.264 decoder — prefer hardware
        let input_type = MFT_REGISTER_TYPE_INFO {
            guidMajorType: MFMediaType_Video,
            guidSubtype: MFVideoFormat_H264,
        };

        let (transform, is_hw, name) = find_h264_decoder(&input_type)?;
        self.transform = Some(transform);
        self.is_hardware = is_hw;
        self.decoder_name = name;

        let transform = self.transform.as_ref().unwrap();

        // Configure input type (H.264)
        let input_media_type = create_h264_input_type(width, height, fps)?;
        unsafe {
            transform
                .SetInputType(0, &input_media_type, 0)
                .map_err(|e| format!("SetInputType: {e}"))?;
        }

        // Configure output type (NV12 — most decoders output NV12, we convert to BGRA)
        let output_media_type = create_nv12_output_type(width, height, fps)?;
        unsafe {
            transform
                .SetOutputType(0, &output_media_type, 0)
                .map_err(|e| format!("SetOutputType: {e}"))?;
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

        // Enable low latency if supported
        unsafe {
            let _ = transform.ProcessMessage(MFT_MESSAGE_SET_D3D_MANAGER, 0);
        }

        log::info!(
            "MF H.264 decoder initialized: {}x{} @ {}fps, {} (hw={})",
            width, height, fps, self.decoder_name, self.is_hardware,
        );

        Ok(())
    }

    /// Decode an H.264 NAL unit / access unit. Returns a BGRA frame if one is ready.
    /// The decoder may buffer several frames before producing output.
    pub fn decode(&mut self, h264_data: &[u8], pts_ms: u64) -> Result<Option<DecodedFrame>, String> {
        let transform = self
            .transform
            .as_ref()
            .ok_or("Decoder not initialized")?;

        // Create MF sample with H.264 data
        let sample = create_sample(h264_data, pts_ms)?;

        // Feed input
        unsafe {
            transform
                .ProcessInput(0, &sample, 0)
                .map_err(|e| format!("ProcessInput: {e}"))?;
        }

        // Try to read decoded output
        self.read_decoded_frame()
    }

    /// Flush buffered frames from the decoder.
    pub fn flush(&mut self) -> Result<Vec<DecodedFrame>, String> {
        let mut frames = Vec::new();
        if let Some(ref transform) = self.transform {
            unsafe {
                let _ = transform.ProcessMessage(MFT_MESSAGE_COMMAND_DRAIN, 0);
            }
            loop {
                match self.read_decoded_frame() {
                    Ok(Some(frame)) => frames.push(frame),
                    _ => break,
                }
            }
        }
        Ok(frames)
    }

    /// Get the decoder name for diagnostics.
    pub fn name(&self) -> &str {
        if self.decoder_name.is_empty() {
            "mf-h264-dec"
        } else {
            &self.decoder_name
        }
    }

    pub fn is_hardware(&self) -> bool {
        self.is_hardware
    }

    /// Read a decoded NV12 frame from the MFT and convert to BGRA.
    fn read_decoded_frame(&self) -> Result<Option<DecodedFrame>, String> {
        let transform = self.transform.as_ref().ok_or("Decoder not initialized")?;

        let nv12_data = match read_output(transform)? {
            Some((data, pts_ms)) => (data, pts_ms),
            None => return Ok(None),
        };

        let (nv12, pts_ms) = nv12_data;

        // Convert NV12 → BGRA
        let bgra_size = (self.width * self.height * 4) as usize;
        let mut bgra = vec![0u8; bgra_size];
        nv12_to_bgra(&nv12, self.width, self.height, &mut bgra);

        Ok(Some(DecodedFrame {
            data: bgra,
            width: self.width,
            height: self.height,
            stride: self.width * 4,
            pts_ms,
        }))
    }
}

impl Default for MfH264Decoder {
    fn default() -> Self {
        Self::new()
    }
}

// Safety: IMFTransform COM objects are MTA (multi-threaded apartment) safe.
// Access is serialized through the caller's thread.
unsafe impl Send for MfH264Decoder {}

impl Drop for MfH264Decoder {
    fn drop(&mut self) {
        if let Some(ref transform) = self.transform {
            unsafe {
                let _ = transform.ProcessMessage(MFT_MESSAGE_NOTIFY_END_OF_STREAM, 0);
                let _ = transform.ProcessMessage(MFT_MESSAGE_COMMAND_FLUSH, 0);
            }
        }
        self.transform = None;
        if self.mf_started {
            unsafe {
                let _ = MFShutdown();
            }
        }
    }
}

// ---------------------------------------------------------------------------
// MF helpers
// ---------------------------------------------------------------------------

/// Find an H.264 decoder MFT. Tries hardware first, then software.
fn find_h264_decoder(
    input_type: &MFT_REGISTER_TYPE_INFO,
) -> Result<(IMFTransform, bool, String), String> {
    if let Ok(result) = try_enum_decoder(input_type, true) {
        return Ok(result);
    }
    try_enum_decoder(input_type, false)
}

fn try_enum_decoder(
    input_type: &MFT_REGISTER_TYPE_INFO,
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
            MFT_CATEGORY_VIDEO_DECODER,
            flags,
            Some(input_type),
            None,
            &mut activate_array,
            &mut count,
        )
        .map_err(|e| format!("MFTEnumEx: {e}"))?;
    }

    if count == 0 || activate_array.is_null() {
        return Err(format!(
            "No {} H.264 decoder found",
            if hardware { "hardware" } else { "software" }
        ));
    }

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
            String::from(if hardware { "hw-h264-dec" } else { "sw-h264-dec" })
        };

        // Free the activate array
        for i in 0..count as usize {
            let arr = std::slice::from_raw_parts(activate_array, count as usize);
            drop(arr[i].clone());
        }
        CoTaskMemFree(Some(activate_array as *const _));

        name
    };

    let transform: IMFTransform = unsafe {
        activate
            .ActivateObject()
            .map_err(|e| format!("ActivateObject: {e}"))?
    };

    log::info!(
        "Found {} H.264 decoder: {}",
        if hardware { "hardware" } else { "software" },
        name
    );

    Ok((transform, hardware, name))
}

fn create_h264_input_type(
    width: u32,
    height: u32,
    fps: u32,
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
            .SetUINT32(
                &MF_MT_INTERLACE_MODE_GUID,
                MFVideoInterlace_Progressive.0 as u32,
            )
            .map_err(|e| format!("SetUINT32 interlace: {e}"))?;

        let frame_size = ((width as u64) << 32) | (height as u64);
        media_type
            .SetUINT64(&MF_MT_FRAME_SIZE_GUID, frame_size)
            .map_err(|e| format!("SetUINT64 frame_size: {e}"))?;

        let frame_rate = ((fps as u64) << 32) | 1u64;
        media_type
            .SetUINT64(&MF_MT_FRAME_RATE_GUID, frame_rate)
            .map_err(|e| format!("SetUINT64 frame_rate: {e}"))?;

        Ok(media_type)
    }
}

fn create_nv12_output_type(
    width: u32,
    height: u32,
    fps: u32,
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

        let frame_rate = ((fps as u64) << 32) | 1u64;
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

/// Read decoded NV12 output from the MFT. Returns (nv12_data, pts_ms) or None.
fn read_output(transform: &IMFTransform) -> Result<Option<(Vec<u8>, u64)>, String> {
    unsafe {
        let stream_info = transform
            .GetOutputStreamInfo(0)
            .map_err(|e| format!("GetOutputStreamInfo: {e}"))?;

        let provides_samples =
            (stream_info.dwFlags & (MFT_OUTPUT_STREAM_PROVIDES_SAMPLES.0 as u32)) != 0;

        let mut buffers = [MFT_OUTPUT_DATA_BUFFER::default()];
        buffers[0].dwStreamID = 0;

        if !provides_samples {
            let sample: IMFSample =
                MFCreateSample().map_err(|e| format!("MFCreateSample (out): {e}"))?;
            // NV12 size: w*h*3/2, but use stream_info.cbSize if available
            let buf_size = stream_info.cbSize.max(1024 * 1024);
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
                if e.code().0 as u32 == 0xC00D6D72 {
                    // MF_E_TRANSFORM_NEED_MORE_INPUT
                    return Ok(None);
                }
                if e.code().0 as u32 == 0xC00D6D61 {
                    // MF_E_TRANSFORM_STREAM_CHANGE
                    log::warn!("MFT decoder output format changed — re-negotiating");
                    return Ok(None);
                }
                return Err(format!("ProcessOutput: {e}"));
            }
        }

        let sample = std::mem::ManuallyDrop::into_inner(buffers[0].pSample.clone());
        if let Some(sample) = sample {
            // Extract PTS
            let pts_hns = sample.GetSampleTime().unwrap_or(0);
            let pts_ms = (pts_hns / 10_000) as u64;

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

            Ok(Some((data, pts_ms)))
        } else {
            Ok(None)
        }
    }
}

// ---------------------------------------------------------------------------
// NV12 → BGRA color conversion
// ---------------------------------------------------------------------------

/// Convert NV12 to BGRA. Inverse of the encoder's bgra_to_nv12.
/// NV12 layout: width*height bytes of Y, then width*height/2 bytes of interleaved UV.
fn nv12_to_bgra(nv12: &[u8], width: u32, height: u32, bgra: &mut [u8]) {
    let w = width as usize;
    let h = height as usize;
    let y_plane = &nv12[..w * h];
    let uv_plane = &nv12[w * h..];

    for y in 0..h {
        for x in 0..w {
            let luma = y_plane[y * w + x] as i32;

            // UV is subsampled 2x2
            let uv_idx = (y / 2) * w + (x / 2) * 2;
            let u = uv_plane.get(uv_idx).copied().unwrap_or(128) as i32;
            let v = uv_plane.get(uv_idx + 1).copied().unwrap_or(128) as i32;

            // BT.601 YUV → RGB (inverse of encoder coefficients)
            let c = luma - 16;
            let d = u - 128;
            let e = v - 128;

            let r = ((298 * c + 409 * e + 128) >> 8).clamp(0, 255);
            let g = ((298 * c - 100 * d - 208 * e + 128) >> 8).clamp(0, 255);
            let b = ((298 * c + 516 * d + 128) >> 8).clamp(0, 255);

            let dst = (y * w + x) * 4;
            bgra[dst] = b as u8;
            bgra[dst + 1] = g as u8;
            bgra[dst + 2] = r as u8;
            bgra[dst + 3] = 255; // opaque alpha
        }
    }
}
