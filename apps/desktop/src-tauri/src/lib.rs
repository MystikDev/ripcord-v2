use std::sync::{
    atomic::{AtomicBool, AtomicI32, AtomicU32, Ordering},
    OnceLock,
};
use tauri::{
    menu::{Menu, MenuItem},
    Emitter, Manager,
};

// ===========================================================================
// PTT Low-Level Keyboard Hook (Windows)
// ===========================================================================
//
// Uses `SetWindowsHookEx(WH_KEYBOARD_LL)` to capture key press and release
// events system-wide, even when the Ripcord window is backgrounded. This is
// the same mechanism Discord uses for push-to-talk.
//
// Architecture:
//   1. `start_ptt_hook(keyCode)` spawns a dedicated thread that installs the
//      hook and runs a `GetMessage` pump (required by Windows for LL hooks).
//   2. The hook callback checks every keystroke against the configured PTT
//      virtual-key code. On match it emits Tauri events (`ptt-hook-down` /
//      `ptt-hook-up`) to the frontend via the stored `AppHandle`.
//   3. `stop_ptt_hook()` posts `WM_QUIT` to the hook thread, which tears
//      down the hook and exits.
//
// Key properties:
//   - Event-driven (zero latency vs. the polling approach)
//   - Does not consume the key (other apps still receive it)
//   - Handles both WM_KEYDOWN and WM_KEYUP (unlike RegisterHotKey)
//   - Suppresses key-repeat via an AtomicBool guard
//
// On macOS/Linux the Tauri global-shortcut plugin handles background PTT
// natively (it delivers both Pressed and Released events on those platforms).
// ===========================================================================

/// Tauri AppHandle — stored once at startup so the hook thread can emit events.
static APP_HANDLE: OnceLock<tauri::AppHandle> = OnceLock::new();

/// Virtual-key code of the current PTT key. 0 = disabled.
static PTT_VK: AtomicI32 = AtomicI32::new(0);

/// Whether the PTT key is currently held (prevents duplicate "down" events
/// from key-repeat messages).
static PTT_PRESSED: AtomicBool = AtomicBool::new(false);

/// Whether the hook thread is running.
static HOOK_RUNNING: AtomicBool = AtomicBool::new(false);

/// Thread ID of the hook thread (needed to post WM_QUIT for clean shutdown).
static HOOK_THREAD_ID: AtomicU32 = AtomicU32::new(0);

// ---------------------------------------------------------------------------
// Win32 FFI (Windows only)
// ---------------------------------------------------------------------------

#[cfg(target_os = "windows")]
mod win32 {
    pub const WH_KEYBOARD_LL: i32 = 13;
    pub const WM_KEYDOWN: usize = 0x0100;
    pub const WM_KEYUP: usize = 0x0101;
    pub const WM_SYSKEYDOWN: usize = 0x0104;
    pub const WM_SYSKEYUP: usize = 0x0105;
    pub const WM_QUIT: u32 = 0x0012;

    #[repr(C)]
    pub struct KBDLLHOOKSTRUCT {
        pub vk_code: u32,
        pub scan_code: u32,
        pub flags: u32,
        pub time: u32,
        pub extra_info: usize,
    }

    #[repr(C)]
    pub struct MSG {
        pub hwnd: isize,
        pub message: u32,
        pub w_param: usize,
        pub l_param: isize,
        pub time: u32,
        pub pt_x: i32,
        pub pt_y: i32,
    }

    extern "system" {
        pub fn SetWindowsHookExW(
            id_hook: i32,
            lpfn: unsafe extern "system" fn(i32, usize, isize) -> isize,
            hmod: isize,
            dw_thread_id: u32,
        ) -> isize;
        pub fn UnhookWindowsHookEx(hhk: isize) -> i32;
        pub fn CallNextHookEx(
            hhk: isize,
            n_code: i32,
            w_param: usize,
            l_param: isize,
        ) -> isize;
        pub fn GetMessageW(
            msg: *mut MSG,
            hwnd: isize,
            w_msg_filter_min: u32,
            w_msg_filter_max: u32,
        ) -> i32;
        pub fn PostThreadMessageW(
            id_thread: u32,
            msg: u32,
            w_param: usize,
            l_param: isize,
        ) -> i32;
        pub fn GetCurrentThreadId() -> u32;
        pub fn GetAsyncKeyState(v_key: i32) -> i16;
    }
}

// ---------------------------------------------------------------------------
// Hook callback
// ---------------------------------------------------------------------------

