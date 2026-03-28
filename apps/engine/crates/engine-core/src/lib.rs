pub mod media_pipeline;

use crossbeam_channel::{Receiver, Sender};
use engine_audio::AudioEngine;
use engine_capture::CapturePipeline;
use engine_compositor::Compositor;
use engine_transport::{IceServer, WebRtcSession};
use media_pipeline::MediaPipeline;
use engine_ipc::{Dispatcher, HandlerFn};
use engine_webview::{Webview, WebviewEvent};
use engine_window::pip::PipEvent;
use engine_window::ptt::PttEvent;
use engine_window::tray::TrayEvent;
use engine_window::WindowEvent;
use std::sync::{Arc, Mutex};

const VERSION: &str = env!("CARGO_PKG_VERSION");

/// The main orchestrator. Wires together window, webview, audio, capture, transport, and IPC.
pub struct Engine {
    dispatcher: Arc<Dispatcher>,
    hwnd: Arc<Mutex<Option<isize>>>,
    audio: Arc<AudioEngine>,
    capture: Arc<Mutex<Option<CapturePipeline>>>,
    transport: Arc<Mutex<Option<WebRtcSession>>>,
    compositor: Arc<Mutex<Option<Compositor>>>,
    ice_servers: Arc<Mutex<Vec<IceServer>>>,
    media: Arc<Mutex<Option<MediaPipeline>>>,
    ptt_rx: Receiver<PttEvent>,
    ptt_tx: Sender<PttEvent>,
}

impl Engine {
    pub fn new() -> Self {
        let mut dispatcher = Dispatcher::new();
        let hwnd: Arc<Mutex<Option<isize>>> = Arc::new(Mutex::new(None));
        let audio = Arc::new(AudioEngine::new());
        let capture: Arc<Mutex<Option<CapturePipeline>>> = Arc::new(Mutex::new(None));
        let transport: Arc<Mutex<Option<WebRtcSession>>> = Arc::new(Mutex::new(None));
        let compositor: Arc<Mutex<Option<Compositor>>> = Arc::new(Mutex::new(None));
        let ice_servers: Arc<Mutex<Vec<IceServer>>> = Arc::new(Mutex::new(vec![
            IceServer::stun("stun.l.google.com:19302"),
        ]));
        let media: Arc<Mutex<Option<MediaPipeline>>> = Arc::new(Mutex::new(None));
        let (ptt_tx, ptt_rx): (Sender<PttEvent>, Receiver<PttEvent>) =
            crossbeam_channel::unbounded();

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

        // === audio.vst.* commands ===

        let audio_ref = audio.clone();
        dispatcher.register(
            "audio.loadVST",
            Arc::new(move |params: serde_json::Value| {
                let slot = params.get("slot").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
                let path = params
                    .get("path")
                    .and_then(|v| v.as_str())
                    .ok_or("Missing 'path' parameter")?;
                let info = audio_ref.load_vst(slot, path)?;
                Ok(serde_json::json!({
                    "name": info.name,
                    "path": info.path,
                    "param_count": info.param_count,
                    "slot": slot,
                }))
            }) as HandlerFn,
        );

        let audio_ref = audio.clone();
        dispatcher.register(
            "audio.unloadVST",
            Arc::new(move |params: serde_json::Value| {
                let slot = params.get("slot").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
                audio_ref.unload_vst(slot)?;
                Ok(serde_json::json!({ "slot": slot, "unloaded": true }))
            }) as HandlerFn,
        );

        let audio_ref = audio.clone();
        dispatcher.register(
            "audio.listVSTParams",
            Arc::new(move |params: serde_json::Value| {
                let slot = params.get("slot").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
                let vst_params = audio_ref.list_vst_params(slot)?;
                Ok(serde_json::json!({ "slot": slot, "params": vst_params }))
            }) as HandlerFn,
        );

        let audio_ref = audio.clone();
        dispatcher.register(
            "audio.setVSTParam",
            Arc::new(move |params: serde_json::Value| {
                let slot = params.get("slot").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
                let param_id = params
                    .get("paramId")
                    .and_then(|v| v.as_u64())
                    .ok_or("Missing 'paramId'")? as u32;
                let value = params
                    .get("value")
                    .and_then(|v| v.as_f64())
                    .ok_or("Missing 'value'")?;
                let ok = audio_ref.set_vst_param(slot, param_id, value)?;
                Ok(serde_json::json!({ "slot": slot, "paramId": param_id, "ok": ok }))
            }) as HandlerFn,
        );

        let audio_ref = audio.clone();
        dispatcher.register(
            "audio.setVSTBypass",
            Arc::new(move |params: serde_json::Value| {
                let slot = params.get("slot").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
                let bypass = params
                    .get("bypass")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);
                audio_ref.set_vst_bypass(slot, bypass)?;
                Ok(serde_json::json!({ "slot": slot, "bypass": bypass }))
            }) as HandlerFn,
        );

