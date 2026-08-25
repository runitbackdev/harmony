//! Harmony protocol crate: wire types, wrappers, error enum, and the
//! `#[harmony]` / `#[harmony_export]` macros that tie them together.
//!
//! Pure logic + per-target ABI emissions. Each binding feature (`web`,
//! `desktop`, `mobile`) pulls its toolchain-specific deps (wasm-bindgen,
//! tauri, uniffi) and activates the matching ABI emission. The manifest
//! carries `crate-type = ["cdylib", "rlib"]` so `wasm-pack` can build this
//! crate directly.

#![cfg_attr(target_arch = "wasm32", allow(clippy::future_not_send))]

extern crate self as harmony_protocol;

mod error;
mod shared;
#[cfg(all(feature = "web", target_arch = "wasm32"))]
mod wasm_init;
mod wrappers;

pub(crate) use shared::Shared;

pub mod auth;
pub mod client;
#[cfg(feature = "desktop")]
pub mod desktop;
pub mod diagnostics;
pub mod diff;
pub mod internal_error;
pub mod lifecycle;
pub mod media;
pub mod rooms;
pub mod spaces;
pub mod sync;
pub mod timeline;

pub use error::HarmonyError;
pub use harmony_protocol_macros::{harmony, harmony_export};
pub use wrappers::{Bytes, Command, Opaque, Rpc, Subscription};

#[cfg(feature = "mobile")]
uniffi::setup_scaffolding!();

// --- Inventory entry types -------------------------------------------------

/// Metadata for a single `#[harmony_export]` function. Emitted into the
/// `inventory` registry at compile time so `harmony-cli` can iterate every
/// exported function and produce TS bindings.
pub struct HarmonyEntry {
    pub wire: &'static str,
    pub js: &'static str,
    /// Rust module path the exported fn lives in (captured via `module_path!()`).
    /// Lets desktop codegen address the `#[tauri::command]` wrapper fn that
    /// shares this module — wire domain ≠ module in general (e.g.
    /// `domain = "members"` lives in `rooms.rs`).
    pub module: &'static str,
    pub kind: EntryKind,
    pub snapshot_for: Option<&'static str>,
    /// Fields carrying `Bytes`, declared via `#[harmony_export(bytes_in
    /// = "...")]` / `bytes_out`. On desktop these leave the JSON lane: the
    /// inbound field rides the raw request body, the outbound one a
    /// `Channel<Response>`.
    pub bytes_in: Option<&'static str>,
    pub bytes_out: Option<&'static str>,
    /// Builds the entry's wire types, registering every transitively
    /// referenced type into `Types` as a side effect.
    pub sig: fn(&mut specta::Types) -> Signature,
}

#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum EntryKind {
    Rpc,
    Command,
    Subscription,
}

/// Resolved wire types for one entry. A `None` slot renders as `void`:
/// an absent argument, a `Command`'s missing output, or a unit type.
#[derive(Default)]
pub struct Signature {
    pub input: Option<specta::datatype::DataType>,
    pub output: Option<specta::datatype::DataType>,
    pub initial: Option<specta::datatype::DataType>,
    pub chunk: Option<specta::datatype::DataType>,
}

inventory::collect!(HarmonyEntry);
