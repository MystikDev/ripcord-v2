//! Lightweight TURN client for relay candidate allocation.
//!
//! Implements the subset of RFC 5766 needed for WebRTC relay:
//! - ALLOCATE: obtain a relay address on the TURN server
//! - REFRESH: keep the allocation alive
//! - CREATE-PERMISSION: allow peer to send through relay
//! - CHANNEL-BIND: efficient data relay via channel numbers
//!
//! All TURN messages authenticate with long-term credentials (MESSAGE-INTEGRITY).

use std::net::{SocketAddr, UdpSocket};
use std::time::{Duration, Instant};

// STUN/TURN message types
const ALLOCATE_REQUEST: u16 = 0x0003;
const ALLOCATE_RESPONSE: u16 = 0x0103;
const ALLOCATE_ERROR: u16 = 0x0113;
const REFRESH_REQUEST: u16 = 0x0004;
const REFRESH_RESPONSE: u16 = 0x0104;
const CREATE_PERMISSION_REQUEST: u16 = 0x0008;
const CREATE_PERMISSION_RESPONSE: u16 = 0x0108;
const CHANNEL_BIND_REQUEST: u16 = 0x0009;
const CHANNEL_BIND_RESPONSE: u16 = 0x0109;

const MAGIC_COOKIE: u32 = 0x2112A442;

// STUN attribute types
const ATTR_XOR_MAPPED_ADDRESS: u16 = 0x0020;
const ATTR_XOR_RELAYED_ADDRESS: u16 = 0x0016;
const ATTR_LIFETIME: u16 = 0x000D;
const ATTR_REQUESTED_TRANSPORT: u16 = 0x0019;
const ATTR_USERNAME: u16 = 0x0006;
const ATTR_REALM: u16 = 0x0014;
const ATTR_NONCE: u16 = 0x0015;
const ATTR_MESSAGE_INTEGRITY: u16 = 0x0008;
const ATTR_ERROR_CODE: u16 = 0x0009;
const ATTR_XOR_PEER_ADDRESS: u16 = 0x0012;
const ATTR_CHANNEL_NUMBER: u16 = 0x000C;

/// TURN server credentials.
#[derive(Debug, Clone)]
pub struct TurnCredentials {
    pub server: SocketAddr,
    pub username: String,
    pub password: String,
}

/// A TURN allocation — a relay address on the server.
#[derive(Debug, Clone)]
pub struct TurnAllocation {
    /// The relay address assigned by the TURN server.
    pub relay_addr: SocketAddr,
    /// Our server-reflexive address as seen by the TURN server.
    pub srflx_addr: SocketAddr,
    /// Allocation lifetime in seconds.
    pub lifetime_secs: u32,
    /// When the allocation was obtained.
    pub allocated_at: Instant,
}

/// Active TURN relay session.
pub struct TurnRelay {
    socket: UdpSocket,
    credentials: TurnCredentials,
    allocation: TurnAllocation,
    realm: String,
    nonce: String,
    /// Channel bindings: peer_addr → channel_number (0x4000-0x7FFF)
    channels: Vec<(SocketAddr, u16)>,
    next_channel: u16,
}

impl TurnRelay {
    /// Allocate a relay address on the TURN server.
    pub fn allocate(
        socket: &UdpSocket,
        credentials: TurnCredentials,
    ) -> Result<Self, String> {
        let txn_id = rand_txn_id();

        // Step 1: Send initial ALLOCATE (will get 401 with realm+nonce)
        let initial_req = build_allocate_request(&txn_id, None, None, None);
        socket
            .send_to(&initial_req, credentials.server)
            .map_err(|e| format!("TURN send: {e}"))?;

        let (realm, nonce) = receive_401_challenge(socket, &txn_id)?;

        // Step 2: Send authenticated ALLOCATE with credentials
        let txn_id2 = rand_txn_id();
        let key = compute_key(&credentials.username, &realm, &credentials.password);
        let auth_req = build_allocate_request(
            &txn_id2,
            Some(&credentials.username),
            Some(&realm),
            Some(&nonce),
        );
        let auth_req = append_message_integrity(auth_req, &key);

        socket
            .send_to(&auth_req, credentials.server)
            .map_err(|e| format!("TURN send (auth): {e}"))?;

        // Read the success response
        let allocation = receive_allocate_response(socket, &txn_id2)?;

        log::info!(
            "TURN allocation: relay={}, srflx={}, lifetime={}s",
            allocation.relay_addr,
            allocation.srflx_addr,
            allocation.lifetime_secs,
        );

        Ok(Self {
            socket: socket.try_clone().map_err(|e| format!("socket clone: {e}"))?,
            credentials,
            allocation,
            realm,
            nonce,
            channels: Vec::new(),
            next_channel: 0x4000,
        })
    }

