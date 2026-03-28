//! Bandwidth estimation with REMB (Receiver Estimated Maximum Bitrate).
//!
//! Tracks incoming REMB feedback from the receiver and maintains a smoothed
//! estimate of available bandwidth. The encoder uses this to adapt bitrate,
//! resolution, and frame rate in real-time.
//!
//! Algorithm: exponentially weighted moving average (EWMA) of REMB values,
//! with conservative ramp-up and fast ramp-down for congestion response.

use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Instant;

/// Adaptive quality parameters derived from bandwidth estimate.
#[derive(Debug, Clone, Copy)]
pub struct AdaptiveQuality {
    /// Target bitrate in bits per second.
    pub bitrate_bps: u32,
    /// Target frame rate.
    pub fps: u32,
    /// Target resolution width.
    pub width: u32,
    /// Target resolution height.
    pub height: u32,
    /// Quality tier (for logging/diagnostics).
    pub tier: QualityTier,
}

/// Discrete quality tiers for predictable behavior.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum QualityTier {
    /// 1080p60 @ 5 Mbps — strong connection
    High,
    /// 1080p30 @ 3 Mbps — moderate connection
    Medium,
    /// 720p30 @ 1.5 Mbps — constrained
    Low,
    /// 480p15 @ 500 Kbps — very poor connection
    Minimum,
}

impl QualityTier {
    fn params(self) -> (u32, u32, u32, u32) {
        // (bitrate_bps, fps, width, height)
        match self {
            QualityTier::High    => (5_000_000, 60, 1920, 1080),
            QualityTier::Medium  => (3_000_000, 30, 1920, 1080),
            QualityTier::Low     => (1_500_000, 30, 1280, 720),
            QualityTier::Minimum => (500_000,   15, 854,  480),
        }
    }

    fn from_bitrate(bps: u32) -> Self {
        if bps >= 4_500_000 {
            QualityTier::High
        } else if bps >= 2_500_000 {
            QualityTier::Medium
        } else if bps >= 1_000_000 {
            QualityTier::Low
        } else {
            QualityTier::Minimum
        }
    }
}

/// Thread-safe bandwidth estimator.
/// The transport thread updates it with REMB values;
/// the capture/encoder thread reads the current quality target.
pub struct BandwidthEstimator {
    inner: Arc<BweInner>,
}

struct BweInner {
    /// Current smoothed estimate in bps.
    estimate_bps: AtomicU32,
    /// Most recent REMB value received.
    last_remb_bps: AtomicU32,
    /// Number of REMB reports received.
    remb_count: AtomicU64,
    /// Timestamp of last REMB (ms since epoch, for staleness detection).
    last_remb_ms: AtomicU64,
    /// Current quality tier (atomic u8 cast from QualityTier).
    current_tier: AtomicU32,
}

impl BandwidthEstimator {
    /// Create a new estimator with default starting bandwidth.
    pub fn new() -> Self {
        let initial = QualityTier::Medium;
        let (bitrate, _, _, _) = initial.params();
        Self {
            inner: Arc::new(BweInner {
                estimate_bps: AtomicU32::new(bitrate),
                last_remb_bps: AtomicU32::new(0),
                remb_count: AtomicU64::new(0),
                last_remb_ms: AtomicU64::new(0),
                current_tier: AtomicU32::new(initial as u32),
            }),
        }
    }

    /// Get a thread-safe handle to share with the transport thread.
    pub fn handle(&self) -> BweHandle {
        BweHandle {
            inner: self.inner.clone(),
        }
    }

    /// Get the current adaptive quality parameters.
    /// Called by the encoder/capture pipeline.
    pub fn current_quality(&self) -> AdaptiveQuality {
        let tier_val = self.inner.current_tier.load(Ordering::Relaxed);
        let tier = match tier_val {
            0 => QualityTier::High,
            1 => QualityTier::Medium,
            2 => QualityTier::Low,
            _ => QualityTier::Minimum,
        };
        let (bitrate_bps, fps, width, height) = tier.params();
        AdaptiveQuality {
            bitrate_bps,
            fps,
            width,
            height,
            tier,
        }
    }