        // === capture.* commands ===

        dispatcher.register(
            "capture.listSources",
            Arc::new(|_params: serde_json::Value| {
                let sources = engine_capture::sources::list_all();
                Ok(serde_json::json!({ "sources": sources }))
            }) as HandlerFn,
        );

        let capture_ref = capture.clone();
        dispatcher.register(
            "capture.start",
            Arc::new(move |params: serde_json::Value| {
                let source_id = params
                    .get("sourceId")
                    .and_then(|v| v.as_str())
                    .unwrap_or("monitor:0:0");

                let profile_str = params
                    .get("profile")
                    .and_then(|v| v.as_str())
                    .unwrap_or("performance-1080");

                let profile = match profile_str {
                    "4k-quality" | "quality-4k" => engine_capture::encoder::CaptureProfile::Quality4k,
                    "adaptive" => engine_capture::encoder::CaptureProfile::Adaptive,
                    _ => engine_capture::encoder::CaptureProfile::Performance1080,
                };

                // Parse source ID to get monitor index
                let output_index = if source_id.starts_with("monitor:") {
                    // Format: monitor:{adapter}:{output}
                    source_id
                        .split(':')
                        .nth(2)
                        .and_then(|s| s.parse::<u32>().ok())
                        .unwrap_or(0)
                } else {
                    0
                };

                // Stop existing capture if running
                {
                    let mut cap = capture_ref.lock().unwrap();
                    if let Some(ref mut pipeline) = *cap {
                        pipeline.stop();
                    }
                    *cap = None;
                }

                let pipeline = CapturePipeline::start_monitor(output_index, profile)
                    .map_err(|e| e.to_string())?;
                let stats = pipeline.get_stats();

                *capture_ref.lock().unwrap() = Some(pipeline);

                Ok(serde_json::json!({
                    "capturing": true,
                    "width": stats.width,
                    "height": stats.height,
                    "encoder": stats.encoder,
                }))
            }) as HandlerFn,
        );

        let capture_ref = capture.clone();
        dispatcher.register(
            "capture.stop",
            Arc::new(move |_params: serde_json::Value| {
                let mut cap = capture_ref.lock().unwrap();
                if let Some(ref mut pipeline) = *cap {
                    pipeline.stop();
                }
                *cap = None;
                Ok(serde_json::json!({ "capturing": false }))
            }) as HandlerFn,
        );

        let capture_ref = capture.clone();
        dispatcher.register(
            "capture.getStats",
            Arc::new(move |_params: serde_json::Value| {
                let cap = capture_ref.lock().unwrap();
                if let Some(ref pipeline) = *cap {
                    let stats = pipeline.get_stats();
                    Ok(serde_json::json!(stats))
                } else {
                    Ok(serde_json::json!({ "capturing": false }))
                }
            }) as HandlerFn,
        );

        // === transport.* commands ===

