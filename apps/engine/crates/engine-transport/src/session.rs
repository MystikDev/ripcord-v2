use std::net::{SocketAddr, UdpSocket};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use crossbeam_channel::{Receiver, Sender, TryRecvError};
use str0m::change::SdpOffer;
use str0m::media::{Direction, MediaKind, MediaTime, Mid, Frequency};
use str0m::net::{Protocol, Receive};
use str0m::{Candidate, Event, IceConnectionState, Input, Output, Rtc};

use crate::bandwidth::{BandwidthEstimator, BweHandle};
use crate::signaling::SignalingMessage;
use crate::stun;
use crate::turn::{TurnCredentials, TurnRelay};

/// Callback for outgoing signaling messages (SDP, ICE candidates).
pub type SignalingSender = Arc<dyn Fn(SignalingMessage) + Send + Sync>;

/// An encoded video frame to be sent via RTP.
pub struct OutgoingFrame {
    pub data: Vec<u8>,
    pub is_keyframe: bool,
    pub pts_ms: u64,
}

/// A received media frame from the remote peer.
pub struct IncomingFrame {
    pub data: Vec<u8>,
    pub mid: Mid,
    pub pts_ms: u64,
}

/// A WebRTC session for screen share transport.
/// Wraps str0m's `Rtc` instance with UDP socket I/O.
pub struct WebRtcSession {
    running: Arc<AtomicBool>,
    thread: Option<std::thread::JoinHandle<()>>,
    /// The media ID for our video track.
    video_mid: Option<Mid>,
    /// TURN relay (kept alive for the session duration).
    _turn_relay: Option<Arc<Mutex<TurnRelay>>>,
    /// Bandwidth estimator for adaptive quality.
    bwe: BandwidthEstimator,
    /// Channel to send encoded frames into the transport for RTP packetization.
    frame_tx: Sender<OutgoingFrame>,
    /// Channel to receive decoded media data from the remote peer.
    frame_rx: Receiver<IncomingFrame>,
}

/// ICE server configuration (STUN or TURN).
#[derive(Debug, Clone)]
pub struct IceServer {
    /// Server address (e.g. "stun.l.google.com:19302" or "turn.example.com:3478").
    pub url: String,
    /// Username (TURN only).
    pub username: Option<String>,
    /// Credential/password (TURN only).
    pub credential: Option<String>,
}

impl IceServer {
    /// Create a STUN-only server config.
    pub fn stun(url: &str) -> Self {
        Self {
            url: url.into(),
            username: None,
            credential: None,
        }
    }

    /// Create a TURN server config with credentials.
    pub fn turn(url: &str, username: &str, credential: &str) -> Self {
        Self {
            url: url.into(),
            username: Some(username.into()),
            credential: Some(credential.into()),
        }
    }

    /// Returns true if this is a TURN server (has credentials).
    pub fn is_turn(&self) -> bool {
        self.username.is_some() && self.credential.is_some()
    }
}

/// Configuration for creating a session.
pub struct SessionConfig {
    /// Local UDP bind address (e.g. "0.0.0.0:0" for auto).
    pub bind_addr: String,
    /// User ID for signaling.
    pub user_id: String,
    /// Target user/channel for signaling.
    pub target: String,
    /// ICE servers (STUN/TURN) for NAT traversal.
    pub ice_servers: Vec<IceServer>,
}

impl Default for SessionConfig {
    fn default() -> Self {
        Self {
            bind_addr: "0.0.0.0:0".into(),
            user_id: String::new(),
            target: String::new(),
            ice_servers: vec![IceServer::stun("stun.l.google.com:19302")],
        }
    }
}