    /// Get the relay address for use as an ICE relay candidate.
    pub fn relay_addr(&self) -> SocketAddr {
        self.allocation.relay_addr
    }

    /// Get the server-reflexive address discovered during allocation.
    pub fn srflx_addr(&self) -> SocketAddr {
        self.allocation.srflx_addr
    }

    /// Create a permission for a peer address (required before data can flow).
    pub fn create_permission(&mut self, peer_addr: SocketAddr) -> Result<(), String> {
        let txn_id = rand_txn_id();
        let key = compute_key(&self.credentials.username, &self.realm, &self.credentials.password);

        let req = build_create_permission_request(
            &txn_id,
            peer_addr,
            &self.credentials.username,
            &self.realm,
            &self.nonce,
        );
        let req = append_message_integrity(req, &key);

        self.socket
            .send_to(&req, self.credentials.server)
            .map_err(|e| format!("TURN create-permission send: {e}"))?;

        // Wait for response
        receive_simple_response(&self.socket, &txn_id, CREATE_PERMISSION_RESPONSE)?;

        log::info!("TURN permission created for {peer_addr}");
        Ok(())
    }

    /// Bind a channel to a peer address for efficient data relay.
    /// Returns the channel number.
    pub fn channel_bind(&mut self, peer_addr: SocketAddr) -> Result<u16, String> {
        // Check if already bound
        for &(addr, ch) in &self.channels {
            if addr == peer_addr {
                return Ok(ch);
            }
        }

        let channel = self.next_channel;
        if channel > 0x7FFF {
            return Err("No more TURN channels available".into());
        }
        self.next_channel += 1;

        let txn_id = rand_txn_id();
        let key = compute_key(&self.credentials.username, &self.realm, &self.credentials.password);

        let req = build_channel_bind_request(
            &txn_id,
            channel,
            peer_addr,
            &self.credentials.username,
            &self.realm,
            &self.nonce,
        );
        let req = append_message_integrity(req, &key);

        self.socket
            .send_to(&req, self.credentials.server)
            .map_err(|e| format!("TURN channel-bind send: {e}"))?;

        receive_simple_response(&self.socket, &txn_id, CHANNEL_BIND_RESPONSE)?;

        self.channels.push((peer_addr, channel));
        log::info!("TURN channel {channel:#06x} bound to {peer_addr}");
        Ok(channel)
    }

    /// Send data through a channel binding (ChannelData message).
    pub fn send_channel_data(&self, channel: u16, data: &[u8]) -> Result<(), String> {
        // ChannelData format: 2-byte channel | 2-byte length | data | padding
        let padded_len = (data.len() + 3) & !3;
        let mut msg = Vec::with_capacity(4 + padded_len);
        msg.extend_from_slice(&channel.to_be_bytes());
        msg.extend_from_slice(&(data.len() as u16).to_be_bytes());
        msg.extend_from_slice(data);
        // Pad to 4-byte boundary
        while msg.len() < 4 + padded_len {
            msg.push(0);
        }

        self.socket
            .send_to(&msg, self.credentials.server)
            .map_err(|e| format!("TURN channel-data send: {e}"))?;

        Ok(())
    }

    /// Check if data received from the TURN server is ChannelData.
    /// Returns (channel_number, payload) if so.
    pub fn parse_channel_data(data: &[u8]) -> Option<(u16, &[u8])> {
        if data.len() < 4 {
            return None;
        }
        let channel = u16::from_be_bytes([data[0], data[1]]);
        // Channel numbers are 0x4000-0x7FFF
        if !(0x4000..=0x7FFF).contains(&channel) {
            return None;
        }
        let length = u16::from_be_bytes([data[2], data[3]]) as usize;
        if data.len() < 4 + length {
            return None;
        }
        Some((channel, &data[4..4 + length]))
    }

