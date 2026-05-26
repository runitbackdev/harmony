use axum::http::{header, HeaderMap};

pub mod hs_token;
pub mod power_levels;
pub mod user_token;

pub use user_token::TokenCache;

pub fn bearer_from_headers(headers: &HeaderMap) -> Option<&str> {
    headers
        .get(header::AUTHORIZATION)?
        .to_str()
        .ok()?
        .strip_prefix("Bearer ")
}