impl WebRtcSession {
    /// Create a new session as the offerer (screen sharer).
    /// Returns the session and the SDP offer string.
    pub fn create_offer(
        config: SessionConfig,
        signaling_tx: SignalingSender,
    ) -> Result<(Self, String), String> {
        let socket = UdpSocket::bind(&config.bind_addr)
            .map_err(|e| format!("UDP bind: {e}"))?;
        let local_addr = socket
            .local_addr()
            .map_err(|e| format!("local_addr: {e}"))?;

        let mut rtc = Rtc::new(Instant::now());

        // Add local host candidate
        let candidate = Candidate::host(local_addr, "udp")
            .map_err(|e| format!("Candidate::host: {e}"))?;
        rtc.add_local_candidate(candidate);

        // Gather STUN/TURN candidates for NAT traversal
        let turn_relay = gather_ice_candidates(&socket, &config.ice_servers, &mut rtc)?;

        // Add video media line (send only for screen share)
        let mut change = rtc.sdp_api();
        let mid = change.add_media(MediaKind::Video, Direction::SendOnly, None, None, None);
        let (offer, pending) = change
            .apply()
            .ok_or("SDP apply returned None (no changes)")?;

        let offer_sdp = offer.to_sdp_string();

        let bwe = BandwidthEstimator::new();
        let bwe_handle = bwe.handle();

        // Frame channels: outgoing (encoded → RTP) and incoming (RTP → decoded)
        let (out_tx, out_rx) = crossbeam_channel::bounded::<OutgoingFrame>(8);
        let (in_tx, in_rx) = crossbeam_channel::bounded::<IncomingFrame>(8);

        let running = Arc::new(AtomicBool::new(true));
        let running_clone = running.clone();
        let turn_for_thread = turn_relay.clone();

        let thread = std::thread::Builder::new()
            .name("webrtc-session".into())
            .spawn(move || {
                let _ = pending;
                run_loop(rtc, socket, &running_clone, signaling_tx, config, turn_for_thread, bwe_handle, out_rx, in_tx, Some(mid));
            })
            .map_err(|e| format!("Spawn WebRTC thread: {e}"))?;

        log::info!("WebRTC session created (offerer), local={local_addr}");

        Ok((
            Self {
                running,
                thread: Some(thread),
                video_mid: Some(mid),
                _turn_relay: turn_relay,
                bwe,
                frame_tx: out_tx,
                frame_rx: in_rx,
            },
            offer_sdp,
        ))
    }

    /// Create a new session as the answerer (viewer).
    /// Returns the session and the SDP answer string.
    pub fn create_answer(
        config: SessionConfig,
        offer_sdp: &str,
        signaling_tx: SignalingSender,
    ) -> Result<(Self, String), String> {
        let socket = UdpSocket::bind(&config.bind_addr)
            .map_err(|e| format!("UDP bind: {e}"))?;
        let local_addr = socket
            .local_addr()
            .map_err(|e| format!("local_addr: {e}"))?;

        let mut rtc = Rtc::new(Instant::now());

        // Add local host candidate
        let candidate = Candidate::host(local_addr, "udp")
            .map_err(|e| format!("Candidate::host: {e}"))?;
        rtc.add_local_candidate(candidate);

        // Gather STUN/TURN candidates for NAT traversal
        let turn_relay = gather_ice_candidates(&socket, &config.ice_servers, &mut rtc)?;

        // Parse and accept the offer
        let offer = SdpOffer::from_sdp_string(offer_sdp)
            .map_err(|e| format!("Parse offer: {e}"))?;
        let answer = rtc
            .sdp_api()
            .accept_offer(offer)
            .map_err(|e| format!("Accept offer: {e}"))?;

        let answer_sdp = answer.to_sdp_string();

        let bwe = BandwidthEstimator::new();
        let bwe_handle = bwe.handle();

        let (out_tx, out_rx) = crossbeam_channel::bounded::<OutgoingFrame>(8);
        let (in_tx, in_rx) = crossbeam_channel::bounded::<IncomingFrame>(8);

        let running = Arc::new(AtomicBool::new(true));
        let running_clone = running.clone();
        let turn_for_thread = turn_relay.clone();

        let thread = std::thread::Builder::new()
            .name("webrtc-session".into())
            .spawn(move || {
                run_loop(rtc, socket, &running_clone, signaling_tx, config, turn_for_thread, bwe_handle, out_rx, in_tx, None);
            })
            .map_err(|e| format!("Spawn WebRTC thread: {e}"))?;

        log::info!("WebRTC session created (answerer), local={local_addr}");

        Ok((
            Self {
                running,
                thread: Some(thread),
                video_mid: None, // Viewer doesn't send
                _turn_relay: turn_relay,
                bwe,
                frame_tx: out_tx,
                frame_rx: in_rx,
            },
            answer_sdp,
        ))
    }

    /// Stop the session.
    pub fn stop(&mut self) {
        self.running.store(false, Ordering::Relaxed);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
        log::info!("WebRTC session stopped");
    }

    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::Relaxed)
    }

    pub fn video_mid(&self) -> Option<Mid> {
        self.video_mid
    }

    /// Get the bandwidth estimator for adaptive quality.
    pub fn bandwidth_estimator(&self) -> &BandwidthEstimator {
        &self.bwe
    }

    /// Send an encoded video frame via RTP.
    /// Non-blocking — drops the frame if the channel is full.
    pub fn send_frame(&self, frame: OutgoingFrame) -> Result<(), String> {
        self.frame_tx
            .try_send(frame)
            .map_err(|e| format!("Frame send: {e}"))
    }

    /// Try to receive an incoming media frame from the remote peer.
    /// Non-blocking — returns None if no frame is available.
    pub fn recv_frame(&self) -> Option<IncomingFrame> {
        self.frame_rx.try_recv().ok()
    }

    /// Get a clone of the frame sender for use from other threads (e.g. capture pipeline).
    pub fn frame_sender(&self) -> Sender<OutgoingFrame> {
        self.frame_tx.clone()
    }

    /// Get a clone of the frame receiver for use from other threads (e.g. decoder pipeline).
    pub fn frame_receiver(&self) -> Receiver<IncomingFrame> {
        self.frame_rx.clone()
    }
}

