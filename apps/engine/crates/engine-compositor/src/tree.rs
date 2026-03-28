use windows::Win32::Foundation::HWND;
use windows::Win32::Graphics::DirectComposition::*;

use crate::device::GpuDevice;
use crate::surface::CompositionSurface;

/// Manages the DirectComposition visual tree bound to an HWND.
pub struct Compositor {
    pub gpu: GpuDevice,
    target: IDCompositionTarget,
    root: IDCompositionVisual,
    surfaces: Vec<SurfaceEntry>,
}

// SAFETY: DirectComposition and D3D11 COM objects are free-threaded (MTA).
// All access is serialized through the Mutex<Option<Compositor>> in engine-core.
unsafe impl Send for Compositor {}
unsafe impl Sync for Compositor {}

struct SurfaceEntry {
    name: String,
    surface: CompositionSurface,
}

impl Compositor {
    /// Bind a DirectComposition visual tree to the given window.
    pub fn new(hwnd_raw: isize) -> Result<Self, String> {
        let gpu = GpuDevice::new()?;
        let hwnd = HWND(hwnd_raw as *mut _);

        let target = unsafe { gpu.dcomp.CreateTargetForHwnd(hwnd, true) }
            .map_err(|e| format!("CreateTargetForHwnd: {e}"))?;

        let root = unsafe { gpu.dcomp.CreateVisual() }
            .map_err(|e| format!("CreateVisual (root): {e}"))?;

        unsafe {
            target
                .SetRoot(&root)
                .map_err(|e| format!("SetRoot: {e}"))?;

            gpu.dcomp.Commit().map_err(|e| format!("Commit: {e}"))?;
        }

        log::info!("Compositor bound to hwnd={hwnd_raw:#x}");

        Ok(Self {
            gpu,
            target,
            root,
            surfaces: Vec::new(),
        })
    }

    /// Add a named surface to the visual tree at the given position.
    pub fn add_surface(
        &mut self,
        name: &str,
        width: u32,
        height: u32,
        offset_x: f32,
        offset_y: f32,
    ) -> Result<usize, String> {
        let surface = CompositionSurface::new(&self.gpu, width, height)?;

        // Position the visual
        unsafe {
            surface
                .visual
                .SetOffsetX2(offset_x)
                .map_err(|e| format!("SetOffsetX: {e}"))?;
            surface
                .visual
                .SetOffsetY2(offset_y)
                .map_err(|e| format!("SetOffsetY: {e}"))?;
        }

        // Add to root visual tree
        unsafe {
            self.root
                .AddVisual(&surface.visual, true, None)
                .map_err(|e| format!("AddVisual: {e}"))?;

            self.gpu
                .dcomp
                .Commit()
                .map_err(|e| format!("Commit: {e}"))?;
        }

        let index = self.surfaces.len();
        self.surfaces.push(SurfaceEntry {
            name: name.to_string(),
            surface,
        });

        log::info!(
            "Surface '{}' added at index={index} ({width}x{height} @ {offset_x},{offset_y})",
            name
        );

        Ok(index)
    }

    /// Remove a surface by index.
    pub fn remove_surface(&mut self, index: usize) -> Result<(), String> {
        if index >= self.surfaces.len() {
            return Err(format!("Surface index {index} out of range"));
        }

        let entry = &self.surfaces[index];
        unsafe {
            self.root
                .RemoveVisual(&entry.surface.visual)
                .map_err(|e| format!("RemoveVisual: {e}"))?;

            self.gpu
                .dcomp
                .Commit()
                .map_err(|e| format!("Commit: {e}"))?;
        }

        let name = self.surfaces.remove(index).name;
        log::info!("Surface '{name}' removed (was index={index})");
        Ok(())
    }

    /// Get a mutable reference to a surface by index.
    pub fn surface_mut(&mut self, index: usize) -> Option<&mut CompositionSurface> {
        self.surfaces.get_mut(index).map(|e| &mut e.surface)
    }

    /// Get a reference to a surface by name.
    pub fn surface_by_name(&self, name: &str) -> Option<(usize, &CompositionSurface)> {
        self.surfaces
            .iter()
            .enumerate()
            .find(|(_, e)| e.name == name)
            .map(|(i, e)| (i, &e.surface))
    }

    /// Reposition a surface.
    pub fn set_surface_offset(
        &self,
        index: usize,
        offset_x: f32,
        offset_y: f32,
    ) -> Result<(), String> {
        let entry = self
            .surfaces
            .get(index)
            .ok_or(format!("Surface index {index} out of range"))?;

        unsafe {
            entry
                .surface
                .visual
                .SetOffsetX2(offset_x)
                .map_err(|e| format!("SetOffsetX: {e}"))?;
            entry
                .surface
                .visual
                .SetOffsetY2(offset_y)
                .map_err(|e| format!("SetOffsetY: {e}"))?;

            self.gpu
                .dcomp
                .Commit()
                .map_err(|e| format!("Commit: {e}"))?;
        }

        Ok(())
    }

    /// Clear a surface to a solid color.
    pub fn clear_surface(
        &self,
        index: usize,
        r: f32,
        g: f32,
        b: f32,
        a: f32,
    ) -> Result<(), String> {
        let entry = self
            .surfaces
            .get(index)
            .ok_or(format!("Surface index {index} out of range"))?;
        crate::renderer::clear_surface(&self.gpu, &entry.surface, r, g, b, a)
    }

    /// Blit a BGRA frame onto a surface.
    pub fn blit_frame(
        &self,
        index: usize,
        bgra_data: &[u8],
        src_width: u32,
        src_height: u32,
    ) -> Result<(), String> {
        let entry = self
            .surfaces
            .get(index)
            .ok_or(format!("Surface index {index} out of range"))?;
        crate::renderer::blit_frame(&self.gpu, &entry.surface, bgra_data, src_width, src_height)
    }

    /// Number of active surfaces.
    pub fn surface_count(&self) -> usize {
        self.surfaces.len()
    }

    /// Commit any pending visual tree changes.
    pub fn commit(&self) -> Result<(), String> {
        unsafe {
            self.gpu
                .dcomp
                .Commit()
                .map_err(|e| format!("Commit: {e}"))
        }
    }
}