    /// Refresh the allocation (should be called before lifetime expires).
    pub fn refresh(&mut self) -> Result<(), String> {
        let txn_id = rand_txn_id();
        let key = compute_key(&self.credentials.username, &self.realm, &self.credentials.password);

        let req = build_refresh_request(
            &txn_id,
            &self.credentials.username,
            &self.realm,
            &self.nonce,
        );
        let req = append_message_integrity(req, &key);

        self.socket
            .send_to(&req, self.credentials.server)
            .map_err(|e| format!("TURN refresh send: {e}"))?;

        receive_simple_response(&self.socket, &txn_id, REFRESH_RESPONSE)?;
        self.allocation.allocated_at = Instant::now();

        log::debug!("TURN allocation refreshed");
        Ok(())
    }

    /// Check if the allocation needs refreshing (refresh at 80% of lifetime).
    pub fn needs_refresh(&self) -> bool {
        let elapsed = self.allocation.allocated_at.elapsed().as_secs();
        elapsed >= (self.allocation.lifetime_secs as u64 * 4 / 5)
    }

    /// Deallocate the relay (lifetime=0 refresh).
    pub fn deallocate(&mut self) {
        let txn_id = rand_txn_id();
        let key = compute_key(&self.credentials.username, &self.realm, &self.credentials.password);

        let mut req = build_refresh_request(
            &txn_id,
            &self.credentials.username,
            &self.realm,
            &self.nonce,
        );
        // Override lifetime to 0
        set_lifetime_zero(&mut req);
        let req = append_message_integrity(req, &key);

        let _ = self.socket.send_to(&req, self.credentials.server);
        log::info!("TURN allocation deallocated");
    }
}

impl Drop for TurnRelay {
    fn drop(&mut self) {
        self.deallocate();
    }
}

// ---------------------------------------------------------------------------
// Message builders
// ---------------------------------------------------------------------------

fn build_allocate_request(
    txn_id: &[u8; 12],
    username: Option<&str>,
    realm: Option<&str>,
    nonce: Option<&str>,
) -> Vec<u8> {
    let mut attrs = Vec::new();

    // REQUESTED-TRANSPORT: UDP (17)
    add_attr(&mut attrs, ATTR_REQUESTED_TRANSPORT, &[17, 0, 0, 0]);

    // Auth attributes if provided
    if let (Some(user), Some(realm), Some(nonce)) = (username, realm, nonce) {
        add_attr(&mut attrs, ATTR_USERNAME, user.as_bytes());
        add_attr(&mut attrs, ATTR_REALM, realm.as_bytes());
        add_attr(&mut attrs, ATTR_NONCE, nonce.as_bytes());
    }

    build_stun_message(ALLOCATE_REQUEST, txn_id, &attrs)
}

fn build_refresh_request(
    txn_id: &[u8; 12],
    username: &str,
    realm: &str,
    nonce: &str,
) -> Vec<u8> {
    let mut attrs = Vec::new();
    add_attr(&mut attrs, ATTR_USERNAME, username.as_bytes());
    add_attr(&mut attrs, ATTR_REALM, realm.as_bytes());
    add_attr(&mut attrs, ATTR_NONCE, nonce.as_bytes());

    build_stun_message(REFRESH_REQUEST, txn_id, &attrs)
}

fn build_create_permission_request(
    txn_id: &[u8; 12],
    peer_addr: SocketAddr,
    username: &str,
    realm: &str,
    nonce: &str,
) -> Vec<u8> {
    let mut attrs = Vec::new();
    add_xor_peer_address(&mut attrs, peer_addr);
    add_attr(&mut attrs, ATTR_USERNAME, username.as_bytes());
    add_attr(&mut attrs, ATTR_REALM, realm.as_bytes());
    add_attr(&mut attrs, ATTR_NONCE, nonce.as_bytes());

    build_stun_message(CREATE_PERMISSION_REQUEST, txn_id, &attrs)
}

