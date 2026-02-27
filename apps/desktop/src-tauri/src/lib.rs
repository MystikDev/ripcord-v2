use tauri::{
    menu::{Menu, MenuItem},
    Manager,
};

// ---------------------------------------------------------------------------
// Native key-state polling (Windows only)
// ---------------------------------------------------------------------------
// Used by the push-to-talk hook to detect key releases when the app window is
// backgrounded. On Windows the Tauri global-shortcut plugin (`RegisterHotKey`)
// only fires on key *press*, never *release*, so we fall back to polling
// `GetAsyncKeyState` via IPC.

#[cfg(target_os = "windows")]
extern "system" {
    fn GetAsyncKeyState(vKey: i32) -> i16;
}

/// Check whether a key is currently held down.
///
/// Returns:
///   `1`  — key is pressed (Windows)
///   `0`  — key is not pressed (Windows)
///   `-1` — not supported on this platform
#[tauri::command]
fn check_key_pressed(key_code: i32) -> i32 {
    #[cfg(target_os = "windows")]
    {
        // MSB (bit 15) is set when the key is currently down.
        let state = unsafe { GetAsyncKeyState(key_code) };
        if state < 0 { 1 } else { 0 }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = key_code;
        -1
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![check_key_pressed])
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
