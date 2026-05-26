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

    /// Database administration (CREATE/DROP/RESET DATABASE)
    Db {
        #[command(subcommand)]
        cmd: DbCmd,
    },

    /// Database migrations (forwards to herald-cli migration)
    #[command(disable_help_flag = true)]
    Migration {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },

    #[command(external_subcommand)]
    Forwarded(Vec<String>),
}

#[derive(Subcommand)]
enum DbCmd {
    /// CREATE DATABASE for the herald database
    Create {
        /// Override database URL (else `HERALD_DATABASE_URL` or `DATABASE_URL`)
        #[arg(long)]
        database_url: Option<String>,
    },
    /// DROP DATABASE for the herald database (destructive)
    Drop {
        /// Required for destructive operation
        #[arg(long)]
        yes: bool,
        /// Override database URL (else `HERALD_DATABASE_URL` or `DATABASE_URL`)
        #[arg(long)]
        database_url: Option<String>,
    },
    /// Drop, recreate, and apply migrations (destructive)
    Reset {
        /// Required for destructive operation
        #[arg(long)]
        yes: bool,
        /// Override database URL (else `HERALD_DATABASE_URL` or `DATABASE_URL`)
        #[arg(long)]
        database_url: Option<String>,
    },
}

fn main() -> Result<()> {
    let cli = Cli::parse();

    match cli.cmd {
        Cmd::Codegen { release } => commands::codegen::run(release),
        Cmd::Db { cmd } => dispatch_db(cmd),
        Cmd::Migration { args } => commands::migration::run(&args),
        Cmd::Forwarded(args) => forward_to_just(&args),
    }
}

fn dispatch_db(cmd: DbCmd) -> Result<()> {
    match cmd {
        DbCmd::Create { database_url } => commands::db::create(database_url),
        DbCmd::Drop { yes, database_url } => {
            require_yes(yes, "drop")?;
            commands::db::drop(database_url)
        }
        DbCmd::Reset { yes, database_url } => {
            require_yes(yes, "reset")?;
            commands::db::reset(database_url)
        }
    }
}

fn require_yes(yes: bool, op: &str) -> Result<()> {
    if yes {
        Ok(())
    } else {
        Err(anyhow!("refusing destructive `{op}` without --yes flag"))
    }
}

fn forward_to_just(args: &[String]) -> Result<()> {
    let err = Command::new("just").args(args).exec();
    Err(anyhow!(err)).context("failed to exec `just` — is it installed and on PATH?")
}