fn build_channel_bind_request(
    txn_id: &[u8; 12],
    channel: u16,
    peer_addr: SocketAddr,
    username: &str,
    realm: &str,
    nonce: &str,
) -> Vec<u8> {
    let mut attrs = Vec::new();

    // CHANNEL-NUMBER
    let mut ch_val = [0u8; 4];
    ch_val[0..2].copy_from_slice(&channel.to_be_bytes());
    add_attr(&mut attrs, ATTR_CHANNEL_NUMBER, &ch_val);

    add_xor_peer_address(&mut attrs, peer_addr);
    add_attr(&mut attrs, ATTR_USERNAME, username.as_bytes());
    add_attr(&mut attrs, ATTR_REALM, realm.as_bytes());
    add_attr(&mut attrs, ATTR_NONCE, nonce.as_bytes());

    build_stun_message(CHANNEL_BIND_REQUEST, txn_id, &attrs)
}

fn build_stun_message(msg_type: u16, txn_id: &[u8; 12], attrs: &[u8]) -> Vec<u8> {
    let mut msg = Vec::with_capacity(20 + attrs.len());
    msg.extend_from_slice(&msg_type.to_be_bytes());
    msg.extend_from_slice(&(attrs.len() as u16).to_be_bytes());
    msg.extend_from_slice(&MAGIC_COOKIE.to_be_bytes());
    msg.extend_from_slice(txn_id);
    msg.extend_from_slice(attrs);
    msg
}

fn add_attr(attrs: &mut Vec<u8>, attr_type: u16, value: &[u8]) {
    attrs.extend_from_slice(&attr_type.to_be_bytes());
    attrs.extend_from_slice(&(value.len() as u16).to_be_bytes());
    attrs.extend_from_slice(value);
    // Pad to 4-byte boundary
    let pad = (4 - (value.len() % 4)) % 4;
    for _ in 0..pad {
        attrs.push(0);
    }
}

fn add_xor_peer_address(attrs: &mut Vec<u8>, addr: SocketAddr) {
    let mut value = Vec::new();
    value.push(0); // Reserved
    match addr {
        SocketAddr::V4(v4) => {
            value.push(0x01); // IPv4
            let xport = v4.port() ^ (MAGIC_COOKIE >> 16) as u16;
            value.extend_from_slice(&xport.to_be_bytes());
            let xaddr = u32::from(*v4.ip()) ^ MAGIC_COOKIE;
            value.extend_from_slice(&xaddr.to_be_bytes());
        }
        SocketAddr::V6(v6) => {
            value.push(0x02); // IPv6
            let xport = v6.port() ^ (MAGIC_COOKIE >> 16) as u16;
            value.extend_from_slice(&xport.to_be_bytes());
            // XOR with magic cookie only (no txn_id for peer address)
            let octets = v6.ip().octets();
            let cookie = MAGIC_COOKIE.to_be_bytes();
            for i in 0..16 {
                value.push(octets[i] ^ if i < 4 { cookie[i] } else { 0 });
            }
        }
    }
    add_attr(attrs, ATTR_XOR_PEER_ADDRESS, &value);
}

