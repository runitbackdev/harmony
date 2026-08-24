//! Mobile binding crate. Re-exports `harmony-protocol` (with `feature =
//! "mobile"`) so the `#[uniffi::export]`-attributed wrappers emitted by
//! `#[harmony_export]` are reachable from Swift/Kotlin via uniffi-generated
//! bindings. Uses uniffi proc-macro mode (no UDL).

pub use harmony_protocol::*;

uniffi::setup_scaffolding!();

/// Smoke-test export: proves the uniffi scaffolding, the JSI bridge, and the
/// native library all loaded. Not part of the wire protocol.
#[uniffi::export]
pub fn harmony_ping() -> String {
    "pong".to_owned()
}

include!("exports.generated.rs");
