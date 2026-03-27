use crossbeam_channel::{Receiver, Sender};
use engine_audio::AudioEngine;
use engine_ipc::{Dispatcher, HandlerFn};
use engine_webview::{Webview, WebviewEvent};
use engine_window::pip::PipEvent;
use engine_window::tray::TrayEvent;
use engine_window::WindowEvent;
use std::sync::{Arc, Mutex};

const VERSION: &str = env!("CARGO_PKG_VERSION");

/// The main orchestrator. Wires together window, webview, audio, and IPC.
pub struct Engine {
    dispatcher: Arc<Dispatcher>,
    hwnd: Arc<Mutex<Option<isize>>>,
    audio: Arc<AudioEngine>,
}

impl Engine {
    pub fn new() -> Self {
        let mut dispatcher = Dispatcher::new();
        let hwnd: Arc<Mutex<Option<isize>>> = Arc::new(Mutex::new(None));
        let audio = Arc::new(AudioEngine::new());

        // === system.* commands ===
        dispatcher.register(
            "system.getVersion",
            Arc::new(|_params| {
                Ok(serde_json::json!({ "version": VERSION }))
            }) as HandlerFn,
        );

        let hwnd_ref = hwnd.clone();
        dispatcher.register(
            "system.minimize",
            Arc::new(move |_params| {
                if let Some(h) = *hwnd_ref.lock().unwrap() {
                    engine_window::minimize(h);
                }
                Ok(serde_json::json!(null))
            }) as HandlerFn,
        );

        let hwnd_ref = hwnd.clone();
        dispatcher.register(
            "system.maximize",
            Arc::new(move |_params| {
                if let Some(h) = *hwnd_ref.lock().unwrap() {
                    engine_window::maximize(h);
                }
                Ok(serde_json::json!(null))
            }) as HandlerFn,
        );

        let hwnd_ref = hwnd.clone();
        dispatcher.register(
            "system.close",
            Arc::new(move |_params| {
                if let Some(h) = *hwnd_ref.lock().unwrap() {
                    engine_window::close(h);
                }
                Ok(serde_json::json!(null))
            }) as HandlerFn,
        );

        // === window.* commands ===

        let hwnd_ref = hwnd.clone();
        dispatcher.register(
            "window.minimizeToTray",
            Arc::new(move |_params| {
                if let Some(h) = *hwnd_ref.lock().unwrap() {
                    engine_window::minimize_to_tray(h);
                }
                Ok(serde_json::json!(null))
            }) as HandlerFn,
        );

        let hwnd_ref = hwnd.clone();
        dispatcher.register(
            "window.restore",
            Arc::new(move |_params| {
                if let Some(h) = *hwnd_ref.lock().unwrap() {
                    engine_window::restore(h);
                }
                Ok(serde_json::json!(null))
            }) as HandlerFn,
        );

        dispatcher.register(
            "window.setTrayTooltip",
            Arc::new(|params: serde_json::Value| {
                let text = params
                    .get("text")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Ripcord");
                engine_window::tray::set_tooltip(text);
                Ok(serde_json::json!(null))
            }) as HandlerFn,
        );

        dispatcher.register(
            "window.setPiP",
            Arc::new(|params: serde_json::Value| {
                let enabled = params
                    .get("enabled")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);

                if enabled {
                    let (pip_tx, _pip_rx) = crossbeam_channel::unbounded::<PipEvent>();
                    engine_window::pip::create(pip_tx);
                } else {
                    engine_window::pip::hide();
                }

                Ok(serde_json::json!({ "visible": engine_window::pip::is_visible() }))
            }) as HandlerFn,
        );

