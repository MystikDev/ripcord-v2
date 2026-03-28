use windows::core::Interface;
use windows::Win32::Graphics::Direct3D::*;
use windows::Win32::Graphics::Direct3D11::*;
use windows::Win32::Graphics::DirectComposition::*;
use windows::Win32::Graphics::Dxgi::*;

/// Shared GPU resources for the compositor.
pub struct GpuDevice {
    pub device: ID3D11Device,
    pub context: ID3D11DeviceContext,
    pub dcomp: IDCompositionDevice,
    pub dxgi_factory: IDXGIFactory2,
    pub adapter: IDXGIAdapter1,
}

impl GpuDevice {
    /// Create D3D11 device + DirectComposition device sharing the same GPU.
    pub fn new() -> Result<Self, String> {
        // DXGI factory (need Factory2 for CreateSwapChainForComposition)
        let dxgi_factory: IDXGIFactory2 =
            unsafe { CreateDXGIFactory1() }.map_err(|e| format!("CreateDXGIFactory1: {e}"))?;

        let adapter: IDXGIAdapter1 = unsafe { dxgi_factory.EnumAdapters1(0) }
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
        log::info!(
            "Compositor GPU: {} (VRAM: {}MB)",
            adapter_name,
            adapter_desc.DedicatedVideoMemory / (1024 * 1024)
        );

        let feature_levels = [D3D_FEATURE_LEVEL_11_0, D3D_FEATURE_LEVEL_10_1];
        let mut device = None;
        let mut context = None;

        unsafe {
            D3D11CreateDevice(
                &adapter,
                D3D_DRIVER_TYPE_UNKNOWN,
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

        // Create DirectComposition device from the DXGI device
        let dxgi_device: IDXGIDevice = device
            .cast::<IDXGIDevice>()
            .map_err(|e| format!("Cast to IDXGIDevice: {e}"))?;

        let dcomp: IDCompositionDevice = unsafe {
            DCompositionCreateDevice(&dxgi_device)
        }
        .map_err(|e| format!("DCompositionCreateDevice: {e}"))?;

        log::info!("DirectComposition device created");

        Ok(Self {
            device,
            context,
            dcomp,
            dxgi_factory,
            adapter,
        })
    }
}
