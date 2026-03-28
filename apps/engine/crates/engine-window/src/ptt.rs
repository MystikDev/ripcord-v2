//! Push-to-talk support via WH_KEYBOARD_LL hook + GetAsyncKeyState polling.
//!
//! The LL keyboard hook fires on every keypress system-wide, even when the
//! Ripcord window is not focused. Events are sent via a crossbeam channel
//! that the engine-core event loop reads from.

use crossbeam_channel::Sender;
use std::sync::atomic::{AtomicBool, AtomicI32, AtomicUsize, Ordering};
use std::sync::OnceLock;
use windows::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
use windows::Win32::UI::Input::KeyboardAndMouse::GetAsyncKeyState;
use windows::Win32::UI::WindowsAndMessaging::*;

/// Events emitted by the PTT hook.
#[derive(Debug, Clone)]
pub enum PttEvent {
    KeyDown,
    KeyUp,
}

// Module-level state
/// Stores the HHOOK as a raw pointer (usize) to avoid Send issues.
static HOOK_RAW: AtomicUsize = AtomicUsize::new(0);
/// Thread ID of the hook message pump (for PostThreadMessage WM_QUIT).
static HOOK_THREAD_ID: AtomicUsize = AtomicUsize::new(0);
static TARGET_VK: AtomicI32 = AtomicI32::new(0);
static KEY_HELD: AtomicBool = AtomicBool::new(false);
static EVENT_TX: OnceLock<std::sync::Mutex<Option<Sender<PttEvent>>>> = OnceLock::new();

/// Start the low-level keyboard hook for the given virtual key code.
/// Returns `true` if the hook was installed successfully.
pub fn start_hook(vk_code: i32, tx: Sender<PttEvent>) -> bool {
    // Store the event sender
    let tx_lock = EVENT_TX.get_or_init(|| std::sync::Mutex::new(None));
    *tx_lock.lock().unwrap() = Some(tx);

    TARGET_VK.store(vk_code, Ordering::Relaxed);
    KEY_HELD.store(false, Ordering::Relaxed);

    // Already hooked — just update target key
    if HOOK_RAW.load(Ordering::Relaxed) != 0 {
        log::info!("PTT hook already active, updated vk=0x{:02X}", vk_code);
        return true;
    }

    // The LL hook callback must run on a thread with a message pump.
    let (ready_tx, ready_rx) = crossbeam_channel::bounded::<bool>(1);

    std::thread::Builder::new()
        .name("ptt-hook".into())
        .spawn(move || {
            // Store this thread's ID so we can post WM_QUIT to it later
            let tid = unsafe { windows::Win32::System::Threading::GetCurrentThreadId() };
            HOOK_THREAD_ID.store(tid as usize, Ordering::Relaxed);

            let hook = unsafe {
                SetWindowsHookExW(WH_KEYBOARD_LL, Some(ll_keyboard_proc), None, 0)
            };

            match hook {
                Ok(h) => {
                    HOOK_RAW.store(h.0 as usize, Ordering::Relaxed);
                    ready_tx.send(true).ok();

                    // Message pump — required for LL hooks
                    let mut msg = MSG::default();
                    unsafe {
                        while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                            if msg.message == WM_QUIT {
                                break;
                            }
                            let _ = TranslateMessage(&msg);
                            DispatchMessageW(&msg);
                        }

                        // Unhook on this thread (where it was created)
                        let _ = UnhookWindowsHookEx(h);
                    }
                    HOOK_RAW.store(0, Ordering::Relaxed);
                    HOOK_THREAD_ID.store(0, Ordering::Relaxed);
                }
                Err(e) => {
                    log::error!("SetWindowsHookEx failed: {e}");
                    ready_tx.send(false).ok();
                }
            }
        })
        .ok();

    match ready_rx.recv() {
        Ok(true) => {
            log::info!("PTT hook installed (vk=0x{:02X})", vk_code);
            true
        }
        _ => {
            log::error!("PTT hook install failed");
            false
        }
    }
}

/// Stop the keyboard hook.
pub fn stop_hook() {
    let tid = HOOK_THREAD_ID.load(Ordering::Relaxed);
    if tid != 0 {
        // Post WM_QUIT to the hook thread to break its message pump.
        // The thread will UnhookWindowsHookEx and clean up.
        unsafe {
            let _ = PostThreadMessageW(tid as u32, WM_QUIT, WPARAM(0), LPARAM(0));
        }
        log::info!("PTT hook stop requested");
    }

    KEY_HELD.store(false, Ordering::Relaxed);
    TARGET_VK.store(0, Ordering::Relaxed);

    // Clear the event sender
    if let Some(tx_lock) = EVENT_TX.get() {
        *tx_lock.lock().unwrap() = None;
    }
}

/// Check if a key is currently pressed using GetAsyncKeyState.
/// Returns 1 if pressed, 0 if not. Used as a polling fallback when
/// WebView2 throttles event delivery while minimized.
pub fn check_key_pressed(vk_code: i32) -> i32 {
    let state = unsafe { GetAsyncKeyState(vk_code) };
    if (state as u16) & 0x8000 != 0 {
        1
    } else {
        0
    }
}

/// The WH_KEYBOARD_LL callback. Non-consuming — other apps still receive the key.
unsafe extern "system" fn ll_keyboard_proc(
    code: i32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    if code >= 0 {
        let kbd = &*(lparam.0 as *const KBDLLHOOKSTRUCT);
        let target = TARGET_VK.load(Ordering::Relaxed) as u32;

        if kbd.vkCode == target {
            let is_down = wparam.0 == WM_KEYDOWN as usize || wparam.0 == WM_SYSKEYDOWN as usize;
            let was_held = KEY_HELD.load(Ordering::Relaxed);

            if is_down && !was_held {
                KEY_HELD.store(true, Ordering::Relaxed);
                send_event(PttEvent::KeyDown);
            } else if !is_down && was_held {
                KEY_HELD.store(false, Ordering::Relaxed);
                send_event(PttEvent::KeyUp);
            }
        }
    }

    CallNextHookEx(None, code, wparam, lparam)
}

fn send_event(event: PttEvent) {
    if let Some(tx_lock) = EVENT_TX.get() {
        if let Ok(guard) = tx_lock.lock() {
            if let Some(ref tx) = *guard {
                let _ = tx.try_send(event);
            }
        }
    }
}
