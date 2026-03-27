use std::sync::atomic::{AtomicBool, AtomicIsize, Ordering};
use std::sync::OnceLock;
use crossbeam_channel::Sender;
use windows::core::w;
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, RECT, WPARAM};
use windows::Win32::Graphics::Gdi::{GetUpdateRect, ValidateRect};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::UI::WindowsAndMessaging::*;

const PIP_CLASS: windows::core::PCWSTR = w!("RipcordPiPWindow");
const PIP_DEFAULT_WIDTH: i32 = 320;
const PIP_DEFAULT_HEIGHT: i32 = 240;
const PIP_MIN_WIDTH: i32 = 200;
const PIP_MIN_HEIGHT: i32 = 150;

/// Snap edge threshold in pixels — how close to screen edge before auto-docking.
const SNAP_THRESHOLD: i32 = 20;

/// Events from the PiP window.
#[derive(Debug)]
pub enum PipEvent {
    Resized(u32, u32),
    Closed,
}

static PIP_HWND: AtomicIsize = AtomicIsize::new(0);
static PIP_VISIBLE: AtomicBool = AtomicBool::new(false);
static PIP_EVENT_TX: OnceLock<Sender<PipEvent>> = OnceLock::new();

/// Check if PiP window exists and is visible.
pub fn is_visible() -> bool {
    PIP_VISIBLE.load(Ordering::Relaxed)
}

/// Get the PiP HWND if it exists.
pub fn hwnd() -> Option<isize> {
    let h = PIP_HWND.load(Ordering::Relaxed);
    if h != 0 { Some(h) } else { None }
}

/// Create the PiP window. Must be called from the main thread.
pub fn create(event_tx: Sender<PipEvent>) {
    if PIP_HWND.load(Ordering::Relaxed) != 0 {
        // Already exists, just show it
        show();
        return;
    }

    let _ = PIP_EVENT_TX.set(event_tx);

    unsafe {
        let hinstance = GetModuleHandleW(None).expect("GetModuleHandle failed");

        let wc = WNDCLASSEXW {
            cbSize: std::mem::size_of::<WNDCLASSEXW>() as u32,
            style: CS_HREDRAW | CS_VREDRAW,
            lpfnWndProc: Some(pip_wndproc),
            hInstance: hinstance.into(),
            hCursor: LoadCursorW(None, IDC_ARROW).unwrap_or_default(),
            lpszClassName: PIP_CLASS,
            ..Default::default()
        };

        let _ = RegisterClassExW(&wc);

        let hwnd = CreateWindowExW(
            WS_EX_TOPMOST,
            PIP_CLASS,
            w!("Ripcord PiP"),
            WS_POPUP | WS_THICKFRAME,
            CW_USEDEFAULT,
            CW_USEDEFAULT,
            PIP_DEFAULT_WIDTH,
            PIP_DEFAULT_HEIGHT,
            None,
            None,
            hinstance,
            None,
        )
        .expect("Failed to create PiP window");

        PIP_HWND.store(hwnd.0 as isize, Ordering::Relaxed);

        let _ = ShowWindow(hwnd, SW_SHOW);
        PIP_VISIBLE.store(true, Ordering::Relaxed);
    }
}

/// Show the PiP window.
pub fn show() {
    let h = PIP_HWND.load(Ordering::Relaxed);
    if h != 0 {
        let hwnd = HWND(h as *mut _);
        unsafe {
            let _ = ShowWindow(hwnd, SW_SHOW);
        }
        PIP_VISIBLE.store(true, Ordering::Relaxed);
    }
}

/// Hide the PiP window (doesn't destroy it).
pub fn hide() {
    let h = PIP_HWND.load(Ordering::Relaxed);
    if h != 0 {
        let hwnd = HWND(h as *mut _);
        unsafe {
            let _ = ShowWindow(hwnd, SW_HIDE);
        }
        PIP_VISIBLE.store(false, Ordering::Relaxed);
    }
}

/// Destroy the PiP window.
pub fn destroy() {
    let h = PIP_HWND.load(Ordering::Relaxed);
    if h != 0 {
        let hwnd = HWND(h as *mut _);
        unsafe {
            let _ = DestroyWindow(hwnd);
        }
        PIP_HWND.store(0, Ordering::Relaxed);
        PIP_VISIBLE.store(false, Ordering::Relaxed);
    }
}

/// Set the PiP window position.
pub fn set_position(x: i32, y: i32, width: i32, height: i32) {
    let h = PIP_HWND.load(Ordering::Relaxed);
    if h != 0 {
        let hwnd = HWND(h as *mut _);
        unsafe {
            let _ = SetWindowPos(
                hwnd,
                HWND_TOPMOST,
                x,
                y,
                width,
                height,
                SWP_NOACTIVATE,
            );
        }
    }
}

