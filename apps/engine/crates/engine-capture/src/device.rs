use windows::Win32::Graphics::Direct3D::*;
use windows::Win32::Graphics::Direct3D11::*;
use windows::Win32::Graphics::Dxgi::*;

/// Creates a D3D11 device and immediate context for DXGI capture.
/// Returns (device, context, DXGI adapter).
pub fn create_d3d11_device() -> Result<(ID3D11Device, ID3D11DeviceContext, IDXGIAdapter1), String> {
    // Create DXGI factory to enumerate adapters
    let factory: IDXGIFactory1 =
        unsafe { CreateDXGIFactory1() }.map_err(|e| format!("CreateDXGIFactory1: {e}"))?;

    // Use the default adapter (GPU 0)
    let adapter: IDXGIAdapter1 = unsafe { factory.EnumAdapters1(0) }
        .map_err(|e| format!("EnumAdapters1: {e}"))?;

    let adapter_desc = unsafe { adapter.GetDesc1() }
        .map_err(|e| format!("GetDesc1: {e}"))?;

    let adapter_name = String::from_utf16_lossy(
        &adapter_desc
            .Description
            .iter()
            .take_while(|&&c| c != 0)
            .copied()
            .collect::<Vec<u16>>(),
    );

    log::info!("GPU: {} (VRAM: {}MB)", adapter_name, adapter_desc.DedicatedVideoMemory / (1024 * 1024));

    let feature_levels = [D3D_FEATURE_LEVEL_11_0, D3D_FEATURE_LEVEL_10_1];
    let mut device = None;
    let mut context = None;

    unsafe {
        D3D11CreateDevice(
            &adapter,
            D3D_DRIVER_TYPE_UNKNOWN, // Using explicit adapter
            None,
            D3D11_CREATE_DEVICE_BGRA_SUPPORT,
            Some(&feature_levels),
            D3D11_SDK_VERSION,
            Some(&mut device),
            None,
            Some(&mut context),
        )
        .map_err(|e| format!("D3D11CreateDevice: {e}"))?;
    }

    let device = device.ok_or("D3D11 device was null")?;
    let context = context.ok_or("D3D11 context was null")?;

    Ok((device, context, adapter))
}

/// Detect GPU vendor from adapter description.
pub fn detect_gpu_vendor(adapter: &IDXGIAdapter1) -> GpuVendor {
    let desc = unsafe { adapter.GetDesc1() };
    match desc {
        Ok(d) => match d.VendorId {
            0x10DE => GpuVendor::Nvidia,
            0x1002 | 0x1022 => GpuVendor::Amd,
            0x8086 | 0x8087 => GpuVendor::Intel,
            _ => GpuVendor::Unknown,
        },
        Err(_) => GpuVendor::Unknown,
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum GpuVendor {
    Nvidia,
    Amd,
    Intel,
    Unknown,
}

impl std::fmt::Display for GpuVendor {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        match self {
            GpuVendor::Nvidia => write!(f, "NVIDIA"),
            GpuVendor::Amd => write!(f, "AMD"),
            GpuVendor::Intel => write!(f, "Intel"),
            GpuVendor::Unknown => write!(f, "Unknown"),
        }
    }
}
