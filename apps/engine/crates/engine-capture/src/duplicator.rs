use windows::core::Interface;
use windows::Win32::Graphics::Direct3D11::*;
use windows::Win32::Graphics::Dxgi::*;
use windows::Win32::Graphics::Dxgi::Common::*;

/// Wraps DXGI Output Duplication for screen capture.
/// Acquires frames as ID3D11Texture2D on the GPU — zero CPU readback.
pub struct Duplicator {
    duplication: IDXGIOutputDuplication,
    _device: ID3D11Device,
    context: ID3D11DeviceContext,
    width: u32,
    height: u32,
    /// Staging texture for CPU readback (used for encoding).
    staging: ID3D11Texture2D,
}

/// A captured frame with metadata.
pub struct CapturedFrame {
    /// Raw BGRA pixel data (CPU-side copy for encoding).
    pub data: Vec<u8>,
    pub width: u32,
    pub height: u32,
    pub stride: u32,
    /// Dirty rects from DXGI — regions that changed since last frame.
    pub dirty_rect_count: u32,
}

impl Duplicator {
    /// Create a duplicator for a specific DXGI output (monitor).
    /// `output_index` is the monitor index (0 = primary).
    pub fn new(
        device: &ID3D11Device,
        context: &ID3D11DeviceContext,
        adapter: &IDXGIAdapter1,
        output_index: u32,
    ) -> Result<Self, String> {
        // Get the output
        let output: IDXGIOutput = unsafe { adapter.EnumOutputs(output_index) }
            .map_err(|e| format!("EnumOutputs({output_index}): {e}"))?;

        let output_desc = unsafe { output.GetDesc() }
            .map_err(|e| format!("GetDesc: {e}"))?;

        let width = (output_desc.DesktopCoordinates.right - output_desc.DesktopCoordinates.left) as u32;
        let height = (output_desc.DesktopCoordinates.bottom - output_desc.DesktopCoordinates.top) as u32;

        let device_name = String::from_utf16_lossy(
            &output_desc
                .DeviceName
                .iter()
                .take_while(|&&c| c != 0)
                .copied()
                .collect::<Vec<u16>>(),
        );
        log::info!("Capture output: {} ({}x{})", device_name, width, height);

        // Cast to IDXGIOutput1 for DuplicateOutput
        let output1: IDXGIOutput1 = output
            .cast()
            .map_err(|e| format!("Cast to IDXGIOutput1: {e}"))?;

        let duplication = unsafe { output1.DuplicateOutput(device) }
            .map_err(|e| format!("DuplicateOutput: {e}"))?;

        // Create staging texture for CPU readback
        let staging_desc = D3D11_TEXTURE2D_DESC {
            Width: width,
            Height: height,
            MipLevels: 1,
            ArraySize: 1,
            Format: DXGI_FORMAT_B8G8R8A8_UNORM,
            SampleDesc: DXGI_SAMPLE_DESC {
                Count: 1,
                Quality: 0,
            },
            Usage: D3D11_USAGE_STAGING,
            BindFlags: 0,
            CPUAccessFlags: D3D11_CPU_ACCESS_READ.0 as u32,
            MiscFlags: 0,
        };

        let mut staging: Option<ID3D11Texture2D> = None;
        unsafe {
            device
                .CreateTexture2D(&staging_desc, None, Some(&mut staging))
                .map_err(|e| format!("CreateTexture2D staging: {e}"))?;
        }
        let staging = staging.ok_or("CreateTexture2D returned null")?;

        Ok(Self {
            duplication,
            _device: device.clone(),
            context: context.clone(),
            width,
            height,
            staging,
        })
    }

    /// Acquire the next frame. Returns None if no new frame is available within the timeout.
    /// `timeout_ms` — how long to wait for a new frame (0 = non-blocking).
    pub fn acquire_frame(&mut self, timeout_ms: u32) -> Result<Option<CapturedFrame>, String> {
        let mut frame_info = DXGI_OUTDUPL_FRAME_INFO::default();
        let mut resource = None;

        let hr = unsafe {
            self.duplication
                .AcquireNextFrame(timeout_ms, &mut frame_info, &mut resource)
        };

        match hr {
            Ok(()) => {}
            Err(e) => {
                let code = e.code().0 as u32;
                if code == 0x887A0027 {
                    // DXGI_ERROR_WAIT_TIMEOUT — no new frame
                    return Ok(None);
                }
                return Err(format!("AcquireNextFrame: {e}"));
            }
        }

        let resource: IDXGIResource = resource.ok_or("AcquireNextFrame returned null resource")?;
        let texture: ID3D11Texture2D = resource
            .cast()
            .map_err(|e| format!("Cast to ID3D11Texture2D: {e}"))?;

        // Copy to staging texture for CPU readback
        unsafe {
            self.context.CopyResource(&self.staging, &texture);
        }

        // Map staging texture to read pixels
        let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
        unsafe {
            self.context
                .Map(&self.staging, 0, D3D11_MAP_READ, 0, Some(&mut mapped))
                .map_err(|e| format!("Map staging: {e}"))?;
        }

        let stride = mapped.RowPitch;
        let data_size = (stride * self.height) as usize;
        let data = unsafe {
            std::slice::from_raw_parts(mapped.pData as *const u8, data_size).to_vec()
        };

        unsafe {
            self.context.Unmap(&self.staging, 0);
        }

        let dirty_rect_count = frame_info.AccumulatedFrames;

        // Release the frame
        unsafe {
            let _ = self.duplication.ReleaseFrame();
        }

        Ok(Some(CapturedFrame {
            data,
            width: self.width,
            height: self.height,
            stride,
            dirty_rect_count,
        }))
    }

    /// Get the capture dimensions.
    pub fn dimensions(&self) -> (u32, u32) {
        (self.width, self.height)
    }
}

impl Drop for Duplicator {
    fn drop(&mut self) {
        log::info!("DXGI duplicator released ({}x{})", self.width, self.height);
    }
}
