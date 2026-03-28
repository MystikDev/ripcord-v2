use windows::Win32::Graphics::Direct3D11::*;
use windows::Win32::Graphics::DirectComposition::*;
use windows::Win32::Graphics::Dxgi::Common::*;
use windows::Win32::Graphics::Dxgi::*;

use crate::device::GpuDevice;

/// A composition surface backed by a DXGI swap chain.
/// Used to render video frames or other GPU content into the visual tree.
pub struct CompositionSurface {
    pub swap_chain: IDXGISwapChain1,
    pub visual: IDCompositionVisual,
    pub width: u32,
    pub height: u32,
}

impl CompositionSurface {
    /// Create a new composition surface with a swap chain.
    /// The visual is not yet attached to any target — call `Compositor::add_surface`.
    pub fn new(gpu: &GpuDevice, width: u32, height: u32) -> Result<Self, String> {
        let desc = DXGI_SWAP_CHAIN_DESC1 {
            Width: width,
            Height: height,
            Format: DXGI_FORMAT_B8G8R8A8_UNORM,
            Stereo: false.into(),
            SampleDesc: DXGI_SAMPLE_DESC {
                Count: 1,
                Quality: 0,
            },
            BufferUsage: DXGI_USAGE_RENDER_TARGET_OUTPUT,
            BufferCount: 2,
            Scaling: DXGI_SCALING_STRETCH,
            SwapEffect: DXGI_SWAP_EFFECT_FLIP_SEQUENTIAL,
            AlphaMode: DXGI_ALPHA_MODE_PREMULTIPLIED,
            Flags: 0,
        };

        let swap_chain: IDXGISwapChain1 = unsafe {
            gpu.dxgi_factory.CreateSwapChainForComposition(
                &gpu.device,
                &desc,
                None, // no restrict-to-output
            )
        }
        .map_err(|e| format!("CreateSwapChainForComposition: {e}"))?;

        let visual: IDCompositionVisual = unsafe { gpu.dcomp.CreateVisual() }
            .map_err(|e| format!("CreateVisual: {e}"))?;

        unsafe {
            visual
                .SetContent(&swap_chain)
                .map_err(|e| format!("SetContent: {e}"))?;
        }

        log::info!("Composition surface created: {width}x{height}");

        Ok(Self {
            swap_chain,
            visual,
            width,
            height,
        })
    }

    /// Resize the swap chain (e.g., when the window size changes).
    pub fn resize(&mut self, width: u32, height: u32) -> Result<(), String> {
        unsafe {
            self.swap_chain
                .ResizeBuffers(
                    2,
                    width,
                    height,
                    DXGI_FORMAT_B8G8R8A8_UNORM,
                    DXGI_SWAP_CHAIN_FLAG(0),
                )
                .map_err(|e| format!("ResizeBuffers: {e}"))?;
        }
        self.width = width;
        self.height = height;
        log::debug!("Surface resized to {width}x{height}");
        Ok(())
    }

    /// Get the back buffer as a render target for D3D11 drawing.
    pub fn back_buffer(&self) -> Result<ID3D11Texture2D, String> {
        unsafe {
            self.swap_chain
                .GetBuffer::<ID3D11Texture2D>(0)
                .map_err(|e| format!("GetBuffer: {e}"))
        }
    }

    /// Present the composed frame.
    pub fn present(&self) -> Result<(), String> {
        unsafe {
            self.swap_chain
                .Present(1, DXGI_PRESENT(0))
                .ok()
                .map_err(|e| format!("Present: {e}"))
        }
    }
}
