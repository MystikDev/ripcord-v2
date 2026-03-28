/// H.264 NAL unit types relevant for RTP packetization.
#[derive(Debug, Clone, Copy, PartialEq)]
#[repr(u8)]
pub enum NalType {
    Slice = 1,
    Idr = 5,
    Sei = 6,
    Sps = 7,
    Pps = 8,
    StapA = 24,
    FuA = 28,
}

/// Maximum RTP payload size (MTU - IP/UDP/RTP headers).
const MAX_PAYLOAD: usize = 1200;

/// An RTP-ready packet produced by the packetizer.
pub struct RtpPayload {
    pub data: Vec<u8>,
    pub marker: bool, // Last packet of a frame
}

/// Packetize an H.264 access unit (frame) into RTP payloads.
/// Uses FU-A fragmentation for NAL units larger than MAX_PAYLOAD.
pub fn packetize_h264(nal_units: &[&[u8]]) -> Vec<RtpPayload> {
    let mut payloads = Vec::new();
    let total_nals = nal_units.len();

    for (nal_idx, nal) in nal_units.iter().enumerate() {
        let is_last_nal = nal_idx == total_nals - 1;

        if nal.len() <= MAX_PAYLOAD {
            // Single NAL unit packet — fits in one RTP payload
            payloads.push(RtpPayload {
                data: nal.to_vec(),
                marker: is_last_nal,
            });
        } else {
            // FU-A fragmentation
            let nal_header = nal[0];
            let nri = nal_header & 0x60;       // NRI bits
            let nal_type = nal_header & 0x1F;   // NAL unit type

            let payload_data = &nal[1..]; // Skip original NAL header
            let chunks: Vec<&[u8]> = payload_data
                .chunks(MAX_PAYLOAD - 2) // 2 bytes for FU indicator + FU header
                .collect();
            let num_chunks = chunks.len();

            for (chunk_idx, chunk) in chunks.iter().enumerate() {
                let is_start = chunk_idx == 0;
                let is_end = chunk_idx == num_chunks - 1;

                // FU indicator: F=0, NRI from original, Type=28 (FU-A)
                let fu_indicator = nri | NalType::FuA as u8;

                // FU header: S, E, R=0, Type from original
                let mut fu_header = nal_type;
                if is_start {
                    fu_header |= 0x80; // Start bit
                }
                if is_end {
                    fu_header |= 0x40; // End bit
                }

                let mut data = Vec::with_capacity(2 + chunk.len());
                data.push(fu_indicator);
                data.push(fu_header);
                data.extend_from_slice(chunk);

                payloads.push(RtpPayload {
                    data,
                    marker: is_last_nal && is_end,
                });
            }
        }
    }

    payloads
}

/// Extract NAL units from an Annex B bitstream (start code delimited).
/// Returns slices pointing into the input buffer.
pub fn find_nal_units(data: &[u8]) -> Vec<&[u8]> {
    let mut nals = Vec::new();
    let mut i = 0;

    while i < data.len() {
        // Find start code: 0x000001 or 0x00000001
        if i + 2 < data.len() && data[i] == 0 && data[i + 1] == 0 {
            let (start_code_len, found) = if i + 3 < data.len()
                && data[i + 2] == 0
                && data[i + 3] == 1
            {
                (4, true)
            } else if data[i + 2] == 1 {
                (3, true)
            } else {
                (0, false)
            };

            if found {
                let nal_start = i + start_code_len;

                // Find the next start code to determine NAL end
                let mut nal_end = data.len();
                let mut j = nal_start + 1;
                while j + 2 < data.len() {
                    if data[j] == 0 && data[j + 1] == 0 {
                        if (j + 3 < data.len() && data[j + 2] == 0 && data[j + 3] == 1)
                            || data[j + 2] == 1
                        {
                            nal_end = j;
                            break;
                        }
                    }
                    j += 1;
                }

                if nal_start < nal_end {
                    nals.push(&data[nal_start..nal_end]);
                }

                i = nal_end;
                continue;
            }
        }

        i += 1;
    }

    nals
}
