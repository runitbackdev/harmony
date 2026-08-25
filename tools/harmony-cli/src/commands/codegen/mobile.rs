use std::path::Path;

use anyhow::{Context, Result, anyhow};

use super::dispatch::{self, DispatchTable};
use super::entries::EntryRow;

const NATIVE_DISPATCH_OUTPUT_PATH: &str = "apps/mobile/src/transport/native/dispatch.generated.ts";

const NATIVE_IMPORTS: &str = r#"import type { RpcMap, CommandMap, SubscriptionMap } from "@harmony/core/protocol/maps.generated";"#;

/// `call: None` until the uniffi-backed native binding lands — the table
/// renders as `Partial<…> = {}` so dependent imports resolve. Wiring the
/// target is then one `call` fn.
const NATIVE_TABLE: DispatchTable = DispatchTable {
    prefix: "native",
    imports: NATIVE_IMPORTS,
    call: None,
};

pub(super) fn run(root: &Path, entries: &[EntryRow]) -> Result<()> {
    let path = root.join(NATIVE_DISPATCH_OUTPUT_PATH);
    std::fs::create_dir_all(
        path.parent()
            .ok_or_else(|| anyhow!("mobile dispatch output path has no parent"))?,
    )?;
    std::fs::write(&path, dispatch::render(&NATIVE_TABLE, entries))
        .with_context(|| format!("writing {}", path.display()))
}