        let transport_ref = transport.clone();
        let ice_servers_ref = ice_servers.clone();
        dispatcher.register(
            "transport.createOffer",
            Arc::new(move |params: serde_json::Value| {
                let user_id = params
                    .get("userId")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let target = params
                    .get("target")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();

                let config = engine_transport::SessionConfig {
                    bind_addr: "0.0.0.0:0".into(),
                    user_id,
                    target,
                    ice_servers: ice_servers_ref.lock().unwrap().clone(),
                };

                let signaling_tx: engine_transport::session::SignalingSender =
                    Arc::new(|msg| {
                        log::info!("Signaling out: {:?}", msg);
                    });

                // Stop existing session
                {
                    let mut t = transport_ref.lock().unwrap();
                    if let Some(ref mut session) = *t {
                        session.stop();
                    }
                    *t = None;
                }

                let (session, offer_sdp) =
                    WebRtcSession::create_offer(config, signaling_tx)
                        .map_err(|e| e.to_string())?;

                *transport_ref.lock().unwrap() = Some(session);

                Ok(serde_json::json!({
                    "sdp": offer_sdp,
                    "type": "offer",
                }))
            }) as HandlerFn,
        );

        let transport_ref = transport.clone();
        let ice_servers_ref = ice_servers.clone();
        dispatcher.register(
            "transport.acceptOffer",
            Arc::new(move |params: serde_json::Value| {
                let sdp = params
                    .get("sdp")
                    .and_then(|v| v.as_str())
                    .ok_or("Missing 'sdp' parameter")?;
                let user_id = params
                    .get("userId")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let target = params
                    .get("target")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();

                let config = engine_transport::SessionConfig {
                    bind_addr: "0.0.0.0:0".into(),
                    user_id,
                    target,
                    ice_servers: ice_servers_ref.lock().unwrap().clone(),
                };

                let signaling_tx: engine_transport::session::SignalingSender =
                    Arc::new(|msg| {
                        log::info!("Signaling out: {:?}", msg);
                    });

                let (session, answer_sdp) =
                    WebRtcSession::create_answer(config, sdp, signaling_tx)
                        .map_err(|e| e.to_string())?;

                *transport_ref.lock().unwrap() = Some(session);

                Ok(serde_json::json!({
                    "sdp": answer_sdp,
                    "type": "answer",
                }))
            }) as HandlerFn,
        );

        let transport_ref = transport.clone();
        dispatcher.register(
            "transport.stop",
            Arc::new(move |_params: serde_json::Value| {
                let mut t = transport_ref.lock().unwrap();
                if let Some(ref mut session) = *t {
                    session.stop();
                }
                *t = None;
                Ok(serde_json::json!({ "stopped": true }))
            }) as HandlerFn,
        );

        let ice_servers_ref = ice_servers.clone();
        dispatcher.register(
            "transport.setIceServers",
            Arc::new(move |params: serde_json::Value| {
                let servers = params
                    .get("iceServers")
                    .and_then(|v| v.as_array())
                    .ok_or("Missing 'iceServers' array")?;

                let parsed: Vec<IceServer> = servers
                    .iter()
                    .filter_map(|s| {
                        let url = s.get("urls")
                            .and_then(|u| u.as_array())
                            .and_then(|a| a.first())
                            .and_then(|u| u.as_str())
                            .unwrap_or_default()
                            .to_string();
                        if url.is_empty() {
                            return None;
                        }
                        // Strip stun: / turn: prefix for internal use
                        let url = url
                            .strip_prefix("stun:").unwrap_or(&url)
                            .strip_prefix("turn:").unwrap_or(&url)
                            .to_string();
                        Some(IceServer {
                            url,
                            username: s.get("username").and_then(|v| v.as_str()).map(String::from),
                            credential: s.get("credential").and_then(|v| v.as_str()).map(String::from),
                        })
                    })
                    .collect();

                let count = parsed.len();
                *ice_servers_ref.lock().unwrap() = parsed;

                Ok(serde_json::json!({ "configured": count }))
            }) as HandlerFn,
        );

        // === media.* commands (end-to-end pipeline) ===

