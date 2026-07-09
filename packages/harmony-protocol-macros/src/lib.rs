//! Proc macros for the Harmony bridge.

mod export;
mod harmony;

use proc_macro::TokenStream;

/// Marks a function as a Harmony bridge export.
///
/// Detects the kind from the return type (`Rpc<T>`, `Command`, or
/// `Subscription<I, C>`), derives the wire dispatch name from the
/// `domain` / `action` arguments, and registers a `HarmonyEntry` via
/// `inventory::submit!`. On `wasm32 + feature = "web"` the function
/// also gets a `#[wasm_bindgen]` attribute via `cfg_attr`.
#[proc_macro_attribute]
pub fn harmony_export(args: TokenStream, input: TokenStream) -> TokenStream {
    export::expand(args, input)
}

/// Marks a struct or enum as a Harmony wire type.
///
/// Injects `#[derive(serde::Serialize, serde::Deserialize, specta::Type)]`
/// onto the input. On `wasm32 + feature = "web"` it additionally emits
/// `IntoWasmAbi` / `FromWasmAbi` / `WasmDescribe` impls that route through
/// `serde_wasm_bindgen`, plus a phantom extern type so generated `.d.ts`
/// references the wire type by its original Rust name.
#[proc_macro_attribute]
pub fn harmony(args: TokenStream, input: TokenStream) -> TokenStream {
    harmony::expand(args, input)
}