/// Snap the window to screen edges after a move.
fn snap_to_edges(hwnd: HWND) {
    unsafe {
        let mut win_rect = RECT::default();
        let _ = GetWindowRect(hwnd, &mut win_rect);

        // Get the work area of the monitor the window is on
        let monitor = windows::Win32::Graphics::Gdi::MonitorFromWindow(
            hwnd,
            windows::Win32::Graphics::Gdi::MONITOR_DEFAULTTONEAREST,
        );

        let mut mi = windows::Win32::Graphics::Gdi::MONITORINFO {
            cbSize: std::mem::size_of::<windows::Win32::Graphics::Gdi::MONITORINFO>() as u32,
            ..Default::default()
        };
        let _ = windows::Win32::Graphics::Gdi::GetMonitorInfoW(monitor, &mut mi);
        let work = mi.rcWork;

        let win_w = win_rect.right - win_rect.left;
        let win_h = win_rect.bottom - win_rect.top;

        let mut x = win_rect.left;
        let mut y = win_rect.top;

        // Snap to left edge
        if (x - work.left).abs() < SNAP_THRESHOLD {
            x = work.left;
        }
        // Snap to right edge
        if (win_rect.right - work.right).abs() < SNAP_THRESHOLD {
            x = work.right - win_w;
        }
        // Snap to top edge
        if (y - work.top).abs() < SNAP_THRESHOLD {
            y = work.top;
        }
        // Snap to bottom edge
        if (win_rect.bottom - work.bottom).abs() < SNAP_THRESHOLD {
            y = work.bottom - win_h;
        }

        if x != win_rect.left || y != win_rect.top {
            let _ = SetWindowPos(
                hwnd,
                HWND_TOPMOST,
                x,
                y,
                win_w,
                win_h,
                SWP_NOACTIVATE,
            );
        }
    }
}

unsafe extern "system" fn pip_wndproc(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    let send = |evt: PipEvent| {
        if let Some(tx) = PIP_EVENT_TX.get() {
            let _ = tx.send(evt);
        }
    };

    match msg {
        WM_SIZE => {
            let width = (lparam.0 & 0xFFFF) as u32;
            let height = ((lparam.0 >> 16) & 0xFFFF) as u32;
            send(PipEvent::Resized(width, height));
            LRESULT(0)
        }

        WM_GETMINMAXINFO => {
            let info = &mut *(lparam.0 as *mut MINMAXINFO);
            info.ptMinTrackSize.x = PIP_MIN_WIDTH;
            info.ptMinTrackSize.y = PIP_MIN_HEIGHT;
            LRESULT(0)
        }

        WM_NCHITTEST => {
            // Entire PiP is draggable, with resize borders
            let x = (lparam.0 & 0xFFFF) as i16 as i32;
            let y = ((lparam.0 >> 16) & 0xFFFF) as i16 as i32;

            let mut rect = RECT::default();
            let _ = GetWindowRect(hwnd, &mut rect);

            let border = 6;
            let on_left = x < rect.left + border;
            let on_right = x >= rect.right - border;
            let on_top = y < rect.top + border;
            let on_bottom = y >= rect.bottom - border;

            let hit = if on_top && on_left {
                HTTOPLEFT
            } else if on_top && on_right {
                HTTOPRIGHT
            } else if on_bottom && on_left {
                HTBOTTOMLEFT
            } else if on_bottom && on_right {
                HTBOTTOMRIGHT
            } else if on_left {
                HTLEFT
            } else if on_right {
                HTRIGHT
            } else if on_top {
                HTTOP
            } else if on_bottom {
                HTBOTTOM
            } else {
                HTCAPTION // entire client area is draggable
            };

            LRESULT(hit as isize)
        }

        WM_EXITSIZEMOVE => {
            // Snap to screen edges after drag/resize
            snap_to_edges(hwnd);
            LRESULT(0)
        }

        WM_PAINT => {
            let mut rect = RECT::default();
            if GetUpdateRect(hwnd, Some(&mut rect), false).as_bool() {
                let _ = ValidateRect(hwnd, Some(&rect));
            }
            LRESULT(0)
        }

        WM_CLOSE => {
            // Hide instead of destroy — we'll reuse it
            hide();
            send(PipEvent::Closed);
            LRESULT(0)
        }

        _ => DefWindowProcW(hwnd, msg, wparam, lparam),
    }
}
