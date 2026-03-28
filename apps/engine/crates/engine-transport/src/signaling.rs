use serde::{Deserialize, Serialize};

/// Signaling messages exchanged through the gateway WebSocket.
/// These are new opcodes added to the existing gateway protocol.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "op", content = "d")]
pub enum SignalingMessage {
    /// Offer SDP from the screen sharer.
    #[serde(rename = "SCREEN_OFFER")]
    ScreenOffer(SdpPayload),

    /// Answer SDP from the viewer.
    #[serde(rename = "SCREEN_ANSWER")]
    ScreenAnswer(SdpPayload),

    /// ICE candidate trickle.
    #[serde(rename = "SCREEN_ICE")]
    ScreenIce(IcePayload),

    /// Stop screen sharing.
    #[serde(rename = "SCREEN_STOP")]
    ScreenStop(StopPayload),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SdpPayload {
    /// The user ID of the sender.
    pub user_id: String,
    /// The SDP string.
    pub sdp: String,
    /// Target user ID (for answer) or channel/group ID (for offer).
    pub target: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IcePayload {
    pub user_id: String,
    pub target: String,
    /// ICE candidate string (from str0m's Candidate::to_sdp_string()).
    pub candidate: String,
    /// The media line index this candidate belongs to.
    pub sdp_m_line_index: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StopPayload {
    pub user_id: String,
}

impl SignalingMessage {
    /// Serialize to JSON for sending over the gateway WebSocket.
    pub fn to_json(&self) -> Result<String, String> {
        serde_json::to_string(self).map_err(|e| e.to_string())
    }

    /// Parse from JSON received over the gateway WebSocket.
    pub fn from_json(json: &str) -> Result<Self, String> {
        serde_json::from_str(json).map_err(|e| e.to_string())
    }
}
