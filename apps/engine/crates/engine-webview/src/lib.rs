use crossbeam_channel::Sender;
use engine_ipc::Dispatcher;
use std::sync::Arc;
use webview2_com::Microsoft::Web::WebView2::Win32::*;
use webview2_com::*;
use windows::core::*;
use windows::Win32::Foundation::{HWND, RECT};
use windows::Win32::UI::WindowsAndMessaging::GetClientRect;

/// Events from the webview to the orchestrator.
#[derive(Debug)]
pub enum WebviewEvent {
    Ready,
}

/// Manages the WebView2 instance.
pub struct Webview {
    controller: ICoreWebView2Controller,
    webview: ICoreWebView2,
}

/// Wraps webview2_com errors into windows::core::Error.
fn wv_err() -> windows::core::Error {
    windows::core::Error::new(
        windows::core::HRESULT(0x80004005u32 as i32), // E_FAIL
        "WebView2 operation failed",
    )
}

impl Webview {
    /// Create and initialize WebView2 inside the given window.
    pub fn create(
        hwnd_raw: isize,
        url: &str,
        dispatcher: Arc<Dispatcher>,
        event_tx: Sender<WebviewEvent>,
    ) -> windows::core::Result<Self> {
        let hwnd = HWND(hwnd_raw as *mut _);

        // Create the WebView2 environment
        let env = {
            let (tx, rx) = crossbeam_channel::bounded(1);
            let result = CreateCoreWebView2EnvironmentCompletedHandler::wait_for_async_operation(
                Box::new(move |env_handler| unsafe {
                    CreateCoreWebView2Environment(&env_handler)?;
                    Ok(())
                }),
                Box::new(move |_error_code, env| {
                    tx.send(env.ok_or_else(wv_err)).ok();
                    Ok(())
                }),
            );
            result.map_err(|_| wv_err())?;
            rx.recv().map_err(|_| wv_err())??
        };

        // Create the controller + webview
        let (controller, webview) = {
            let (tx, rx) = crossbeam_channel::bounded(1);
            let result = CreateCoreWebView2ControllerCompletedHandler::wait_for_async_operation(
                Box::new(move |controller_handler| unsafe {
                    env.CreateCoreWebView2Controller(hwnd, &controller_handler)?;
                    Ok(())
                }),
                Box::new(move |_error_code, controller| {
                    let result = controller
                        .as_ref()
                        .ok_or_else(wv_err)
                        .and_then(|c| unsafe {
                            let wv = c.CoreWebView2()?;
                            Ok((c.clone(), wv))
                        });
                    tx.send(result).ok();
                    Ok(())
                }),
            );
            result.map_err(|_| wv_err())?;
            rx.recv().map_err(|_| wv_err())??
        };

        // Size the webview to fill the window
        unsafe {
            let mut rect = RECT::default();
            let _ = GetClientRect(hwnd, &mut rect);
            controller.SetBounds(rect)?;
        }

        // Configure settings
        unsafe {
            let settings = webview.Settings()?;
            let is_dev = cfg!(debug_assertions);
            settings.SetAreDevToolsEnabled(is_dev)?;
            settings.SetIsStatusBarEnabled(false)?;
            settings.SetAreDefaultContextMenusEnabled(is_dev)?;
        }

        // Set up IPC message handler
        let webview_for_handler = webview.clone();
        let dispatcher_clone = dispatcher;
        unsafe {
            let mut _token = windows::Win32::System::WinRT::EventRegistrationToken::default();
            webview.add_WebMessageReceived(
                &WebMessageReceivedEventHandler::create(Box::new(
                    move |_webview, args| {
                        if let Some(args) = args {
                            let mut message = PWSTR::null();
                            args.TryGetWebMessageAsString(&mut message)?;
                            let msg_str = message.to_string().unwrap_or_default();

                            if let Some(response) = dispatcher_clone.dispatch(&msg_str) {
                                let script = format!(
                                    "window.__ripcord_ipc_recv({})",
                                    serde_json::to_string(&response).unwrap_or_default()
                                );
                                let script_hstring: HSTRING = script.into();
                                webview_for_handler.ExecuteScript(
                                    &script_hstring,
                                    None,
                                )?;
                            }
                        }
                        Ok(())
                    },
                )),
                &mut _token,
            )?;
        }

        // Navigate to URL
        let url_hstring: HSTRING = url.into();
        unsafe {
            webview.Navigate(&url_hstring)?;
        }

        let _ = event_tx.send(WebviewEvent::Ready);

        Ok(Self {
            controller,
            webview,
        })
    }

    /// Resize the webview to match new window dimensions.
    pub fn resize(&self, width: u32, height: u32) {
        let rect = RECT {
            left: 0,
            top: 0,
            right: width as i32,
            bottom: height as i32,
        };
        unsafe {
            let _ = self.controller.SetBounds(rect);
        }
    }

    /// Execute JavaScript in the webview.
    pub fn eval(&self, script: &str) {
        let script_hstring: HSTRING = script.into();
        unsafe {
            let _ = self.webview.ExecuteScript(&script_hstring, None);
        }
    }

    /// Push an event to the frontend.
    pub fn push_event(&self, event: &str, data: &serde_json::Value) {
        let event_json = serde_json::json!({ "event": event, "data": data });
        let script = format!(
            "window.__ripcord_ipc_event({})",
            serde_json::to_string(&event_json).unwrap_or_default()
        );
        self.eval(&script);
    }
}
