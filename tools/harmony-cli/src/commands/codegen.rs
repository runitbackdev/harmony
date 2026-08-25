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

mod desktop;
mod dispatch;
mod entries;
mod maps;
mod mobile;
mod web;

use anyhow::{Context, Result, anyhow};
use harmony_protocol::{HarmonyEntry, HarmonyError, HarmonyTypes};
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
    for entry in inventory::iter::<HarmonyEntry> {
        let register = match &entry.types {
            HarmonyTypes::Rpc { register, .. }
            | HarmonyTypes::Command { register, .. }
            | HarmonyTypes::Subscription { register, .. } => register,
        };
        register(&mut types);
    }

    // 2. Apply serde rules (rename_all, tag/content, etc.) and resolve
    //    into a printable TypeScript module.
    let resolved =
        specta_serde::apply(types).map_err(|e| anyhow!("specta-serde apply failed: {e}"))?;
    let types_source = Typescript::default()
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

    let entries = entries::collect_entries();
    std::fs::write(&maps_path, maps::render(&entries))
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