fn set_lifetime_zero(msg: &mut Vec<u8>) {
    // Find or add LIFETIME attribute with value 0
    // For simplicity, just append it before the message integrity
    let lifetime_val = 0u32.to_be_bytes();
    let mut attr = Vec::new();
    add_attr(&mut attr, ATTR_LIFETIME, &lifetime_val);

    // Update message length
    let new_len = msg.len() - 20 + attr.len();
    msg[2..4].copy_from_slice(&(new_len as u16).to_be_bytes());
    msg.extend_from_slice(&attr);
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

fn receive_401_challenge(
    socket: &UdpSocket,
    expected_txn_id: &[u8; 12],
) -> Result<(String, String), String> {
    socket
        .set_read_timeout(Some(Duration::from_millis(3000)))
        .unwrap_or_default();

    let mut buf = [0u8; 1024];
    let (n, _) = socket
        .recv_from(&mut buf)
        .map_err(|e| format!("TURN 401 recv: {e}"))?;

    let data = &buf[..n];
    if data.len() < 20 {
        return Err("TURN response too short".into());
    }

    let msg_type = u16::from_be_bytes([data[0], data[1]]);
    if msg_type != ALLOCATE_ERROR {
        return Err(format!("Expected ALLOCATE error, got {msg_type:#06x}"));
    }

    if &data[8..20] != expected_txn_id {
        return Err("TURN txn ID mismatch".into());
    }

    let msg_len = u16::from_be_bytes([data[2], data[3]]) as usize;
    let attrs = &data[20..20 + msg_len.min(data.len() - 20)];

    let mut realm = String::new();
    let mut nonce = String::new();
    let mut offset = 0;

    while offset + 4 <= attrs.len() {
        let attr_type = u16::from_be_bytes([attrs[offset], attrs[offset + 1]]);
        let attr_len = u16::from_be_bytes([attrs[offset + 2], attrs[offset + 3]]) as usize;
        let value = &attrs[offset + 4..offset + 4 + attr_len.min(attrs.len() - offset - 4)];

        match attr_type {
            ATTR_REALM => {
                realm = String::from_utf8_lossy(value).to_string();
            }
            ATTR_NONCE => {
                nonce = String::from_utf8_lossy(value).to_string();
            }
            ATTR_ERROR_CODE => {
                if value.len() >= 4 {
                    let class = value[2] as u16;
                    let number = value[3] as u16;
                    let code = class * 100 + number;
                    if code != 401 {
                        return Err(format!("TURN error: {code}"));
                    }
                }
            }
            _ => {}
        }

        offset += 4 + ((attr_len + 3) & !3);
    }

    if realm.is_empty() || nonce.is_empty() {
        return Err("TURN 401 missing realm or nonce".into());
    }

    Ok((realm, nonce))
}

fn receive_allocate_response(
    socket: &UdpSocket,
    expected_txn_id: &[u8; 12],
) -> Result<TurnAllocation, String> {
    socket
        .set_read_timeout(Some(Duration::from_millis(3000)))
        .unwrap_or_default();

    let mut buf = [0u8; 1024];
    let (n, _) = socket
        .recv_from(&mut buf)
        .map_err(|e| format!("TURN allocate recv: {e}"))?;

    let data = &buf[..n];
    if data.len() < 20 {
        return Err("TURN response too short".into());
    }

    let msg_type = u16::from_be_bytes([data[0], data[1]]);
    if msg_type == ALLOCATE_ERROR {
        return Err(parse_error_message(data));
    }
    if msg_type != ALLOCATE_RESPONSE {
        return Err(format!("Unexpected TURN response: {msg_type:#06x}"));
    }

    if &data[8..20] != expected_txn_id {
        return Err("TURN txn ID mismatch".into());
    }

    let msg_len = u16::from_be_bytes([data[2], data[3]]) as usize;
    let attrs = &data[20..20 + msg_len.min(data.len() - 20)];

    let mut relay_addr: Option<SocketAddr> = None;
    let mut srflx_addr: Option<SocketAddr> = None;
    let mut lifetime = 600u32;
    let mut offset = 0;

    while offset + 4 <= attrs.len() {
        let attr_type = u16::from_be_bytes([attrs[offset], attrs[offset + 1]]);
        let attr_len = u16::from_be_bytes([attrs[offset + 2], attrs[offset + 3]]) as usize;
        let value = &attrs[offset + 4..offset + 4 + attr_len.min(attrs.len() - offset - 4)];

        match attr_type {
            ATTR_XOR_RELAYED_ADDRESS => {
                relay_addr = parse_xor_address(value, data);
            }
            ATTR_XOR_MAPPED_ADDRESS => {
                srflx_addr = parse_xor_address(value, data);
            }
            ATTR_LIFETIME => {
                if value.len() >= 4 {
                    lifetime = u32::from_be_bytes([value[0], value[1], value[2], value[3]]);
                }
            }
            _ => {}
        }

        offset += 4 + ((attr_len + 3) & !3);
    }

    Ok(TurnAllocation {
        relay_addr: relay_addr.ok_or("No XOR-RELAYED-ADDRESS in TURN response")?,
        srflx_addr: srflx_addr.ok_or("No XOR-MAPPED-ADDRESS in TURN response")?,
        lifetime_secs: lifetime,
        allocated_at: Instant::now(),
    })
}

fn receive_simple_response(
    socket: &UdpSocket,
    expected_txn_id: &[u8; 12],
    expected_type: u16,
) -> Result<(), String> {
    socket
        .set_read_timeout(Some(Duration::from_millis(3000)))
        .unwrap_or_default();

    let mut buf = [0u8; 512];
    let (n, _) = socket
        .recv_from(&mut buf)
        .map_err(|e| format!("TURN recv: {e}"))?;

    let data = &buf[..n];
    if data.len() < 20 {
        return Err("TURN response too short".into());
    }

    let msg_type = u16::from_be_bytes([data[0], data[1]]);
    if msg_type != expected_type {
        if msg_type & 0x0110 == 0x0110 {
            return Err(parse_error_message(data));
        }
        return Err(format!("Unexpected response type: {msg_type:#06x}"));
    }

    if &data[8..20] != expected_txn_id {
        return Err("TURN txn ID mismatch".into());
    }

    Ok(())
}

fn parse_xor_address(value: &[u8], msg: &[u8]) -> Option<SocketAddr> {
    if value.len() < 8 {
        return None;
    }
    let family = value[1];
    let xport = u16::from_be_bytes([value[2], value[3]]) ^ (MAGIC_COOKIE >> 16) as u16;

    match family {
        0x01 => {
            let xaddr = u32::from_be_bytes([value[4], value[5], value[6], value[7]]) ^ MAGIC_COOKIE;
            let ip = std::net::Ipv4Addr::from(xaddr);
            Some(SocketAddr::new(ip.into(), xport))
        }
        0x02 if value.len() >= 20 => {
            let mut addr = [0u8; 16];
            addr.copy_from_slice(&value[4..20]);
            let cookie = MAGIC_COOKIE.to_be_bytes();
            for i in 0..4 {
                addr[i] ^= cookie[i];
            }
            for i in 0..12 {
                addr[4 + i] ^= msg[8 + i];
            }
            let ip = std::net::Ipv6Addr::from(addr);
            Some(SocketAddr::new(ip.into(), xport))
        }
        _ => None,
    }
}

fn parse_error_message(data: &[u8]) -> String {
    if data.len() < 20 {
        return "TURN error (unknown)".into();
    }
    let msg_len = u16::from_be_bytes([data[2], data[3]]) as usize;
    let attrs = &data[20..20 + msg_len.min(data.len() - 20)];
    let mut offset = 0;

    while offset + 4 <= attrs.len() {
        let attr_type = u16::from_be_bytes([attrs[offset], attrs[offset + 1]]);
        let attr_len = u16::from_be_bytes([attrs[offset + 2], attrs[offset + 3]]) as usize;
        let value = &attrs[offset + 4..offset + 4 + attr_len.min(attrs.len() - offset - 4)];

        if attr_type == ATTR_ERROR_CODE && value.len() >= 4 {
            let class = value[2] as u16;
            let number = value[3] as u16;
            let code = class * 100 + number;
            let reason = if value.len() > 4 {
                String::from_utf8_lossy(&value[4..]).to_string()
            } else {
                String::new()
            };
            return format!("TURN error {code}: {reason}");
        }

        offset += 4 + ((attr_len + 3) & !3);
    }

    "TURN error (no error code)".into()
}

// ---------------------------------------------------------------------------
// Crypto helpers (HMAC-SHA1 for MESSAGE-INTEGRITY)
// ---------------------------------------------------------------------------

/// Compute the long-term credential key: MD5(username:realm:password).
fn compute_key(username: &str, realm: &str, password: &str) -> [u8; 16] {
    let input = format!("{username}:{realm}:{password}");
    md5_hash(input.as_bytes())
}

/// Append MESSAGE-INTEGRITY attribute (HMAC-SHA1).
fn append_message_integrity(mut msg: Vec<u8>, key: &[u8; 16]) -> Vec<u8> {
    // Update message length to include MESSAGE-INTEGRITY (24 bytes: 4 header + 20 HMAC)
    let integrity_attr_len = 24;
    let new_msg_len = (msg.len() - 20) + integrity_attr_len;
    msg[2..4].copy_from_slice(&(new_msg_len as u16).to_be_bytes());

    // Compute HMAC-SHA1 over the message as it stands
    let hmac = hmac_sha1(key, &msg);

    // Append the attribute
    msg.extend_from_slice(&ATTR_MESSAGE_INTEGRITY.to_be_bytes());
    msg.extend_from_slice(&20u16.to_be_bytes());
    msg.extend_from_slice(&hmac);

    msg
}

/// Minimal MD5 implementation (RFC 1321) for credential key computation.
/// Only used for STUN long-term credential key = MD5(user:realm:pass).
fn md5_hash(data: &[u8]) -> [u8; 16] {
    // Constants
    const S: [u32; 64] = [
        7,12,17,22, 7,12,17,22, 7,12,17,22, 7,12,17,22,
        5, 9,14,20, 5, 9,14,20, 5, 9,14,20, 5, 9,14,20,
        4,11,16,23, 4,11,16,23, 4,11,16,23, 4,11,16,23,
        6,10,15,21, 6,10,15,21, 6,10,15,21, 6,10,15,21,
    ];
    const K: [u32; 64] = [
        0xd76aa478,0xe8c7b756,0x242070db,0xc1bdceee,
        0xf57c0faf,0x4787c62a,0xa8304613,0xfd469501,
        0x698098d8,0x8b44f7af,0xffff5bb1,0x895cd7be,
        0x6b901122,0xfd987193,0xa679438e,0x49b40821,
        0xf61e2562,0xc040b340,0x265e5a51,0xe9b6c7aa,
        0xd62f105d,0x02441453,0xd8a1e681,0xe7d3fbc8,
        0x21e1cde6,0xc33707d6,0xf4d50d87,0x455a14ed,
        0xa9e3e905,0xfcefa3f8,0x676f02d9,0x8d2a4c8a,
        0xfffa3942,0x8771f681,0x6d9d6122,0xfde5380c,
        0xa4beea44,0x4bdecfa9,0xf6bb4b60,0xbebfbc70,
        0x289b7ec6,0xeaa127fa,0xd4ef3085,0x04881d05,
        0xd9d4d039,0xe6db99e5,0x1fa27cf8,0xc4ac5665,
        0xf4292244,0x432aff97,0xab9423a7,0xfc93a039,
        0x655b59c3,0x8f0ccc92,0xffeff47d,0x85845dd1,
        0x6fa87e4f,0xfe2ce6e0,0xa3014314,0x4e0811a1,
        0xf7537e82,0xbd3af235,0x2ad7d2bb,0xeb86d391,
    ];

    // Padding
    let orig_len = data.len();
    let bit_len = (orig_len as u64) * 8;
    let mut padded = data.to_vec();
    padded.push(0x80);
    while padded.len() % 64 != 56 {
        padded.push(0);
    }
    padded.extend_from_slice(&bit_len.to_le_bytes());

    let mut a0: u32 = 0x67452301;
    let mut b0: u32 = 0xefcdab89;
    let mut c0: u32 = 0x98badcfe;
    let mut d0: u32 = 0x10325476;

    for chunk in padded.chunks(64) {
        let mut m = [0u32; 16];
        for (i, w) in m.iter_mut().enumerate() {
            *w = u32::from_le_bytes([
                chunk[i*4], chunk[i*4+1], chunk[i*4+2], chunk[i*4+3],
            ]);
        }

        let (mut a, mut b, mut c, mut d) = (a0, b0, c0, d0);

        for i in 0..64 {
            let (f, g) = match i {
                0..=15 => ((b & c) | ((!b) & d), i),
                16..=31 => ((d & b) | ((!d) & c), (5*i + 1) % 16),
                32..=47 => (b ^ c ^ d, (3*i + 5) % 16),
                _ => (c ^ (b | (!d)), (7*i) % 16),
            };

            let temp = d;
            d = c;
            c = b;
            b = b.wrapping_add(
                (a.wrapping_add(f).wrapping_add(K[i]).wrapping_add(m[g]))
                    .rotate_left(S[i])
            );
            a = temp;
        }

        a0 = a0.wrapping_add(a);
        b0 = b0.wrapping_add(b);
        c0 = c0.wrapping_add(c);
        d0 = d0.wrapping_add(d);
    }

    let mut result = [0u8; 16];
    result[0..4].copy_from_slice(&a0.to_le_bytes());
    result[4..8].copy_from_slice(&b0.to_le_bytes());
    result[8..12].copy_from_slice(&c0.to_le_bytes());
    result[12..16].copy_from_slice(&d0.to_le_bytes());
    result
}

/// Minimal HMAC-SHA1 implementation for MESSAGE-INTEGRITY.
fn hmac_sha1(key: &[u8], message: &[u8]) -> [u8; 20] {
    let block_size = 64;

    let mut key_block = [0u8; 64];
    if key.len() > block_size {
        let h = sha1_hash(key);
        key_block[..20].copy_from_slice(&h);
    } else {
        key_block[..key.len()].copy_from_slice(key);
    }

    let mut ipad = [0x36u8; 64];
    let mut opad = [0x5cu8; 64];
    for i in 0..64 {
        ipad[i] ^= key_block[i];
        opad[i] ^= key_block[i];
    }

    let mut inner = Vec::with_capacity(64 + message.len());
    inner.extend_from_slice(&ipad);
    inner.extend_from_slice(message);
    let inner_hash = sha1_hash(&inner);

    let mut outer = Vec::with_capacity(64 + 20);
    outer.extend_from_slice(&opad);
    outer.extend_from_slice(&inner_hash);
    sha1_hash(&outer)
}

/// Minimal SHA-1 implementation (FIPS 180-4) for HMAC-SHA1.
fn sha1_hash(data: &[u8]) -> [u8; 20] {
    let mut h0: u32 = 0x67452301;
    let mut h1: u32 = 0xEFCDAB89;
    let mut h2: u32 = 0x98BADCFE;
    let mut h3: u32 = 0x10325476;
    let mut h4: u32 = 0xC3D2E1F0;

    let orig_len = data.len();
    let bit_len = (orig_len as u64) * 8;
    let mut padded = data.to_vec();
    padded.push(0x80);
    while padded.len() % 64 != 56 {
        padded.push(0);
    }
    padded.extend_from_slice(&bit_len.to_be_bytes());

    for chunk in padded.chunks(64) {
        let mut w = [0u32; 80];
        for i in 0..16 {
            w[i] = u32::from_be_bytes([
                chunk[i*4], chunk[i*4+1], chunk[i*4+2], chunk[i*4+3],
            ]);
        }
        for i in 16..80 {
            w[i] = (w[i-3] ^ w[i-8] ^ w[i-14] ^ w[i-16]).rotate_left(1);
        }

        let (mut a, mut b, mut c, mut d, mut e) = (h0, h1, h2, h3, h4);

        for i in 0..80 {
            let (f, k) = match i {
                0..=19 => ((b & c) | ((!b) & d), 0x5A827999u32),
                20..=39 => (b ^ c ^ d, 0x6ED9EBA1),
                40..=59 => ((b & c) | (b & d) | (c & d), 0x8F1BBCDC),
                _ => (b ^ c ^ d, 0xCA62C1D6),
            };

            let temp = a.rotate_left(5)
                .wrapping_add(f)
                .wrapping_add(e)
                .wrapping_add(k)
                .wrapping_add(w[i]);
            e = d;
            d = c;
            c = b.rotate_left(30);
            b = a;
            a = temp;
        }

        h0 = h0.wrapping_add(a);
        h1 = h1.wrapping_add(b);
        h2 = h2.wrapping_add(c);
        h3 = h3.wrapping_add(d);
        h4 = h4.wrapping_add(e);
    }

    let mut result = [0u8; 20];
    result[0..4].copy_from_slice(&h0.to_be_bytes());
    result[4..8].copy_from_slice(&h1.to_be_bytes());
    result[8..12].copy_from_slice(&h2.to_be_bytes());
    result[12..16].copy_from_slice(&h3.to_be_bytes());
    result[16..20].copy_from_slice(&h4.to_be_bytes());
    result
}

fn rand_txn_id() -> [u8; 12] {
    let mut id = [0u8; 12];
    let t = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    // Mix in address of a stack variable for per-thread uniqueness
    let stack_var: u8 = 0;
    let seed = t.as_nanos() as u64 ^ (&stack_var as *const u8 as u64);
    let mut s = seed;
    for chunk in id.chunks_mut(4) {
        s ^= s << 13;
        s ^= s >> 7;
        s ^= s << 17;
        let bytes = (s as u32).to_le_bytes();
        for (i, b) in chunk.iter_mut().enumerate() {
            *b = bytes[i % 4];
        }
    }
    id
}
