//! Harmony protocol crate: wire types, wrappers, error enum, and the
//! `#[harmony]` / `#[harmony_export]` macros that tie them together.
//!
//! Pure logic + per-target ABI emissions. Each binding feature (`web`,
//! `desktop`, `mobile`) pulls its toolchain-specific deps (wasm-bindgen,
//! tauri, uniffi) and activates the matching macro emission. Binding
//! wrapper crates (`harmony-bindings-{web,desktop,mobile}`) own
//! crate-type + bootstrap.

#![cfg_attr(target_arch = "wasm32", allow(clippy::future_not_send))]

extern crate self as harmony_protocol;

mod error;
mod shared;
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
    pub types: HarmonyTypes,
}

#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum EntryKind {
    Rpc,
    Command,
    Subscription,
}

/// Per-kind type metadata for a Harmony entry.
///
/// `register` walks the `specta::Types` collection so all transitive types
/// end up in the generated `.ts` file; the `*_ts` fields are the printable
/// TypeScript references used when emitting the `maps.generated.ts`
/// dispatcher table.
pub enum HarmonyTypes {
    Rpc {
        input_ts: &'static str,
        output_ts: &'static str,
        register: fn(&mut specta::Types),
    },
    Command {
        input_ts: &'static str,
        register: fn(&mut specta::Types),
    },
    Subscription {
        input_ts: &'static str,
        initial_ts: &'static str,
        chunk_ts: &'static str,
        register: fn(&mut specta::Types),
    },
}

inventory::collect!(HarmonyEntry);