        let hwnd_ref = hwnd.clone();
        dispatcher.register(
            "window.setOverlay",
            Arc::new(move |params: serde_json::Value| {
                let visible = params
                    .get("visible")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);

                if visible {
                    if let Some(h) = *hwnd_ref.lock().unwrap() {
                        if engine_window::overlay::hwnd().is_none() {
                            engine_window::overlay::create(h);
                        }
                        engine_window::overlay::show();
                        engine_window::overlay::set_opacity(128);
                    }
                } else {
                    engine_window::overlay::hide();
                }

                Ok(serde_json::json!({ "visible": engine_window::overlay::is_visible() }))
            }) as HandlerFn,
        );

        // === audio.* commands ===

        let audio_ref = audio.clone();
        dispatcher.register(
            "audio.listDevices",
            Arc::new(move |_params: serde_json::Value| {
                let (inputs, outputs) = audio_ref.list_devices();
                Ok(serde_json::json!({ "inputs": inputs, "outputs": outputs }))
            }) as HandlerFn,
        );

        let audio_ref = audio.clone();
        dispatcher.register(
            "audio.setDevice",
            Arc::new(move |params: serde_json::Value| {
                let input = params
                    .get("input")
                    .and_then(|v| v.as_str())
                    .unwrap_or("default");
                let output = params
                    .get("output")
                    .and_then(|v| v.as_str())
                    .unwrap_or("default");

                audio_ref
                    .start(input, output)
                    .map_err(|e| e.to_string())?;

                Ok(serde_json::json!({ "active": true }))
            }) as HandlerFn,
        );

        let audio_ref = audio.clone();
        dispatcher.register(
            "audio.stop",
            Arc::new(move |_params: serde_json::Value| {
                audio_ref.stop();
                Ok(serde_json::json!({ "active": false }))
            }) as HandlerFn,
        );

        let audio_ref = audio.clone();
        dispatcher.register(
            "audio.setSuppression",
            Arc::new(move |params: serde_json::Value| {
                let enabled = params
                    .get("enabled")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(true);
                audio_ref.set_suppression(enabled);
                Ok(serde_json::json!({ "enabled": enabled }))
            }) as HandlerFn,
        );

        let audio_ref = audio.clone();
        dispatcher.register(
            "audio.setGain",
            Arc::new(move |params: serde_json::Value| {
                let db = params
                    .get("db")
                    .and_then(|v| v.as_f64())
                    .unwrap_or(0.0) as f32;
                audio_ref.set_gain(db);
                Ok(serde_json::json!({ "gain_db": db }))
            }) as HandlerFn,
        );

        let audio_ref = audio.clone();
        dispatcher.register(
            "audio.getLevel",
            Arc::new(move |_params: serde_json::Value| {
                let level = audio_ref.get_level();
                Ok(serde_json::json!({ "rms": level }))
            }) as HandlerFn,
        );

        Self {
            dispatcher: Arc::new(dispatcher),
            hwnd,
            audio,
        }
    }

    /// Start the engine. This blocks on the Win32 message pump.
    pub fn run(&self) {
        let (win_tx, win_rx): (Sender<WindowEvent>, Receiver<WindowEvent>) =
            crossbeam_channel::unbounded();
        let (wv_tx, _wv_rx): (Sender<WebviewEvent>, Receiver<WebviewEvent>) =
            crossbeam_channel::unbounded();

        let dispatcher = self.dispatcher.clone();
        let hwnd = self.hwnd.clone();
        let audio = self.audio.clone();

        // Spawn a thread to process window events.
        let wv_tx_clone = wv_tx.clone();
        std::thread::spawn(move || {
            let mut webview: Option<Webview> = None;

            for event in win_rx {
                match event {
                    WindowEvent::Created(h) => {
                        log::info!("Window created (hwnd={h:#x})");
                        *hwnd.lock().unwrap() = Some(h);

                        // Create system tray icon
                        engine_window::tray::create(h);

                        // Create overlay window (starts hidden)
                        engine_window::overlay::create(h);

                        // Load the frontend
                        let url = std::env::var("RIPCORD_DEV_URL")
                            .unwrap_or_else(|_| "http://localhost:1420".to_string());

                        match Webview::create(h, &url, dispatcher.clone(), wv_tx_clone.clone()) {
                            Ok(wv) => {
                                log::info!("WebView2 initialized, navigating to {url}");
                                webview = Some(wv);
                            }
                            Err(e) => {
                                log::error!("Failed to create WebView2: {e}");
                            }
                        }
                    }

                    WindowEvent::Resized(w, h) => {
                        if let Some(ref wv) = webview {
                            wv.resize(w, h);
                        }
                        if let Some(main_h) = *hwnd.lock().unwrap() {
                            engine_window::overlay::sync_to_parent(main_h);
                        }
                    }

                    WindowEvent::Moved(_x, _y) => {
                        if let Some(main_h) = *hwnd.lock().unwrap() {
                            engine_window::overlay::sync_to_parent(main_h);
                        }
                    }

                    WindowEvent::DpiChanged(dpi) => {
                        log::info!("DPI changed to {dpi}");
                    }

                    WindowEvent::Tray(tray_event) => {
                        match tray_event {
                            TrayEvent::Show => {
                                if let Some(h) = *hwnd.lock().unwrap() {
                                    engine_window::restore(h);
                                }
                            }
                            TrayEvent::Quit => {
                                if let Some(h) = *hwnd.lock().unwrap() {
                                    engine_window::close(h);
                                }
                            }
                            TrayEvent::Mute => {
                                log::info!("Tray: mute toggled");
                            }
                            TrayEvent::Deafen => {
                                log::info!("Tray: deafen toggled");
                            }
                            TrayEvent::Disconnect => {
                                log::info!("Tray: disconnect");
                                audio.stop();
                            }
                        }
                    }

                    WindowEvent::CloseRequested => {
                        log::info!("Close requested");
                    }

                    WindowEvent::Destroyed => {
                        log::info!("Window destroyed, shutting down");
                        audio.stop();
                        engine_window::overlay::destroy();
                        engine_window::pip::destroy();
                        break;
                    }
                }
            }
        });

        // Run the window + message pump on the main thread (required by Win32).
        engine_window::run(win_tx);
    }
}

impl Default for Engine {
    fn default() -> Self {
        Self::new()
    }
}