        let media_ref = media.clone();
        let transport_ref = transport.clone();
        dispatcher.register(
            "media.startSender",
            Arc::new(move |params: serde_json::Value| {
                let monitor_index = params
                    .get("monitorIndex")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0) as u32;

                let profile_str = params
                    .get("profile")
                    .and_then(|v| v.as_str())
                    .unwrap_or("performance-1080");

                let profile = match profile_str {
                    "4k-quality" | "quality-4k" => engine_capture::encoder::CaptureProfile::Quality4k,
                    "adaptive" => engine_capture::encoder::CaptureProfile::Adaptive,
                    _ => engine_capture::encoder::CaptureProfile::Performance1080,
                };

                // Stop any existing media pipeline
                {
                    let mut m = media_ref.lock().unwrap();
                    if let Some(ref mut pipeline) = *m {
                        pipeline.stop();
                    }
                    *m = None;
                }

                let t = transport_ref.lock().unwrap();
                let session = t.as_ref().ok_or("No transport session — call transport.createOffer first")?;

                let pipeline = MediaPipeline::start_sender(session, monitor_index, profile)
                    .map_err(|e| e.to_string())?;

                drop(t);
                *media_ref.lock().unwrap() = Some(pipeline);

                Ok(serde_json::json!({ "sending": true }))
            }) as HandlerFn,
        );

        let media_ref = media.clone();
        let transport_ref = transport.clone();
        let compositor_ref = compositor.clone();
        dispatcher.register(
            "media.startReceiver",
            Arc::new(move |params: serde_json::Value| {
                let surface_index = params
                    .get("surfaceIndex")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0) as usize;

                // Stop any existing media pipeline
                {
                    let mut m = media_ref.lock().unwrap();
                    if let Some(ref mut pipeline) = *m {
                        pipeline.stop();
                    }
                    *m = None;
                }

                let t = transport_ref.lock().unwrap();
                let session = t.as_ref().ok_or("No transport session — call transport.acceptOffer first")?;

                let pipeline = MediaPipeline::start_receiver(session, compositor_ref.clone(), surface_index)
                    .map_err(|e| e.to_string())?;

                drop(t);
                *media_ref.lock().unwrap() = Some(pipeline);

                Ok(serde_json::json!({ "receiving": true }))
            }) as HandlerFn,
        );

        let media_ref = media.clone();
        dispatcher.register(
            "media.stop",
            Arc::new(move |_params: serde_json::Value| {
                let mut m = media_ref.lock().unwrap();
                if let Some(ref mut pipeline) = *m {
                    pipeline.stop();
                }
                *m = None;
                Ok(serde_json::json!({ "stopped": true }))
            }) as HandlerFn,
        );

        let media_ref = media.clone();
        dispatcher.register(
            "media.getStatus",
            Arc::new(move |_params: serde_json::Value| {
                let m = media_ref.lock().unwrap();
                let running = m.as_ref().map_or(false, |p| p.is_running());
                Ok(serde_json::json!({ "running": running }))
            }) as HandlerFn,
        );

        // === compositor.* commands ===

        let compositor_ref = compositor.clone();
        let hwnd_ref = hwnd.clone();
        dispatcher.register(
            "compositor.init",
            Arc::new(move |_params: serde_json::Value| {
                let h = hwnd_ref
                    .lock()
                    .unwrap()
                    .ok_or("Window not created yet")?;

                let mut comp = compositor_ref.lock().unwrap();
                if comp.is_some() {
                    return Ok(serde_json::json!({ "already_initialized": true }));
                }

                let c = Compositor::new(h).map_err(|e| e.to_string())?;
                *comp = Some(c);
                Ok(serde_json::json!({ "initialized": true }))
            }) as HandlerFn,
        );

        let compositor_ref = compositor.clone();
        dispatcher.register(
            "compositor.addSurface",
            Arc::new(move |params: serde_json::Value| {
                let name = params
                    .get("name")
                    .and_then(|v| v.as_str())
                    .ok_or("Missing 'name'")?;
                let width = params
                    .get("width")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(1920) as u32;
                let height = params
                    .get("height")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(1080) as u32;
                let offset_x = params
                    .get("offsetX")
                    .and_then(|v| v.as_f64())
                    .unwrap_or(0.0) as f32;
                let offset_y = params
                    .get("offsetY")
                    .and_then(|v| v.as_f64())
                    .unwrap_or(0.0) as f32;

                let mut comp = compositor_ref.lock().unwrap();
                let c = comp.as_mut().ok_or("Compositor not initialized")?;
                let index = c
                    .add_surface(name, width, height, offset_x, offset_y)
                    .map_err(|e| e.to_string())?;

                Ok(serde_json::json!({
                    "index": index,
                    "name": name,
                    "width": width,
                    "height": height,
                }))
            }) as HandlerFn,
        );

        let compositor_ref = compositor.clone();
        dispatcher.register(
            "compositor.removeSurface",
            Arc::new(move |params: serde_json::Value| {
                let index = params
                    .get("index")
                    .and_then(|v| v.as_u64())
                    .ok_or("Missing 'index'")? as usize;

                let mut comp = compositor_ref.lock().unwrap();
                let c = comp.as_mut().ok_or("Compositor not initialized")?;
                c.remove_surface(index).map_err(|e| e.to_string())?;

                Ok(serde_json::json!({ "removed": true }))
            }) as HandlerFn,
        );

        let compositor_ref = compositor.clone();
        dispatcher.register(
            "compositor.clearSurface",
            Arc::new(move |params: serde_json::Value| {
                let index = params
                    .get("index")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0) as usize;
                let r = params.get("r").and_then(|v| v.as_f64()).unwrap_or(0.0) as f32;
                let g = params.get("g").and_then(|v| v.as_f64()).unwrap_or(0.0) as f32;
                let b = params.get("b").and_then(|v| v.as_f64()).unwrap_or(0.0) as f32;
                let a = params.get("a").and_then(|v| v.as_f64()).unwrap_or(1.0) as f32;

                let comp = compositor_ref.lock().unwrap();
                let c = comp.as_ref().ok_or("Compositor not initialized")?;
                c.clear_surface(index, r, g, b, a)
                    .map_err(|e| e.to_string())?;

                Ok(serde_json::json!({ "cleared": true }))
            }) as HandlerFn,
        );

        let compositor_ref = compositor.clone();
        dispatcher.register(
            "compositor.setSurfaceOffset",
            Arc::new(move |params: serde_json::Value| {
                let index = params
                    .get("index")
                    .and_then(|v| v.as_u64())
                    .ok_or("Missing 'index'")? as usize;
                let offset_x = params
                    .get("offsetX")
                    .and_then(|v| v.as_f64())
                    .unwrap_or(0.0) as f32;
                let offset_y = params
                    .get("offsetY")
                    .and_then(|v| v.as_f64())
                    .unwrap_or(0.0) as f32;

                let comp = compositor_ref.lock().unwrap();
                let c = comp.as_ref().ok_or("Compositor not initialized")?;
                c.set_surface_offset(index, offset_x, offset_y)
                    .map_err(|e| e.to_string())?;

                Ok(serde_json::json!({ "moved": true }))
            }) as HandlerFn,
        );

        let compositor_ref = compositor.clone();
        dispatcher.register(
            "compositor.getInfo",
            Arc::new(move |_params: serde_json::Value| {
                let comp = compositor_ref.lock().unwrap();
                match comp.as_ref() {
                    Some(c) => Ok(serde_json::json!({
                        "initialized": true,
                        "surface_count": c.surface_count(),
                    })),
                    None => Ok(serde_json::json!({ "initialized": false })),
                }
            }) as HandlerFn,
        );

        // === ptt.* commands ===

        let ptt_tx_ref = ptt_tx.clone();
        dispatcher.register(
            "ptt.start",
            Arc::new(move |params: serde_json::Value| {
                let key_code = params
                    .get("keyCode")
                    .and_then(|v| v.as_i64())
                    .ok_or("Missing 'keyCode'")? as i32;

                let success = engine_window::ptt::start_hook(key_code, ptt_tx_ref.clone());
                Ok(serde_json::json!({ "success": success }))
            }) as HandlerFn,
        );

        dispatcher.register(
            "ptt.stop",
            Arc::new(|_params: serde_json::Value| {
                engine_window::ptt::stop_hook();
                Ok(serde_json::json!({ "stopped": true }))
            }) as HandlerFn,
        );

        dispatcher.register(
            "ptt.checkKey",
            Arc::new(|params: serde_json::Value| {
                let key_code = params
                    .get("keyCode")
                    .and_then(|v| v.as_i64())
                    .unwrap_or(0) as i32;
                let state = engine_window::ptt::check_key_pressed(key_code);
                Ok(serde_json::json!({ "pressed": state }))
            }) as HandlerFn,
        );

        // === shell.* commands ===

        dispatcher.register(
            "shell.open",
            Arc::new(|params: serde_json::Value| {
                let url = params
                    .get("url")
                    .and_then(|v| v.as_str())
                    .ok_or("Missing 'url'")?;

                // Validate URL scheme to prevent command injection
                if !url.starts_with("http://")
                    && !url.starts_with("https://")
                    && !url.starts_with("mailto:")
                {
                    return Err("Only http, https, and mailto URLs are allowed".into());
                }

                use std::os::windows::ffi::OsStrExt;
                let wide_url: Vec<u16> = std::ffi::OsStr::new(url)
                    .encode_wide()
                    .chain(std::iter::once(0))
                    .collect();
                let wide_open: Vec<u16> = std::ffi::OsStr::new("open")
                    .encode_wide()
                    .chain(std::iter::once(0))
                    .collect();

                unsafe {
                    use windows::Win32::Foundation::HWND;
                    use windows::Win32::UI::Shell::ShellExecuteW;
                    use windows::core::PCWSTR;
                    ShellExecuteW(
                        HWND::default(),
                        PCWSTR(wide_open.as_ptr()),
                        PCWSTR(wide_url.as_ptr()),
                        PCWSTR::null(),
                        PCWSTR::null(),
                        windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL,
                    );
                }

                Ok(serde_json::json!({ "opened": true }))
            }) as HandlerFn,
        );

        Self {
            dispatcher: Arc::new(dispatcher),
            hwnd,
            audio,
            capture,
            transport,
            compositor,
            ice_servers,
            media,
            ptt_rx,
            ptt_tx,
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
        let capture = self.capture.clone();
        let transport = self.transport.clone();
        let compositor = self.compositor.clone();
        let media = self.media.clone();
        let ptt_rx = self.ptt_rx.clone();

        // Spawn a thread to process window events and PTT events.
        let wv_tx_clone = wv_tx.clone();
        std::thread::spawn(move || {
            let mut webview: Option<Webview> = None;

            loop {
                crossbeam_channel::select! {
                    recv(win_rx) -> msg => {
                        let event = match msg {
                            Ok(e) => e,
                            Err(_) => break,
                        };
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
                        engine_window::ptt::stop_hook();
                        // Stop media pipeline before capture/transport
                        if let Some(ref mut m) = *media.lock().unwrap() {
                            m.stop();
                        }
                        if let Some(ref mut cap) = *capture.lock().unwrap() {
                            cap.stop();
                        }
                        if let Some(ref mut t) = *transport.lock().unwrap() {
                            t.stop();
                        }
                        // Drop compositor (releases DirectComposition + D3D11 resources)
                        *compositor.lock().unwrap() = None;
                        engine_window::overlay::destroy();
                        engine_window::pip::destroy();
                        break;
                    }
                }
                    }
                    recv(ptt_rx) -> msg => {
                        if let Ok(ptt_event) = msg {
                            if let Some(ref wv) = webview {
                                let event_name = match ptt_event {
                                    PttEvent::KeyDown => "ptt.down",
                                    PttEvent::KeyUp => "ptt.up",
                                };
                                wv.push_event(event_name, &serde_json::json!(null));
                            }
                        }
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
