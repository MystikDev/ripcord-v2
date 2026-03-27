use std::sync::atomic::{AtomicIsize, Ordering};
use windows::core::w;
use windows::Win32::Foundation::{HWND, LPARAM, WPARAM};
use windows::Win32::UI::Shell::*;
use windows::Win32::UI::WindowsAndMessaging::*;

/// Custom message ID for tray icon callbacks.
pub const WM_TRAY_CALLBACK: u32 = WM_APP + 1;

/// Tray menu item IDs.
pub const TRAY_MENU_MUTE: u32 = 1001;
pub const TRAY_MENU_DEAFEN: u32 = 1002;
pub const TRAY_MENU_DISCONNECT: u32 = 1003;
pub const TRAY_MENU_SHOW: u32 = 1004;
pub const TRAY_MENU_QUIT: u32 = 1005;

/// Tracks whether the tray icon is active.
static TRAY_HWND: AtomicIsize = AtomicIsize::new(0);

/// Events emitted by tray interactions.
#[derive(Debug)]
pub enum TrayEvent {
    Mute,
    Deafen,
    Disconnect,
    Show,
    Quit,
}

/// Create the system tray icon for the given window.
pub fn create(hwnd_raw: isize) {
    let hwnd = HWND(hwnd_raw as *mut _);
    TRAY_HWND.store(hwnd_raw, Ordering::Relaxed);

    let mut nid = NOTIFYICONDATAW {
        cbSize: std::mem::size_of::<NOTIFYICONDATAW>() as u32,
        hWnd: hwnd,
        uID: 1,
        uFlags: NIF_ICON | NIF_MESSAGE | NIF_TIP,
        uCallbackMessage: WM_TRAY_CALLBACK,
        ..Default::default()
    };

    // Set tooltip
    let tip = "Ripcord";
    let tip_wide: Vec<u16> = tip.encode_utf16().chain(std::iter::once(0)).collect();
    let len = tip_wide.len().min(nid.szTip.len());
    nid.szTip[..len].copy_from_slice(&tip_wide[..len]);

    // Use default application icon
    unsafe {
        nid.hIcon = LoadIconW(None, IDI_APPLICATION).unwrap_or_default();
        let _ = Shell_NotifyIconW(NIM_ADD, &nid);
    }
}

/// Update the tray tooltip text.
pub fn set_tooltip(text: &str) {
    let hwnd_raw = TRAY_HWND.load(Ordering::Relaxed);
    if hwnd_raw == 0 {
        return;
    }

    let hwnd = HWND(hwnd_raw as *mut _);
    let mut nid = NOTIFYICONDATAW {
        cbSize: std::mem::size_of::<NOTIFYICONDATAW>() as u32,
        hWnd: hwnd,
        uID: 1,
        uFlags: NIF_TIP,
        ..Default::default()
    };

    let tip_wide: Vec<u16> = text.encode_utf16().chain(std::iter::once(0)).collect();
    let len = tip_wide.len().min(nid.szTip.len());
    nid.szTip[..len].copy_from_slice(&tip_wide[..len]);

    unsafe {
        let _ = Shell_NotifyIconW(NIM_MODIFY, &nid);
    }
}

/// Remove the tray icon.
pub fn destroy() {
    let hwnd_raw = TRAY_HWND.load(Ordering::Relaxed);
    if hwnd_raw == 0 {
        return;
    }

    let hwnd = HWND(hwnd_raw as *mut _);
    let nid = NOTIFYICONDATAW {
        cbSize: std::mem::size_of::<NOTIFYICONDATAW>() as u32,
        hWnd: hwnd,
        uID: 1,
        ..Default::default()
    };

    unsafe {
        let _ = Shell_NotifyIconW(NIM_DELETE, &nid);
    }

    TRAY_HWND.store(0, Ordering::Relaxed);
}

/// Show the tray context menu at the cursor position.
/// Returns the selected TrayEvent, if any.
pub fn show_context_menu(hwnd_raw: isize) -> Option<TrayEvent> {
    let hwnd = HWND(hwnd_raw as *mut _);

    unsafe {
        let hmenu = CreatePopupMenu().ok()?;

        let _ = AppendMenuW(hmenu, MF_STRING, TRAY_MENU_MUTE as usize, w!("Mute"));
        let _ = AppendMenuW(hmenu, MF_STRING, TRAY_MENU_DEAFEN as usize, w!("Deafen"));
        let _ = AppendMenuW(hmenu, MF_STRING, TRAY_MENU_DISCONNECT as usize, w!("Disconnect"));
        let _ = AppendMenuW(hmenu, MF_SEPARATOR, 0, None);
        let _ = AppendMenuW(hmenu, MF_STRING, TRAY_MENU_SHOW as usize, w!("Show Ripcord"));
        let _ = AppendMenuW(hmenu, MF_SEPARATOR, 0, None);
        let _ = AppendMenuW(hmenu, MF_STRING, TRAY_MENU_QUIT as usize, w!("Quit"));

        // Required so the menu dismisses when clicking outside
        let _ = SetForegroundWindow(hwnd);

        let mut pt = windows::Win32::Foundation::POINT::default();
        let _ = GetCursorPos(&mut pt);

        let cmd = TrackPopupMenu(
            hmenu,
            TPM_RETURNCMD | TPM_NONOTIFY,
            pt.x,
            pt.y,
            0,
            hwnd,
            None,
        );

        let _ = DestroyMenu(hmenu);

        // Post empty message to force menu dismissal
        let _ = PostMessageW(hwnd, WM_NULL, WPARAM(0), LPARAM(0));

        if cmd.as_bool() {
            let id = cmd.0 as u32;
            match id {
                TRAY_MENU_MUTE => Some(TrayEvent::Mute),
                TRAY_MENU_DEAFEN => Some(TrayEvent::Deafen),
                TRAY_MENU_DISCONNECT => Some(TrayEvent::Disconnect),
                TRAY_MENU_SHOW => Some(TrayEvent::Show),
                TRAY_MENU_QUIT => Some(TrayEvent::Quit),
                _ => None,
            }
        } else {
            None
        }
    }
}

/// Handle WM_TRAY_CALLBACK messages from the window procedure.
/// Returns a TrayEvent if a menu item was selected.
pub fn handle_callback(hwnd_raw: isize, lparam: isize) -> Option<TrayEvent> {
    let msg = (lparam & 0xFFFF) as u32;
    match msg {
        WM_RBUTTONUP | WM_CONTEXTMENU => show_context_menu(hwnd_raw),
        WM_LBUTTONDBLCLK => Some(TrayEvent::Show),
        _ => None,
    }
}