    /// Get the raw smoothed estimate in bps.
    pub fn estimate_bps(&self) -> u32 {
        self.inner.estimate_bps.load(Ordering::Relaxed)
    }

    /// Get the number of REMB reports received.
    pub fn remb_count(&self) -> u64 {
        self.inner.remb_count.load(Ordering::Relaxed)
    }

    /// Check if we've received any REMB recently (within last 5 seconds).
    pub fn has_recent_remb(&self) -> bool {
        let last_ms = self.inner.last_remb_ms.load(Ordering::Relaxed);
        if last_ms == 0 {
            return false;
        }
        let now_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;
        now_ms.saturating_sub(last_ms) < 5000
    }
}

impl Default for BandwidthEstimator {
    fn default() -> Self {
        Self::new()
    }
}

/// Thread-safe handle for the transport thread to report REMB values.
#[derive(Clone)]
pub struct BweHandle {
    inner: Arc<BweInner>,
}

impl BweHandle {
    /// Report a REMB value from the receiver (in bits per second).
    /// This is called from the WebRTC event loop when we get REMB feedback.
    pub fn report_remb(&self, remb_bps: u32) {
        let count = self.inner.remb_count.fetch_add(1, Ordering::Relaxed);
        self.inner.last_remb_bps.store(remb_bps, Ordering::Relaxed);

        let now_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;
        self.inner.last_remb_ms.store(now_ms, Ordering::Relaxed);

        // EWMA smoothing
        let prev = self.inner.estimate_bps.load(Ordering::Relaxed);

        let alpha = if remb_bps < prev {
            // Fast ramp-down: respond quickly to congestion (alpha=0.7)
            0.7_f32
        } else if count < 3 {
            // Initial: trust the measurement more
            0.5
        } else {
            // Conservative ramp-up: slow increase (alpha=0.15)
            0.15
        };

        let smoothed = (alpha * remb_bps as f32 + (1.0 - alpha) * prev as f32) as u32;
        self.inner.estimate_bps.store(smoothed, Ordering::Relaxed);

        // Update quality tier
        let new_tier = QualityTier::from_bitrate(smoothed);
        let old_tier_val = self.inner.current_tier.load(Ordering::Relaxed);
        let new_tier_val = new_tier as u32;

        if new_tier_val != old_tier_val {
            // Apply hysteresis: only change tier if we've been at the new level
            // for at least 3 consecutive REMB reports in the same direction.
            // For simplicity, we allow immediate downgrade but delay upgrade.
            if new_tier_val > old_tier_val {
                // Downgrade (worse quality) — apply immediately
                self.inner.current_tier.store(new_tier_val, Ordering::Relaxed);
                log::info!(
                    "BWE: quality downgrade → {:?} (est={} kbps, remb={} kbps)",
                    new_tier,
                    smoothed / 1000,
                    remb_bps / 1000,
                );
            } else {
                // Upgrade (better quality) — only if estimate is well above threshold
                let (tier_bps, _, _, _) = new_tier.params();
                if smoothed > tier_bps * 120 / 100 {
                    // 20% headroom above tier bitrate
                    self.inner.current_tier.store(new_tier_val, Ordering::Relaxed);
                    log::info!(
                        "BWE: quality upgrade → {:?} (est={} kbps, remb={} kbps)",
                        new_tier,
                        smoothed / 1000,
                        remb_bps / 1000,
                    );
                }
            }
        }
    }

    /// Report a packet loss event. Reduces estimate by 20%.
    pub fn report_loss(&self) {
        let prev = self.inner.estimate_bps.load(Ordering::Relaxed);
        let reduced = prev * 80 / 100;
        self.inner.estimate_bps.store(reduced.max(300_000), Ordering::Relaxed);

        let new_tier = QualityTier::from_bitrate(reduced);
        self.inner.current_tier.store(new_tier as u32, Ordering::Relaxed);

        log::debug!("BWE: loss detected, estimate reduced to {} kbps", reduced / 1000);
    }
}
