//! Mobile binding crate. Re-exports `harmony-protocol` (with `feature =
//! "mobile"`) so the `#[uniffi::export]`-attributed wrappers emitted by
//! `#[harmony_export]` are reachable from Swift/Kotlin via uniffi-generated
//! bindings. Uses uniffi proc-macro mode (no UDL).

pub use harmony_protocol::*;

uniffi::setup_scaffolding!();

include!("exports.generated.rs");
