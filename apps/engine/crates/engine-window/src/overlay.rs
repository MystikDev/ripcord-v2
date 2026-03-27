use std::sync::atomic::{AtomicBool, AtomicIsize, Ordering};
use windows::core::w;
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, RECT, WPARAM};
use windows::Win32::Graphics::Gdi::{GetUpdateRect, ValidateRect};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::UI::WindowsAndMessaging::*;

const OVERLAY_CLASS: windows::core::PCWSTR = w!("RipcordOverlayWindow");

static OVERLAY_HWND: AtomicIsize = AtomicIsize::new(0);
static OVERLAY_VISIBLE: AtomicBool = AtomicBool::new(false);

/// Check if overlay is visible.
pub fn is_visible() -> bool {
    OVERLAY_VISIBLE.load(Ordering::Relaxed)
}

/// Get the overlay HWND if it exists.
pub fn hwnd() -> Option<isize> {
    let h = OVERLAY_HWND.load(Ordering::Relaxed);
    if h != 0 { Some(h) } else { None }
}

/// Create the overlay window that covers the main window.
/// Transparent and click-through — only the compositor renders onto it.
pub fn create(parent_hwnd_raw: isize) {
    if OVERLAY_HWND.load(Ordering::Relaxed) != 0 {
        return; // Already exists
    }

    let parent = HWND(parent_hwnd_raw as *mut _);

    unsafe {
        let hinstance = GetModuleHandleW(None).expect("GetModuleHandle failed");

        let wc = WNDCLASSEXW {
            cbSize: std::mem::size_of::<WNDCLASSEXW>() as u32,
            style: CS_HREDRAW | CS_VREDRAW,
            lpfnWndProc: Some(overlay_wndproc),
            hInstance: hinstance.into(),
            lpszClassName: OVERLAY_CLASS,
            ..Default::default()
        };

        let _ = RegisterClassExW(&wc);

        // Get parent dimensions to match
        let mut parent_rect = RECT::default();
        let _ = GetWindowRect(parent, &mut parent_rect);

        // WS_EX_LAYERED: enables per-pixel alpha
        // WS_EX_TRANSPARENT: click-through (input passes to window below)
        // WS_EX_TOPMOST: stays above main window
        // WS_EX_TOOLWINDOW: doesn't appear in taskbar
        let ex_style = WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_TOPMOST | WS_EX_TOOLWINDOW;

        let hwnd = CreateWindowExW(
            ex_style,
            OVERLAY_CLASS,
            w!(""),
            WS_POPUP,
            parent_rect.left,
            parent_rect.top,
            parent_rect.right - parent_rect.left,
            parent_rect.bottom - parent_rect.top,
            None, // No parent — it's a top-level window positioned over the main window
            None,
            hinstance,
            None,
        )
        .expect("Failed to create overlay window");

        // Set the layered window to be fully transparent initially.
        // The compositor will render onto this surface.
        let _ = SetLayeredWindowAttributes(hwnd, None, 0, LWA_ALPHA);

        OVERLAY_HWND.store(hwnd.0 as isize, Ordering::Relaxed);
    }
}

/// Show the overlay.
pub fn show() {
    let h = OVERLAY_HWND.load(Ordering::Relaxed);
    if h != 0 {
        let hwnd = HWND(h as *mut _);
        unsafe {
            let _ = ShowWindow(hwnd, SW_SHOWNOACTIVATE);
        }
        OVERLAY_VISIBLE.store(true, Ordering::Relaxed);
    }
}

/// Hide the overlay.
pub fn hide() {
    let h = OVERLAY_HWND.load(Ordering::Relaxed);
    if h != 0 {
        let hwnd = HWND(h as *mut _);
        unsafe {
            let _ = ShowWindow(hwnd, SW_HIDE);
        }
        OVERLAY_VISIBLE.store(false, Ordering::Relaxed);
    }
}

/// Destroy the overlay.
pub fn destroy() {
    let h = OVERLAY_HWND.load(Ordering::Relaxed);
    if h != 0 {
        let hwnd = HWND(h as *mut _);
        unsafe {
            let _ = DestroyWindow(hwnd);
        }
        OVERLAY_HWND.store(0, Ordering::Relaxed);
        OVERLAY_VISIBLE.store(false, Ordering::Relaxed);
    }
}

/// Reposition the overlay to match the main window's position and size.
/// Call this when the main window moves or resizes.
pub fn sync_to_parent(parent_hwnd_raw: isize) {
    let h = OVERLAY_HWND.load(Ordering::Relaxed);
    if h == 0 {
        return;
    }

    let parent = HWND(parent_hwnd_raw as *mut _);
    let overlay = HWND(h as *mut _);

    unsafe {
        let mut rect = RECT::default();
        let _ = GetWindowRect(parent, &mut rect);

        let _ = SetWindowPos(
            overlay,
            HWND_TOPMOST,
            rect.left,
            rect.top,
            rect.right - rect.left,
            rect.bottom - rect.top,
            SWP_NOACTIVATE,
        );
    }
}

/// Set overall overlay opacity (0 = fully transparent, 255 = fully opaque).
pub fn set_opacity(alpha: u8) {
    let h = OVERLAY_HWND.load(Ordering::Relaxed);
    if h != 0 {
        let hwnd = HWND(h as *mut _);
        unsafe {
            let _ = SetLayeredWindowAttributes(hwnd, None, alpha, LWA_ALPHA);
        }
    }
}

unsafe extern "system" fn overlay_wndproc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    match msg {
        WM_PAINT => {
            let mut rect = RECT::default();
            if GetUpdateRect(hwnd, Some(&mut rect), false).as_bool() {
                let _ = ValidateRect(hwnd, Some(&rect));
            }
            LRESULT(0)
        }
        _ => DefWindowProcW(hwnd, msg, wparam, lparam),
    }
}
