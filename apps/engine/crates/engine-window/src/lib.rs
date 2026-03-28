pub mod overlay;
pub mod pip;
pub mod ptt;
pub mod tray;

use crossbeam_channel::Sender;
use std::sync::OnceLock;
use windows::core::{w, PCWSTR};
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, RECT, WPARAM};
use windows::Win32::Graphics::Gdi::{GetUpdateRect, ValidateRect};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::UI::HiDpi::{
    SetProcessDpiAwarenessContext,
    DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2,
};
use windows::Win32::UI::WindowsAndMessaging::*;

/// Events emitted by the window to the orchestrator.
#[derive(Debug)]
pub enum WindowEvent {
    /// Window has been created. Contains the HWND.
    Created(isize),
    /// Window resize. Contains new width and height.
    Resized(u32, u32),
    /// Window moved. Contains new x, y.
    Moved(i32, i32),
    /// DPI changed. Contains new DPI value.
    DpiChanged(u32),
    /// User requested close.
    CloseRequested,
    /// Window was destroyed.
    Destroyed,
    /// Tray menu action.
    Tray(tray::TrayEvent),
}

/// Stored globally so the wndproc callback can access it.
static EVENT_TX: OnceLock<Sender<WindowEvent>> = OnceLock::new();

const WINDOW_CLASS: PCWSTR = w!("RipcordEngineWindow");
const WINDOW_TITLE: PCWSTR = w!("Ripcord");
const DEFAULT_WIDTH: i32 = 1280;
const DEFAULT_HEIGHT: i32 = 800;
const MIN_WIDTH: i32 = 940;
const MIN_HEIGHT: i32 = 560;

/// Creates the main borderless window and runs the Win32 message pump.
/// This function blocks until the window is closed.
pub fn run(event_tx: Sender<WindowEvent>) {
    EVENT_TX.set(event_tx).expect("Window already initialized");

    unsafe {
        // Per-monitor DPI awareness
        let _ = SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);

        let hinstance = GetModuleHandleW(None).expect("GetModuleHandle failed");

        // Register window class
        let wc = WNDCLASSEXW {
            cbSize: std::mem::size_of::<WNDCLASSEXW>() as u32,
            style: CS_HREDRAW | CS_VREDRAW,
            lpfnWndProc: Some(wndproc),
            hInstance: hinstance.into(),
            hCursor: LoadCursorW(None, IDC_ARROW).unwrap_or_default(),
            lpszClassName: WINDOW_CLASS,
            ..Default::default()
        };

        let atom = RegisterClassExW(&wc);
        assert!(atom != 0, "RegisterClassExW failed");

        // Borderless window with WS_THICKFRAME for resize and snap support.
        let style = WS_POPUP | WS_THICKFRAME | WS_MINIMIZEBOX | WS_MAXIMIZEBOX;

        let hwnd = CreateWindowExW(
            WINDOW_EX_STYLE::default(),
            WINDOW_CLASS,
            WINDOW_TITLE,
            style,
            CW_USEDEFAULT,
            CW_USEDEFAULT,
            DEFAULT_WIDTH,
            DEFAULT_HEIGHT,
            None,
            None,
            hinstance,
            None,
        )
        .expect("CreateWindowExW failed");

        let _ = ShowWindow(hwnd, SW_SHOW);

        // Message pump
        let mut msg = MSG::default();
        while GetMessageW(&mut msg, None, 0, 0).as_bool() {
            let _ = TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    }
}

/// Minimize the main window.
pub fn minimize(hwnd_raw: isize) {
    let hwnd = HWND(hwnd_raw as *mut _);
    unsafe {
        let _ = ShowWindow(hwnd, SW_MINIMIZE);
    }
}

/// Minimize to system tray (hide the window).
pub fn minimize_to_tray(hwnd_raw: isize) {
    let hwnd = HWND(hwnd_raw as *mut _);
    unsafe {
        let _ = ShowWindow(hwnd, SW_HIDE);
    }
}

/// Restore the window from tray or minimized state.
pub fn restore(hwnd_raw: isize) {
    let hwnd = HWND(hwnd_raw as *mut _);
    unsafe {
        let _ = ShowWindow(hwnd, SW_SHOW);
        let _ = SetForegroundWindow(hwnd);
    }
}

