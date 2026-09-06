//! `harmony codegen` entry point.
//!
//! Walks the `inventory` registry populated by `#[harmony_export]` and
//! produces every output a binding consumer needs:
//!
//! - `packages/core/lib/protocol/types.generated.d.ts` — specta-emitted
//!   wire types (shared by every target).
//! - `packages/core/lib/protocol/maps.generated.ts` — transport-agnostic
//!   `Rpc/Command/Subscription` typing tables (shared).
//! - Per-target dispatch + handler outputs, delegated to:
//!   - [`web`] — `cargo rustc` cdylib + `wasm-bindgen`, `wasm.d.ts`
//!     extension, web dispatch.
//!   - [`desktop`] — Tauri dispatch + handler list macro.
//!   - [`mobile`] — placeholder dispatch stub.
//!
//! The orchestrator owns nothing per-target; each submodule owns its
//! file paths and emission shape.

mod bytes;
mod desktop;
mod dispatch;
mod entries;
mod maps;
mod mobile;
mod web;

use anyhow::{Context, Result, anyhow, bail};
use harmony_protocol::{HarmonyEntry, HarmonyError};
use specta::Types;
use specta_typescript::Typescript;

use crate::util::repo::workspace_root;

const TYPES_OUTPUT_PATH: &str = "packages/core/lib/protocol/types.generated.d.ts";
const MAPS_OUTPUT_PATH: &str = "packages/core/lib/protocol/maps.generated.ts";

pub fn run(release: bool) -> Result<()> {
    let root = workspace_root()?;

    // 1. Build the specta type universe from inventory. `HarmonyError`
    //    isn't transitively registered through `Rpc<T>`'s hand-rolled
    //    serde impl, so seed it explicitly.
    let mut types = Types::default();
    types.register_mut::<HarmonyError>();
    let bytes_dt = <harmony_protocol::Bytes as specta::Type>::definition(&mut types);
    let sigs: Vec<_> = inventory::iter::<HarmonyEntry>
        .into_iter()
        .map(|entry| {
            let sig = (entry.sig)(&mut types);
            (entry, sig)
        })
        .collect();

    // 2. Apply serde rules (rename_all, tag/content, etc.) and resolve
    //    into a printable TypeScript module.
    let resolved =
        specta_serde::apply(types).map_err(|e| anyhow!("specta-serde apply failed: {e}"))?;
    let ts = Typescript::default();
    let types_source = ts
        .export(&resolved)
        .map_err(|e| anyhow!("specta-typescript export failed: {e}"))?;

    // 3. Shared outputs (types + maps) — consumed by every target.
    let types_path = root.join(TYPES_OUTPUT_PATH);
    let maps_path = root.join(MAPS_OUTPUT_PATH);
    std::fs::create_dir_all(
        types_path
            .parent()
            .ok_or_else(|| anyhow!("types output path has no parent"))?,
    )?;
    std::fs::write(&types_path, &types_source)
        .with_context(|| format!("writing {}", types_path.display()))?;

    assert_unique_wrapper_names(&sigs)?;
    bytes::verify(&sigs, &bytes_dt, &resolved)?;
    let (entries, references) = entries::collect_entries(sigs, &ts, &resolved)?;
    std::fs::write(&maps_path, maps::render(&entries, &references))
        .with_context(|| format!("writing {}", maps_path.display()))?;

    // 4. Per-target outputs. Each target owns its file paths + emission
    //    so adding a new target is a single new module + one `run` call.
    web::run(&root, release, &types_source, &entries)?;
    desktop::run(&root, &entries)?;
    mobile::run(&root, &entries)?;

    eprintln!(
        "harmony codegen: wrote {types}, {maps}, web/desktop/mobile outputs",
        types = types_path.display(),
        maps = maps_path.display(),
    );
    Ok(())
}

/// uniffi metadata symbols are `UNIFFI_META_{CRATE}_{KIND}_{NAME}`, uppercased
/// and blind to module paths, so two exports whose wrapper names differ only
/// by case would collide at link time with a confusing duplicate-symbol error.
/// Wrapper names are `wire.replace('.', "_")`, so catch it here instead.
fn assert_unique_wrapper_names(
    sigs: &[(&'static HarmonyEntry, harmony_protocol::Signature)],
) -> Result<()> {
    let mut seen: std::collections::HashMap<String, &'static str> =
        std::collections::HashMap::new();
    for (entry, _) in sigs {
        let symbol = entry.wire.replace('.', "_").to_uppercase();
        if let Some(other) = seen.insert(symbol, entry.wire) {
            bail!(
                "`{}` and `{}` produce the same uniffi metadata symbol; wrapper names must be \
                 unique case-insensitively",
                other,
                entry.wire
            );
        }
    }
    Ok(())
}
