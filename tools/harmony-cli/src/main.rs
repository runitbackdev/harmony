use std::os::unix::process::CommandExt;
use std::process::Command;

use anyhow::{Context, Result, anyhow};
use clap::{Parser, Subcommand};

mod commands;
mod util;

#[derive(Parser)]
#[command(
    name = "harmony",
    version,
    about = "Harmony workspace CLI",
    long_about = "Typed commands handle workspace operations.\n\
                  Unknown subcommands are forwarded to `just`."
)]
struct Cli {
    #[command(subcommand)]
    cmd: Cmd,
}

#[derive(Subcommand)]
enum Cmd {
    /// Build WASM and regenerate TS protocol bindings
    Codegen {
        /// Build WASM in release mode (default: dev)
        #[arg(long)]
        release: bool,
    },

    #[command(external_subcommand)]
    Forwarded(Vec<String>),
}

fn main() -> Result<()> {
    let cli = Cli::parse();

    match cli.cmd {
        Cmd::Codegen { release } => commands::codegen::run(release),
        Cmd::Forwarded(args) => forward_to_just(&args),
    }
}

fn forward_to_just(args: &[String]) -> Result<()> {
    let err = Command::new("just").args(args).exec();
    Err(anyhow!(err)).context("failed to exec `just` — is it installed and on PATH?")
}
