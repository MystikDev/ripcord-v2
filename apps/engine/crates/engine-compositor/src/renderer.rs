use windows::Win32::Graphics::Direct3D11::*;
use windows::Win32::Graphics::Dxgi::Common::*;

use crate::device::GpuDevice;
use crate::surface::CompositionSurface;

/// Blits a BGRA frame buffer onto a composition surface's swap chain.
/// This is the simplest possible renderer — a CPU-to-GPU texture upload + copy.
pub fn blit_frame(
    gpu: &GpuDevice,
    surface: &CompositionSurface,
    bgra_data: &[u8],
    src_width: u32,
    src_height: u32,
) -> Result<(), String> {
    let expected_len = (src_width * src_height * 4) as usize;
    if bgra_data.len() < expected_len {
        return Err(format!(
            "Frame data too small: {} < {expected_len}",
            bgra_data.len()
        ));
    }

    // Create a staging texture with the source frame data
    let tex_desc = D3D11_TEXTURE2D_DESC {
        Width: src_width,
        Height: src_height,
        MipLevels: 1,
        ArraySize: 1,
        Format: DXGI_FORMAT_B8G8R8A8_UNORM,
        SampleDesc: DXGI_SAMPLE_DESC {
            Count: 1,
            Quality: 0,
        },
        Usage: D3D11_USAGE_DEFAULT,
        BindFlags: D3D11_BIND_SHADER_RESOURCE.0 as u32,
        CPUAccessFlags: 0,
        MiscFlags: 0,
    };

    let init_data = D3D11_SUBRESOURCE_DATA {
        pSysMem: bgra_data.as_ptr() as *const _,
        SysMemPitch: src_width * 4,
        SysMemSlicePitch: 0,
    };

    let mut staging: Option<ID3D11Texture2D> = None;
    unsafe {
        gpu.device
            .CreateTexture2D(&tex_desc, Some(&init_data), Some(&mut staging))
            .map_err(|e| format!("CreateTexture2D (staging): {e}"))?;
    }
    let staging = staging.ok_or("Staging texture was null")?;

    // Get the back buffer from the swap chain
    let back_buffer = surface.back_buffer()?;

    // Copy the staging texture to the back buffer.
    // If sizes differ, we use CopySubresourceRegion to copy what fits.
    unsafe {
        if src_width == surface.width && src_height == surface.height {
            gpu.context.CopyResource(&back_buffer, &staging);
        } else {
            // Copy the smaller region
            let copy_w = src_width.min(surface.width);
            let copy_h = src_height.min(surface.height);
            let box_ = D3D11_BOX {
                left: 0,
                top: 0,
                front: 0,
                right: copy_w,
                bottom: copy_h,
                back: 1,
            };
            gpu.context.CopySubresourceRegion(
                &back_buffer,
                0,
                0,
                0,
                0,
                &staging,
                0,
                Some(&box_),
            );
        }
    }

    // Present
    surface.present()?;

    Ok(())
}

/// Clear a surface to a solid BGRA color.
pub fn clear_surface(
    gpu: &GpuDevice,
    surface: &CompositionSurface,
    r: f32,
    g: f32,
    b: f32,
    a: f32,
) -> Result<(), String> {
    let back_buffer = surface.back_buffer()?;

    let mut rtv: Option<ID3D11RenderTargetView> = None;
    unsafe {
        gpu.device
            .CreateRenderTargetView(&back_buffer, None, Some(&mut rtv))
            .map_err(|e| format!("CreateRenderTargetView: {e}"))?;
    }
    let rtv = rtv.ok_or("RenderTargetView was null")?;

    unsafe {
        gpu.context.ClearRenderTargetView(&rtv, &[r, g, b, a]);
    }

    surface.present()?;
    Ok(())
}
