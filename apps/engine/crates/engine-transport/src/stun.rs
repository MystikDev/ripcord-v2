//! Lightweight STUN client for server-reflexive candidate discovery.
//!
//! Implements RFC 5389 Binding request/response to discover the public
//! IP:port as seen by the STUN server (NAT-mapped address).

use std::net::{SocketAddr, UdpSocket};
use std::time::Duration;

/// STUN message type constants.
const BINDING_REQUEST: u16 = 0x0001;
const BINDING_RESPONSE: u16 = 0x0101;
const MAGIC_COOKIE: u32 = 0x2112A442;

/// STUN attribute types.
const ATTR_XOR_MAPPED_ADDRESS: u16 = 0x0020;
const ATTR_MAPPED_ADDRESS: u16 = 0x0001;

/// Result of a STUN binding request.
#[derive(Debug, Clone)]
pub struct StunResult {
    /// Server-reflexive address (public IP:port as seen by server).
    pub srflx_addr: SocketAddr,
}

/// Send a STUN Binding request and parse the response to discover our
/// server-reflexive (public) address.
///
/// `socket` — the UDP socket to send from (same one used for ICE).
/// `server` — STUN server address (e.g. "stun.l.google.com:19302").
pub fn stun_binding(socket: &UdpSocket, server: SocketAddr) -> Result<StunResult, String> {
    let txn_id: [u8; 12] = rand_txn_id();
    let request = build_binding_request(&txn_id);

    // Send with retransmit (RFC 5389 §7.2.1: 500ms, 1s, 2s)
    let timeouts = [500, 1000, 2000];

    for timeout_ms in timeouts {
        socket
            .send_to(&request, server)
            .map_err(|e| format!("STUN send: {e}"))?;

        socket
            .set_read_timeout(Some(Duration::from_millis(timeout_ms)))
            .unwrap_or_default();

        let mut buf = [0u8; 512];
        match socket.recv_from(&mut buf) {
            Ok((n, _from)) => {
                if let Some(result) = parse_binding_response(&buf[..n], &txn_id) {
                    return Ok(result);
                }
                // Wrong response, keep trying
            }
            Err(e) => {
                use std::io::ErrorKind;
                if e.kind() != ErrorKind::WouldBlock && e.kind() != ErrorKind::TimedOut {
                    return Err(format!("STUN recv: {e}"));
                }
                // Timeout, retransmit
            }
        }
    }

    Err("STUN binding timed out after 3 attempts".into())
}

/// Build a STUN Binding Request message.
fn build_binding_request(txn_id: &[u8; 12]) -> Vec<u8> {
    let mut msg = Vec::with_capacity(20);

    // Message Type: Binding Request (0x0001)
    msg.extend_from_slice(&BINDING_REQUEST.to_be_bytes());
    // Message Length: 0 (no attributes)
    msg.extend_from_slice(&0u16.to_be_bytes());
    // Magic Cookie
    msg.extend_from_slice(&MAGIC_COOKIE.to_be_bytes());
    // Transaction ID (12 bytes)
    msg.extend_from_slice(txn_id);

    msg
}

/// Parse a STUN Binding Response and extract the mapped address.
fn parse_binding_response(data: &[u8], expected_txn_id: &[u8; 12]) -> Option<StunResult> {
    if data.len() < 20 {
        return None;
    }

    let msg_type = u16::from_be_bytes([data[0], data[1]]);
    if msg_type != BINDING_RESPONSE {
        return None;
    }

    let msg_len = u16::from_be_bytes([data[2], data[3]]) as usize;
    let cookie = u32::from_be_bytes([data[4], data[5], data[6], data[7]]);
    if cookie != MAGIC_COOKIE {
        return None;
    }

    // Verify transaction ID
    if &data[8..20] != expected_txn_id {
        return None;
    }

    // Parse attributes
    let attrs = &data[20..20 + msg_len.min(data.len() - 20)];
    let mut offset = 0;

    while offset + 4 <= attrs.len() {
        let attr_type = u16::from_be_bytes([attrs[offset], attrs[offset + 1]]);
        let attr_len = u16::from_be_bytes([attrs[offset + 2], attrs[offset + 3]]) as usize;
        let attr_data = &attrs[offset + 4..];

        if attr_data.len() < attr_len {
            break;
        }

        match attr_type {
            ATTR_XOR_MAPPED_ADDRESS => {
                if let Some(addr) = parse_xor_mapped_address(&attr_data[..attr_len], data) {
                    return Some(StunResult { srflx_addr: addr });
                }
            }
            ATTR_MAPPED_ADDRESS => {
                if let Some(addr) = parse_mapped_address(&attr_data[..attr_len]) {
                    return Some(StunResult { srflx_addr: addr });
                }
            }
            _ => {}
        }

        // Attributes are padded to 4-byte boundaries
        offset += 4 + ((attr_len + 3) & !3);
    }

    None
}

/// Parse XOR-MAPPED-ADDRESS attribute (RFC 5389 §15.2).
fn parse_xor_mapped_address(data: &[u8], msg: &[u8]) -> Option<SocketAddr> {
    if data.len() < 8 {
        return None;
    }

    let family = data[1];
    let xport = u16::from_be_bytes([data[2], data[3]]) ^ (MAGIC_COOKIE >> 16) as u16;

    match family {
        0x01 => {
            // IPv4
            let xaddr = u32::from_be_bytes([data[4], data[5], data[6], data[7]]) ^ MAGIC_COOKIE;
            let ip = std::net::Ipv4Addr::from(xaddr);
            Some(SocketAddr::new(ip.into(), xport))
        }
        0x02 => {
            // IPv6
            if data.len() < 20 {
                return None;
            }
            let mut addr_bytes = [0u8; 16];
            addr_bytes.copy_from_slice(&data[4..20]);
            // XOR with magic cookie + transaction ID
            let cookie_bytes = MAGIC_COOKIE.to_be_bytes();
            for i in 0..4 {
                addr_bytes[i] ^= cookie_bytes[i];
            }
            for i in 0..12 {
                addr_bytes[4 + i] ^= msg[8 + i]; // XOR with txn ID
            }
            let ip = std::net::Ipv6Addr::from(addr_bytes);
            Some(SocketAddr::new(ip.into(), xport))
        }
        _ => None,
    }
}

/// Parse MAPPED-ADDRESS attribute (RFC 5389 §15.1) — fallback for older servers.
fn parse_mapped_address(data: &[u8]) -> Option<SocketAddr> {
    if data.len() < 8 {
        return None;
    }

    let family = data[1];
    let port = u16::from_be_bytes([data[2], data[3]]);

    match family {
        0x01 => {
            let ip = std::net::Ipv4Addr::new(data[4], data[5], data[6], data[7]);
            Some(SocketAddr::new(ip.into(), port))
        }
        0x02 if data.len() >= 20 => {
            let mut addr_bytes = [0u8; 16];
            addr_bytes.copy_from_slice(&data[4..20]);
            let ip = std::net::Ipv6Addr::from(addr_bytes);
            Some(SocketAddr::new(ip.into(), port))
        }
        _ => None,
    }
}

/// Generate a random 12-byte transaction ID.
fn rand_txn_id() -> [u8; 12] {
    let mut id = [0u8; 12];
    // Use system time + thread ID as entropy (no extra dependency needed)
    let t = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    let seed = t.as_nanos() as u64;
    // Simple xorshift for filling 12 bytes
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
