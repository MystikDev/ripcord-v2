use serde::Serialize;
use windows::Win32::Foundation::*;
use windows::Win32::Graphics::Dxgi::*;
use windows::Win32::UI::WindowsAndMessaging::*;

/// A capturable source (monitor or window).
#[derive(Debug, Clone, Serialize)]
pub struct CaptureSource {
    pub id: String,
    pub name: String,
    pub kind: SourceKind,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SourceKind {
    Monitor,
    Window,
}

/// Enumerate available monitors via DXGI.
pub fn list_monitors() -> Vec<CaptureSource> {
    let mut sources = Vec::new();

    let factory: IDXGIFactory1 = match unsafe { CreateDXGIFactory1() } {
        Ok(f) => f,
        Err(e) => {
            log::error!("CreateDXGIFactory1: {e}");
            return sources;
        }
    };

    let mut adapter_idx = 0u32;
    loop {
        let adapter: IDXGIAdapter1 = match unsafe { factory.EnumAdapters1(adapter_idx) } {
            Ok(a) => a,
            Err(_) => break,
        };

        let mut output_idx = 0u32;
        loop {
            let output: IDXGIOutput = match unsafe { adapter.EnumOutputs(output_idx) } {
                Ok(o) => o,
                Err(_) => break,
            };

            if let Ok(desc) = unsafe { output.GetDesc() } {
                let name = String::from_utf16_lossy(
                    &desc
                        .DeviceName
                        .iter()
                        .take_while(|&&c| c != 0)
                        .copied()
                        .collect::<Vec<u16>>(),
                );
                let w = (desc.DesktopCoordinates.right - desc.DesktopCoordinates.left) as u32;
                let h = (desc.DesktopCoordinates.bottom - desc.DesktopCoordinates.top) as u32;

                sources.push(CaptureSource {
                    id: format!("monitor:{adapter_idx}:{output_idx}"),
                    name: if sources.is_empty() {
                        format!("{name} (Primary)")
                    } else {
                        name
                    },
                    kind: SourceKind::Monitor,
                    width: w,
                    height: h,
                });
            }

            output_idx += 1;
        }

        adapter_idx += 1;
    }

    sources
}

/// Enumerate visible, capturable windows.
pub fn list_windows() -> Vec<CaptureSource> {
    let mut sources = Vec::new();

    unsafe {
        let _ = EnumWindows(
            Some(enum_windows_callback),
            LPARAM(&mut sources as *mut Vec<CaptureSource> as isize),
        );
    }

    sources
}

unsafe extern "system" fn enum_windows_callback(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let sources = &mut *(lparam.0 as *mut Vec<CaptureSource>);

    // Skip invisible windows
    if !IsWindowVisible(hwnd).as_bool() {
        return TRUE;
    }

    // Skip minimized windows
    if IsIconic(hwnd).as_bool() {
        return TRUE;
    }

    // Get window title
    let mut title = [0u16; 256];
    let len = GetWindowTextW(hwnd, &mut title);
    if len == 0 {
        return TRUE;
    }

    let name = String::from_utf16_lossy(&title[..len as usize]);

    // Skip empty titles and some system windows
    if name.is_empty() || name == "Program Manager" || name == "Windows Input Experience" {
        return TRUE;
    }

    // Skip tool windows (tooltips, etc.)
    let ex_style = WINDOW_EX_STYLE(GetWindowLongW(hwnd, GWL_EXSTYLE) as u32);
    if ex_style.contains(WS_EX_TOOLWINDOW) {
        return TRUE;
    }

    // Get window dimensions
    let mut rect = RECT::default();
    if GetWindowRect(hwnd, &mut rect).is_ok() {
        let w = (rect.right - rect.left) as u32;
        let h = (rect.bottom - rect.top) as u32;

        if w > 0 && h > 0 {
            sources.push(CaptureSource {
                id: format!("window:{}", hwnd.0 as usize),
                name,
                kind: SourceKind::Window,
                width: w,
                height: h,
            });
        }
    }

    TRUE
}

/// List all capturable sources (monitors + windows).
pub fn list_all() -> Vec<CaptureSource> {
    let mut all = list_monitors();
    all.extend(list_windows());
    all
}