/// Maximize or restore the window.
pub fn maximize(hwnd_raw: isize) {
    let hwnd = HWND(hwnd_raw as *mut _);
    unsafe {
        let style = GetWindowLongW(hwnd, GWL_STYLE) as u32;
        if style & WS_MAXIMIZE.0 != 0 {
            let _ = ShowWindow(hwnd, SW_RESTORE);
        } else {
            let _ = ShowWindow(hwnd, SW_MAXIMIZE);
        }
    }
}

/// Close the window.
pub fn close(hwnd_raw: isize) {
    let hwnd = HWND(hwnd_raw as *mut _);
    unsafe {
        let _ = PostMessageW(hwnd, WM_CLOSE, WPARAM(0), LPARAM(0));
    }
}

/// The window procedure handles all window messages.
unsafe extern "system" fn wndproc(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    let send = |evt: WindowEvent| {
        if let Some(tx) = EVENT_TX.get() {
            let _ = tx.send(evt);
        }
    };

    match msg {
        WM_CREATE => {
            send(WindowEvent::Created(hwnd.0 as isize));
            LRESULT(0)
        }

        WM_SIZE => {
            let width = (lparam.0 & 0xFFFF) as u32;
            let height = ((lparam.0 >> 16) & 0xFFFF) as u32;
            send(WindowEvent::Resized(width, height));
            LRESULT(0)
        }

        WM_MOVE => {
            let x = (lparam.0 & 0xFFFF) as i16 as i32;
            let y = ((lparam.0 >> 16) & 0xFFFF) as i16 as i32;
            send(WindowEvent::Moved(x, y));
            LRESULT(0)
        }

        WM_GETMINMAXINFO => {
            let info = &mut *(lparam.0 as *mut MINMAXINFO);
            info.ptMinTrackSize.x = MIN_WIDTH;
            info.ptMinTrackSize.y = MIN_HEIGHT;
            LRESULT(0)
        }

        WM_NCHITTEST => {
            // Custom hit-testing for borderless window
            let x = (lparam.0 & 0xFFFF) as i16 as i32;
            let y = ((lparam.0 >> 16) & 0xFFFF) as i16 as i32;

            let mut rect = RECT::default();
            let _ = GetWindowRect(hwnd, &mut rect);

            let border = 8;

            let on_left = x < rect.left + border;
            let on_right = x >= rect.right - border;
            let on_top = y < rect.top + border;
            let on_bottom = y >= rect.bottom - border;

            // Title bar: top 36px (React renders its own chrome here)
            let title_height = 36;
            let in_title = y >= rect.top + border && y < rect.top + title_height;

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
            } else if in_title {
                HTCAPTION
            } else {
                HTCLIENT
            };

            LRESULT(hit as isize)
        }

        WM_DPICHANGED => {
            let new_dpi = (wparam.0 & 0xFFFF) as u32;
            send(WindowEvent::DpiChanged(new_dpi));

            let suggested = &*(lparam.0 as *const RECT);
            let _ = SetWindowPos(
                hwnd,
                None,
                suggested.left,
                suggested.top,
                suggested.right - suggested.left,
                suggested.bottom - suggested.top,
                SWP_NOZORDER | SWP_NOACTIVATE,
            );

            LRESULT(0)
        }

        WM_PAINT => {
            let mut rect = RECT::default();
            if GetUpdateRect(hwnd, Some(&mut rect), false).as_bool() {
                let _ = ValidateRect(hwnd, Some(&rect));
            }
            LRESULT(0)
        }

        // Tray icon callback
        x if x == tray::WM_TRAY_CALLBACK => {
            if let Some(tray_event) = tray::handle_callback(hwnd.0 as isize, lparam.0) {
                send(WindowEvent::Tray(tray_event));
            }
            LRESULT(0)
        }

        WM_CLOSE => {
            send(WindowEvent::CloseRequested);
            unsafe { DestroyWindow(hwnd).ok() };
            LRESULT(0)
        }

        WM_DESTROY => {
            tray::destroy();
            send(WindowEvent::Destroyed);
            PostQuitMessage(0);
            LRESULT(0)
        }

        _ => DefWindowProcW(hwnd, msg, wparam, lparam),
    }
}
