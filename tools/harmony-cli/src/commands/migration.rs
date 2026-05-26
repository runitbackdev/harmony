use std::os::unix::process::CommandExt;
use std::process::Command;

use anyhow::{Context, Result, anyhow};

pub fn run(args: &[String]) -> Result<()> {
    let err = Command::new("cargo")
        .args([
            "run",
            "-q",
            "-p",
            "herald",
            "--bin",
            "herald-cli",
            "--",
            "migration",
        ])
        .args(args)
        .exec();
    Err(anyhow!(err)).context("failed to exec `cargo` — is it installed and on PATH?")
}
