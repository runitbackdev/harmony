//! Desktop binding crate. Re-exports `harmony-protocol` (with `feature =
//! "desktop"`) so the `#[tauri::command]`-attributed wrappers emitted by
//! `#[harmony_export]` are reachable from the Tauri shell.
//!
//! The generated handler list (`tauri::generate_handler![...]`) is written
//! by `harmony codegen` and included below. Until codegen emits the file,
//! the include sits empty.

pub use harmony_protocol::*;

include!("handlers.generated.rs");
