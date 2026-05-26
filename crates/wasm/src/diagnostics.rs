//! Bridge smoke-test exports. Useful for confirming the worker can
//! dispatch a call at all without exercising any feature surface.

use harmony_protocol::{Rpc, harmony_export};

#[allow(clippy::unused_async)]
#[harmony_export(domain = "diagnostics")]
pub async fn ping() -> Rpc<String> {
    Rpc::ok("pong".to_string())
}
