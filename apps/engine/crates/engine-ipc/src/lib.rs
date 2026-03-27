use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;

/// JSON-RPC 2.0 request from the frontend.
#[derive(Debug, Deserialize)]
pub struct RpcRequest {
    pub method: String,
    pub params: serde_json::Value,
    pub id: u64,
}

/// JSON-RPC 2.0 response to the frontend.
#[derive(Debug, Serialize)]
pub struct RpcResponse {
    pub id: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<RpcError>,
}

#[derive(Debug, Serialize)]
pub struct RpcError {
    pub code: i32,
    pub message: String,
}

/// An event pushed from Rust to the frontend (no request id).
#[derive(Debug, Serialize)]
pub struct RpcEvent {
    pub event: String,
    pub data: serde_json::Value,
}

impl RpcResponse {
    pub fn ok(id: u64, result: serde_json::Value) -> Self {
        Self {
            id,
            result: Some(result),
            error: None,
        }
    }

    pub fn err(id: u64, code: i32, message: impl Into<String>) -> Self {
        Self {
            id,
            result: None,
            error: Some(RpcError {
                code,
                message: message.into(),
            }),
        }
    }

    pub fn method_not_found(id: u64, method: &str) -> Self {
        Self::err(id, -32601, format!("Method not found: {method}"))
    }

    pub fn to_json(&self) -> String {
        serde_json::to_string(self).unwrap_or_default()
    }
}

impl RpcEvent {
    pub fn new(event: impl Into<String>, data: serde_json::Value) -> Self {
        Self {
            event: event.into(),
            data,
        }
    }

    pub fn to_json(&self) -> String {
        serde_json::to_string(self).unwrap_or_default()
    }
}

/// Handler function signature: takes params, returns result or error.
pub type HandlerFn = Arc<dyn Fn(serde_json::Value) -> Result<serde_json::Value, String> + Send + Sync>;

/// Routes JSON-RPC methods to handler functions.
pub struct Dispatcher {
    handlers: HashMap<String, HandlerFn>,
}

impl Dispatcher {
    pub fn new() -> Self {
        Self {
            handlers: HashMap::new(),
        }
    }

    /// Register a handler for a namespaced method (e.g. "system.getVersion").
    pub fn register(&mut self, method: impl Into<String>, handler: HandlerFn) {
        self.handlers.insert(method.into(), handler);
    }

    /// Parse a raw JSON string and dispatch to the appropriate handler.
    pub fn dispatch(&self, raw: &str) -> Option<String> {
        let req: RpcRequest = match serde_json::from_str(raw) {
            Ok(r) => r,
            Err(e) => {
                log::warn!("Invalid JSON-RPC request: {e}");
                return None;
            }
        };

        let response = match self.handlers.get(&req.method) {
            Some(handler) => match handler(req.params) {
                Ok(result) => RpcResponse::ok(req.id, result),
                Err(msg) => RpcResponse::err(req.id, -32000, msg),
            },
            None => RpcResponse::method_not_found(req.id, &req.method),
        };

        Some(response.to_json())
    }
}

impl Default for Dispatcher {
    fn default() -> Self {
        Self::new()
    }
}
