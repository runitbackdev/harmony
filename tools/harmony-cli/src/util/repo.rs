use std::path::{Path, PathBuf};

use anyhow::{Context, Result, bail};

pub fn workspace_root() -> Result<PathBuf> {
    let cwd = std::env::current_dir().context("reading current directory")?;
    find_workspace_root(&cwd)
}

fn find_workspace_root(start: &Path) -> Result<PathBuf> {
    for dir in start.ancestors() {
        let manifest = dir.join("Cargo.toml");
        if manifest.is_file() {
            let text = std::fs::read_to_string(&manifest)
                .with_context(|| format!("reading {}", manifest.display()))?;
            if text.contains("[workspace]") {
                return Ok(dir.to_path_buf());
            }
        }
    }
    bail!(
        "could not find workspace root from {} (no Cargo.toml with [workspace] in any ancestor)",
        start.display()
    );
}
