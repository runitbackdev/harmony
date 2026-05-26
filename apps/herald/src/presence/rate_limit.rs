use std::num::NonZeroU32;

use governor::{DefaultDirectRateLimiter, Quota};

use crate::presence::protocol::ClientFrame;

/// Per-connection abuse window: number of over-limit drops within
/// the window before we close the connection.
pub const OVER_LIMIT_BURST: u32 = 50;
/// Close grace, in ms — clients can reconnect after this many ms.
pub const CLOSE_RETRY_AFTER_MS: u64 = 60_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FrameKind {
    Heartbeat,
    UpdatePresence,
    Subscribe,
    Unsubscribe,
    Other,
}

impl FrameKind {
    pub const fn from_frame(frame: &ClientFrame) -> Self {
        match frame {
            ClientFrame::Heartbeat => Self::Heartbeat,
            ClientFrame::UpdatePresence(_) => Self::UpdatePresence,
            ClientFrame::Subscribe(_) => Self::Subscribe,
            ClientFrame::Unsubscribe(_) => Self::Unsubscribe,
            // Identify post-handshake is rejected before rate-limit applies,
            // but classify it under Other defensively.
            ClientFrame::Identify(_) | ClientFrame::ClientIdle(_) => Self::Other,
        }
    }
}

#[derive(Debug, PartialEq, Eq)]
pub enum CheckOutcome {
    /// Permitted; dispatch the frame.
    Allow,
    /// Over the per-kind limit but still under the abuse threshold.
    /// Caller should reply with `WsError` and drop the frame.
    Drop,
    /// Abuse threshold exceeded; caller must close the connection.
    Close,
}

pub struct RateLimiters {
    update_presence: DefaultDirectRateLimiter,
    subscribe: DefaultDirectRateLimiter,
    unsubscribe: DefaultDirectRateLimiter,
    other: DefaultDirectRateLimiter,
    over_limit: DefaultDirectRateLimiter,
}

impl RateLimiters {
    pub fn new() -> Self {
        Self {
            update_presence: per_second(5, 10),
            subscribe: per_second(2, 5),
            unsubscribe: per_second(5, 10),
            other: per_second(10, 10),
            over_limit: per_minute(OVER_LIMIT_BURST),
        }
    }

    pub fn check(&self, kind: FrameKind) -> CheckOutcome {
        let limiter = match kind {
            FrameKind::Heartbeat => return CheckOutcome::Allow,
            FrameKind::UpdatePresence => &self.update_presence,
            FrameKind::Subscribe => &self.subscribe,
            FrameKind::Unsubscribe => &self.unsubscribe,
            FrameKind::Other => &self.other,
        };

        if limiter.check().is_ok() {
            return CheckOutcome::Allow;
        }

        // Over the per-kind limit. Consume one slot in the abuse window.
        // If the abuse window is exhausted, the caller must close.
        match self.over_limit.check() {
            Ok(()) => CheckOutcome::Drop,
            Err(_) => CheckOutcome::Close,
        }
    }
}

impl Default for RateLimiters {
    fn default() -> Self {
        Self::new()
    }
}

fn per_second(rate: u32, burst: u32) -> DefaultDirectRateLimiter {
    let quota = Quota::per_second(nz(rate)).allow_burst(nz(burst));
    DefaultDirectRateLimiter::direct(quota)
}

fn per_minute(n: u32) -> DefaultDirectRateLimiter {
    DefaultDirectRateLimiter::direct(Quota::per_minute(nz(n)))
}

const fn nz(n: u32) -> NonZeroU32 {
    match NonZeroU32::new(n) {
        Some(v) => v,
        None => panic!("rate-limit constants are non-zero"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn heartbeat_never_consumes() {
        let r = RateLimiters::new();
        for _ in 0..10_000 {
            assert_eq!(r.check(FrameKind::Heartbeat), CheckOutcome::Allow);
        }
    }

    #[test]
    fn subscribe_burst_then_drop() {
        let r = RateLimiters::new();
        // burst 5
        for _ in 0..5 {
            assert_eq!(r.check(FrameKind::Subscribe), CheckOutcome::Allow);
        }
        // 6th hit denied — still under abuse window
        assert_eq!(r.check(FrameKind::Subscribe), CheckOutcome::Drop);
    }

    #[test]
    fn update_presence_burst_is_ten() {
        let r = RateLimiters::new();
        for _ in 0..10 {
            assert_eq!(r.check(FrameKind::UpdatePresence), CheckOutcome::Allow);
        }
        assert_eq!(r.check(FrameKind::UpdatePresence), CheckOutcome::Drop);
    }

    #[test]
    fn unsubscribe_burst_is_ten() {
        let r = RateLimiters::new();
        for _ in 0..10 {
            assert_eq!(r.check(FrameKind::Unsubscribe), CheckOutcome::Allow);
        }
        assert_eq!(r.check(FrameKind::Unsubscribe), CheckOutcome::Drop);
    }

    #[test]
    fn other_burst_is_ten() {
        let r = RateLimiters::new();
        for _ in 0..10 {
            assert_eq!(r.check(FrameKind::Other), CheckOutcome::Allow);
        }
        assert_eq!(r.check(FrameKind::Other), CheckOutcome::Drop);
    }

    #[test]
    fn abuse_window_closes_after_threshold() {
        let r = RateLimiters::new();
        let mut allows = 0;
        let mut drops = 0;
        let mut closes = 0;
        for _ in 0..200 {
            match r.check(FrameKind::Subscribe) {
                CheckOutcome::Allow => allows += 1,
                CheckOutcome::Drop => drops += 1,
                CheckOutcome::Close => {
                    closes += 1;
                    break;
                }
            }
        }
        assert_eq!(allows, 5, "Subscribe burst is 5");
        assert_eq!(
            drops, OVER_LIMIT_BURST as usize,
            "abuse window holds 50 hits"
        );
        assert_eq!(closes, 1, "51st over-limit hit triggers close");
    }

    #[test]
    fn abuse_window_is_shared_across_kinds() {
        let r = RateLimiters::new();
        // Exhaust the subscribe burst
        for _ in 0..5 {
            assert_eq!(r.check(FrameKind::Subscribe), CheckOutcome::Allow);
        }
        // Take 25 over-limit drops on Subscribe.
        for _ in 0..25 {
            assert_eq!(r.check(FrameKind::Subscribe), CheckOutcome::Drop);
        }
        // Exhaust unsubscribe burst.
        for _ in 0..10 {
            assert_eq!(r.check(FrameKind::Unsubscribe), CheckOutcome::Allow);
        }
        // 25 more over-limit drops on Unsubscribe = 50 total → next is Close.
        for _ in 0..25 {
            assert_eq!(r.check(FrameKind::Unsubscribe), CheckOutcome::Drop);
        }
        assert_eq!(r.check(FrameKind::Unsubscribe), CheckOutcome::Close);
    }
}