#[cfg(target_os = "windows")]
unsafe extern "system" fn ll_keyboard_proc(
    code: i32,
    w_param: usize,
    l_param: isize,
) -> isize {
    if code >= 0 {
        let kb = unsafe { &*(l_param as *const win32::KBDLLHOOKSTRUCT) };
        let vk = PTT_VK.load(Ordering::Relaxed);

        if vk > 0 && kb.vk_code == vk as u32 {
            if let Some(handle) = APP_HANDLE.get() {
                match w_param {
                    win32::WM_KEYDOWN | win32::WM_SYSKEYDOWN => {
                        // Guard against key-repeat — only emit on initial press
                        if !PTT_PRESSED.swap(true, Ordering::Relaxed) {
                            let _ = handle.emit("ptt-hook-down", ());
                        }
                    }
                    win32::WM_KEYUP | win32::WM_SYSKEYUP => {
                        if PTT_PRESSED.swap(false, Ordering::Relaxed) {
                            let _ = handle.emit("ptt-hook-up", ());
                        }
                    }
                    _ => {}
                }
            }
        }
    }
    // Always pass the event to the next hook — we observe, never consume.
    unsafe { win32::CallNextHookEx(0, code, w_param, l_param) }
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

/// Start the low-level keyboard hook for PTT.
/// If already running, just updates the key code (no restart needed).
/// Returns `true` on success (or if already running), `false` on failure.
#[tauri::command]
fn start_ptt_hook(key_code: i32) -> bool {
    PTT_VK.store(key_code, Ordering::Relaxed);
    PTT_PRESSED.store(false, Ordering::Relaxed);

    #[cfg(target_os = "windows")]
    {
        if HOOK_RUNNING.load(Ordering::Relaxed) {
            return true; // Already running — key code updated atomically
        }

        let (tx, rx) = std::sync::mpsc::channel();

        std::thread::spawn(move || {
            let tid = unsafe { win32::GetCurrentThreadId() };
            HOOK_THREAD_ID.store(tid, Ordering::Relaxed);

            let hook = unsafe {
                win32::SetWindowsHookExW(win32::WH_KEYBOARD_LL, ll_keyboard_proc, 0, 0)
            };

            if hook == 0 {
                let _ = tx.send(false);
                return;
            }

            HOOK_RUNNING.store(true, Ordering::Relaxed);
            let _ = tx.send(true);

            // Message pump — Windows requires an active message loop on the
            // thread that installed the hook. This loop runs until WM_QUIT is
            // posted by `stop_ptt_hook`.
            let mut msg = win32::MSG {
                hwnd: 0,
                message: 0,
                w_param: 0,
                l_param: 0,
                time: 0,
                pt_x: 0,
                pt_y: 0,
            };
            while unsafe { win32::GetMessageW(&mut msg, 0, 0, 0) } > 0 {
                // Just pump — the hook callback does all the work
            }

            unsafe { win32::UnhookWindowsHookEx(hook) };
            HOOK_RUNNING.store(false, Ordering::Relaxed);
        });

        rx.recv().unwrap_or(false)
    }

    #[cfg(not(target_os = "windows"))]
    {
        false
    }
}

/// Stop the low-level keyboard hook.
#[tauri::command]
fn stop_ptt_hook() {
    PTT_VK.store(0, Ordering::Relaxed);
    PTT_PRESSED.store(false, Ordering::Relaxed);

    #[cfg(target_os = "windows")]
    {
        if HOOK_RUNNING.load(Ordering::Relaxed) {
            let tid = HOOK_THREAD_ID.load(Ordering::Relaxed);
            unsafe { win32::PostThreadMessageW(tid, win32::WM_QUIT, 0, 0) };
        }
    }
}

/// Check whether a key is currently held down (polling fallback).
///
/// Returns:
///   `1`  — key is pressed (Windows)
///   `0`  — key is not pressed (Windows)
///   `-1` — not supported on this platform
#[tauri::command]
fn check_key_pressed(key_code: i32) -> i32 {
    #[cfg(target_os = "windows")]
    {
        let state = unsafe { win32::GetAsyncKeyState(key_code) };
        if state < 0 { 1 } else { 0 }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = key_code;
        -1
    }
}

// ===========================================================================
// Tauri application entry point
// ===========================================================================

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            check_key_pressed,
            start_ptt_hook,
            stop_ptt_hook,
        ])
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(
            tauri_plugin_updater::Builder::new()
                .header("User-Agent", "Ripcord-Desktop-Updater/1.0")
                .expect("failed to set updater User-Agent")
                .build(),
        )
        .plugin(tauri_plugin_http::init())
        .setup(|app| {
            // Store app handle for PTT hook event emission
            let _ = APP_HANDLE.set(app.handle().clone());

            // Build system tray menu
            let show = MenuItem::with_id(app, "show", "Show Window", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit Ripcord", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;

            // Attach menu to the config-created tray icon (id "main")
            if let Some(tray) = app.tray_by_id("main") {
                tray.set_menu(Some(menu))?;
                tray.on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