impl Drop for WebRtcSession {
    fn drop(&mut self) {
        self.stop();
    }
}

/// Gather ICE candidates from STUN/TURN servers.
/// Returns an optional TURN relay that must be kept alive for the session.
fn gather_ice_candidates(
    socket: &UdpSocket,
    ice_servers: &[IceServer],
    rtc: &mut Rtc,
) -> Result<Option<Arc<Mutex<TurnRelay>>>, String> {
    let mut turn_relay: Option<Arc<Mutex<TurnRelay>>> = None;
    let local_addr = socket
        .local_addr()
        .map_err(|e| format!("local_addr: {e}"))?;

    for server in ice_servers {
        let addr: SocketAddr = server
            .url
            .parse()
            .or_else(|_| {
                // Try resolving hostname
                use std::net::ToSocketAddrs;
                server.url.to_socket_addrs()
                    .map_err(|e| format!("Resolve {}: {e}", server.url))
                    .and_then(|mut addrs| addrs.next().ok_or_else(|| "No addresses".into()))
            })
            .map_err(|e| format!("Parse ICE server {}: {e}", server.url))?;

        if server.is_turn() {
            // TURN server — allocate relay address
            let creds = TurnCredentials {
                server: addr,
                username: server.username.clone().unwrap_or_default(),
                password: server.credential.clone().unwrap_or_default(),
            };

            match TurnRelay::allocate(socket, creds) {
                Ok(relay) => {
                    // Add relay candidate (base = local socket addr)
                    let relay_addr = relay.relay_addr();
                    if let Ok(candidate) = Candidate::relayed(relay_addr, local_addr, "udp") {
                        rtc.add_local_candidate(candidate);
                        log::info!("Added TURN relay candidate: {relay_addr}");
                    }

                    // Also use the srflx from TURN allocation
                    let srflx_addr = relay.srflx_addr();
                    if let Ok(candidate) = Candidate::server_reflexive(srflx_addr, local_addr, "udp") {
                        rtc.add_local_candidate(candidate);
                        log::info!("Added srflx candidate from TURN: {srflx_addr}");
                    }

                    turn_relay = Some(Arc::new(Mutex::new(relay)));
                }
                Err(e) => {
                    log::warn!("TURN allocation failed ({}): {e}", server.url);
                }
            }
        } else {
            // STUN server — discover server-reflexive address
            match stun::stun_binding(socket, addr) {
                Ok(result) => {
                    if let Ok(candidate) = Candidate::server_reflexive(result.srflx_addr, local_addr, "udp") {
                        rtc.add_local_candidate(candidate);
                        log::info!("Added STUN srflx candidate: {}", result.srflx_addr);
                    }
                }
                Err(e) => {
                    log::warn!("STUN binding failed ({}): {e}", server.url);
                }
            }
        }
    }

    Ok(turn_relay)
}

