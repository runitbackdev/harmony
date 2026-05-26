use std::net::SocketAddr;
use std::time::Duration;

use axum::body::Body;
use axum::extract::ConnectInfo;
use axum::http::Request;
use governor::middleware::NoOpMiddleware;
use tower_governor::governor::GovernorConfigBuilder;
use tower_governor::key_extractor::KeyExtractor;
use tower_governor::{GovernorError, GovernorLayer};

use crate::auth::bearer_from_headers;

type Layer = GovernorLayer<TokenOrIp, NoOpMiddleware, Body>;

#[derive(Debug, Clone)]
pub struct TokenOrIp;

impl KeyExtractor for TokenOrIp {
    type Key = String;

    fn extract<B>(&self, req: &Request<B>) -> Result<Self::Key, GovernorError> {
        if let Some(token) = bearer_from_headers(req.headers()) {
            return Ok(format!("tok:{token}"));
        }

        if let Some(forwarded) = req
            .headers()
            .get("x-forwarded-for")
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.split(',').next())
            .map(str::trim)
            .filter(|s| !s.is_empty())
        {
            return Ok(format!("ip:{forwarded}"));
        }

        if let Some(ConnectInfo(addr)) = req.extensions().get::<ConnectInfo<SocketAddr>>() {
            return Ok(format!("ip:{}", addr.ip()));
        }

        Err(GovernorError::UnableToExtractKey)
    }
}

fn build_layer(per_minute: u32, burst: u32) -> Layer {
    let period_ms = (60_000 / u64::from(per_minute)).max(1);
    let cfg = GovernorConfigBuilder::default()
        .key_extractor(TokenOrIp)
        .period(Duration::from_millis(period_ms))
        .burst_size(burst)
        .finish()
        .expect("valid governor config");
    GovernorLayer::new(cfg)
}

pub fn tight() -> Layer {
    build_layer(5, 5)
}

pub fn strict() -> Layer {
    build_layer(10, 10)
}

pub fn relaxed() -> Layer {
    build_layer(60, 60)
}

pub fn default_tier() -> Layer {
    build_layer(120, 120)
}
