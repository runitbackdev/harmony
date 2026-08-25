use std::path::Path;
use std::process::Command;

use anyhow::{Context, Result, anyhow, bail};
use harmony_protocol::EntryKind;
use indoc::formatdoc;

use super::dispatch::{self, DispatchTable};
use super::entries::EntryRow;

const WASM_CRATE_PATH: &str = "packages/harmony-protocol";
const WASM_OUT_DIR: &str = "packages/wasm";
const WASM_DTS_PATH: &str = "packages/wasm/wasm.d.ts";
const WEB_DISPATCH_OUTPUT_PATH: &str = "apps/web/src/transport/web/dispatch.generated.ts";

/// Run the full web target pipeline: build wasm, append wire types to
/// `wasm.d.ts`, write the populated web dispatch table.
pub(super) fn run(
    root: &Path,
    release: bool,
    types_source: &str,
    entries: &[EntryRow],
) -> Result<()> {
    build_wasm(root, release)?;
    append_types_to_wasm_dts(&root.join(WASM_DTS_PATH), types_source)?;

    let dispatch_path = root.join(WEB_DISPATCH_OUTPUT_PATH);
    std::fs::create_dir_all(
        dispatch_path
            .parent()
            .ok_or_else(|| anyhow!("web dispatch output path has no parent"))?,
    )?;
    std::fs::write(&dispatch_path, dispatch::render(&WEB_TABLE, entries))
        .with_context(|| format!("writing {}", dispatch_path.display()))?;
    Ok(())
}

/// Invoke `wasm-pack build` against `harmony-protocol` itself — the
/// manifest carries `cdylib` so there is no separate binding crate. The
/// npm identity wasm-pack derives from the crate name is overwritten by
/// [`write_package_files`].
fn build_wasm(root: &Path, release: bool) -> Result<()> {
    let crate_path = root.join(WASM_CRATE_PATH);
    let out_dir = root.join(WASM_OUT_DIR);

    let mut cmd = Command::new("wasm-pack");
    cmd.arg("build").arg(&crate_path);
    if !release {
        cmd.arg("--dev");
    }
    cmd.arg("--target")
        .arg("web")
        .arg("--scope")
        .arg("harmony")
        .arg("--out-dir")
        .arg(&out_dir)
        .arg("--out-name")
        .arg("wasm")
        .arg("--")
        .arg("--features")
        .arg("web");
    run_tool(&mut cmd, "wasm-pack")?;

    write_package_files(&out_dir)
}

fn run_tool(cmd: &mut Command, name: &str) -> Result<()> {
    let status = cmd
        .status()
        .with_context(|| format!("failed to spawn `{name}` — is it installed and on PATH?"))?;
    if !status.success() {
        bail!("{name} exited with status {status}");
    }
    Ok(())
}

/// The npm identity is chosen here rather than derived from the crate name,
/// which is what lets `@harmony/harmony-bindings-web` stay the import
/// specifier across the whole web app.
fn write_package_files(out_dir: &Path) -> Result<()> {
    std::fs::write(out_dir.join(".gitignore"), "*")
        .with_context(|| format!("writing {}", out_dir.join(".gitignore").display()))?;

    let package_json = formatdoc! {r#"
        {{
          "name": "@harmony/harmony-bindings-web",
          "type": "module",
          "version": "0.1.0",
          "files": [
            "wasm_bg.wasm",
            "wasm.js",
            "wasm.d.ts"
          ],
          "main": "wasm.js",
          "types": "wasm.d.ts",
          "sideEffects": [
            "./snippets/*"
          ]
        }}
    "#};
    std::fs::write(out_dir.join("package.json"), package_json)
        .with_context(|| format!("writing {}", out_dir.join("package.json").display()))
}

/// Append the codegen'd type declarations to the wasm-bindgen-generated
/// `wasm.d.ts`. After this, `@harmony/harmony-bindings-web` is the single
/// import source for both runtime fn bindings and the wire type
/// definitions referenced by `wasm_bindgen(typescript_type = "Name")`.
fn append_types_to_wasm_dts(wasm_dts: &Path, types_source: &str) -> Result<()> {
    let existing = std::fs::read_to_string(wasm_dts)
        .with_context(|| format!("reading {}", wasm_dts.display()))?;
    let combined = format!(
        "{existing}\n\n// --- Wire types (mirrored from harmony codegen) ---\n{types_source}"
    );
    std::fs::write(wasm_dts, combined)
        .with_context(|| format!("writing {}", wasm_dts.display()))?;
    Ok(())
}

const WEB_IMPORTS: &str = r#"import * as wasm from "@harmony/harmony-bindings-web";
import type { RpcMap, CommandMap, SubscriptionMap } from "@harmony/core/protocol/maps.generated";"#;

const WEB_TABLE: DispatchTable = DispatchTable {
    prefix: "web",
    imports: WEB_IMPORTS,
    call: Some(web_call),
};

/// wasm-bindgen exports the fn directly onto the module namespace, so
/// every kind resolves the same way.
fn web_call(entry: &EntryRow, _kind: EntryKind) -> String {
    format!("wasm.{}", entry.js)
}