/// The str0m run loop — drives ICE, DTLS, and RTP/RTCP.
fn run_loop(
    mut rtc: Rtc,
    socket: UdpSocket,
    running: &AtomicBool,
    _signaling_tx: SignalingSender,
    _config: SessionConfig,
    turn_relay: Option<Arc<Mutex<TurnRelay>>>,
    bwe_handle: BweHandle,
    frame_rx: Receiver<OutgoingFrame>,
    incoming_tx: Sender<IncomingFrame>,
    video_mid: Option<Mid>,
) {
    let mut buf = vec![0u8; 2000];

    log::info!("WebRTC run loop started");

    while running.load(Ordering::Relaxed) {
        // Drain outgoing encoded frames → write via str0m's media writer
        if let Some(mid) = video_mid {
            loop {
                match frame_rx.try_recv() {
                    Ok(frame) => {
                        if let Some(writer) = rtc.writer(mid) {
                            // Video clock rate is 90kHz — convert ms to 90kHz ticks
                            let rtp_time = MediaTime::new(
                                frame.pts_ms * 90,
                                Frequency::NINETY_KHZ,
                            );
                            // str0m handles RTP packetization internally
                            if let Err(e) = writer.write(
                                96.into(), // H.264 dynamic payload type
                                Instant::now(),
                                rtp_time,
                                frame.data,
                            ) {
                                log::error!("RTP write: {e}");
                            }
                        }
                    }
                    Err(TryRecvError::Empty) => break,
                    Err(TryRecvError::Disconnected) => {
                        log::info!("Frame channel closed");
                        running.store(false, Ordering::Relaxed);
                        return;
                    }
                }
            }
        }

        // Refresh TURN allocation if needed
        if let Some(ref relay) = turn_relay {
            if let Ok(mut r) = relay.try_lock() {
                if r.needs_refresh() {
                    if let Err(e) = r.refresh() {
                        log::warn!("TURN refresh failed: {e}");
                    }
                }
            }
        }

        // Poll output from str0m
        let timeout = match rtc.poll_output() {
            Ok(output) => match output {
                Output::Timeout(t) => t,

                Output::Transmit(t) => {
                    if let Err(e) = socket.send_to(&t.contents, t.destination) {
                        log::error!("UDP send: {e}");
                    }
                    continue;
                }

                Output::Event(event) => {
                    handle_event(&event, &bwe_handle, &incoming_tx);

                    if matches!(
                        event,
                        Event::IceConnectionStateChange(IceConnectionState::Disconnected)
                    ) {
                        log::info!("ICE disconnected, stopping session");
                        running.store(false, Ordering::Relaxed);
                        return;
                    }

                    continue;
                }
            },
            Err(e) => {
                log::error!("Rtc poll_output error: {e}");
                std::thread::sleep(std::time::Duration::from_millis(10));
                continue;
            }
        };

        // Wait for network input or timeout
        let now = Instant::now();
        let duration = timeout.saturating_duration_since(now);

        if duration.is_zero() {
            let _ = rtc.handle_input(Input::Timeout(Instant::now()));
            continue;
        }

        socket
            .set_read_timeout(Some(duration))
            .unwrap_or_default();

        buf.resize(2000, 0);

        let input = match socket.recv_from(&mut buf) {
            Ok((n, source)) => {
                buf.truncate(n);

                // Check if this is TURN ChannelData (relayed packet) — unwrap in-place
                if let Some((_channel, payload)) = TurnRelay::parse_channel_data(&buf) {
                    let payload_len = payload.len();
                    // Copy payload to front of buf so it outlives the borrow
                    buf.copy_within(4..4 + payload_len, 0);
                    buf.truncate(payload_len);
                }

                Input::Receive(
                    Instant::now(),
                    Receive {
                        proto: Protocol::Udp,
                        source,
                        destination: socket.local_addr().unwrap_or_else(|_| {
                            "0.0.0.0:0".parse().unwrap()
                        }),
                        contents: buf.as_slice().try_into().unwrap(),
                    },
                )
            }
            Err(e) => {
                use std::io::ErrorKind;
                match e.kind() {
                    ErrorKind::WouldBlock | ErrorKind::TimedOut => {
                        Input::Timeout(Instant::now())
                    }
                    _ => {
                        log::error!("UDP recv: {e}");
                        return;
                    }
                }
            }
        };

        if let Err(e) = rtc.handle_input(input) {
            log::error!("Rtc handle_input error: {e}");
        }
    }

    log::info!("WebRTC run loop stopped");
}

fn handle_event(event: &Event, bwe: &BweHandle, incoming_tx: &Sender<IncomingFrame>) {
    match event {
        Event::IceConnectionStateChange(state) => {
            log::info!("ICE state: {state:?}");
        }
        Event::MediaAdded(m) => {
            log::info!("Media added: mid={}, kind={:?}, dir={:?}", m.mid, m.kind, m.direction);
        }
        Event::MediaData(d) => {
            log::debug!(
                "Media data: mid={}, len={}, time={:?}",
                d.mid,
                d.data.len(),
                d.time,
            );
            // Forward to the incoming frame channel for decoding
            let pts_ms = d.time.numer() as u64 * 1000 / d.time.denom() as u64;
            let _ = incoming_tx.try_send(IncomingFrame {
                data: d.data.to_vec(),
                mid: d.mid,
                pts_ms,
            });
        }
        Event::KeyframeRequest(kr) => {
            log::info!("Keyframe request: mid={}, kind={:?}", kr.mid, kr.kind);
        }
        Event::EgressBitrateEstimate(bwe_kind) => {
            use str0m::bwe::BweKind;
            let bitrate_bps = match bwe_kind {
                BweKind::Twcc(bitrate) => bitrate.as_u64() as u32,
                BweKind::Remb(_, bitrate) => bitrate.as_u64() as u32,
                _ => return, // non_exhaustive
            };
            bwe.report_remb(bitrate_bps);
        }
        _ => {
            log::debug!("WebRTC event: {event:?}");
        }
    }
}
