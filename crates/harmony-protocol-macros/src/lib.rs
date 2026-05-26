//! Proc macros for the Harmony bridge.

mod export;
mod ts;

use proc_macro::TokenStream;

/// Marks a function as a Harmony bridge export.
///
/// Detects the kind from the return type (`Rpc<T>`, `Command`, or
/// `Subscription<I, C>`), derives the wire dispatch name from the source
/// file basename + function name, emits the wasm-bindgen export, and
/// writes a metadata entry into the `__harmony_protocol` custom WebAssembly
/// section.
#[proc_macro_attribute]
pub fn harmony_export(args: TokenStream, input: TokenStream) -> TokenStream {
    export::expand(args, input)
}
