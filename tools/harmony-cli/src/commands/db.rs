use std::process::Command;

use anyhow::{Context, Result, anyhow, bail};
use tokio_postgres::NoTls;
use url::Url;

use crate::util::db_url;

pub fn create(database_url: Option<String>) -> Result<()> {
    let url = db_url::resolve(database_url)?;
    let (maintenance_url, db_name) = split_url(&url)?;
    runtime()?.block_on(do_create(&maintenance_url, &db_name))
}

pub fn drop(database_url: Option<String>) -> Result<()> {
    let url = db_url::resolve(database_url)?;
    let (maintenance_url, db_name) = split_url(&url)?;
    runtime()?.block_on(do_drop(&maintenance_url, &db_name))
}

pub fn reset(database_url: Option<String>) -> Result<()> {
    let url = db_url::resolve(database_url)?;
    let (maintenance_url, db_name) = split_url(&url)?;
    let rt = runtime()?;
    rt.block_on(do_drop(&maintenance_url, &db_name))?;
    rt.block_on(do_create(&maintenance_url, &db_name))?;
    apply_migrations(&url)
}

fn runtime() -> Result<tokio::runtime::Runtime> {
    tokio::runtime::Runtime::new().context("building tokio runtime")
}

async fn do_create(maintenance_url: &str, db_name: &str) -> Result<()> {
    let client = connect(maintenance_url).await?;
    let stmt = format!("CREATE DATABASE {}", quote_ident(db_name));
    client
        .execute(&stmt, &[])
        .await
        .with_context(|| format!("creating database {db_name}"))?;
    eprintln!("created database {db_name}");
    Ok(())
}

async fn do_drop(maintenance_url: &str, db_name: &str) -> Result<()> {
    let client = connect(maintenance_url).await?;
    let stmt = format!(
        "DROP DATABASE IF EXISTS {} WITH (FORCE)",
        quote_ident(db_name)
    );
    client
        .execute(&stmt, &[])
        .await
        .with_context(|| format!("dropping database {db_name}"))?;
    eprintln!("dropped database {db_name}");
    Ok(())
}

async fn connect(url: &str) -> Result<tokio_postgres::Client> {
    let (client, connection) = tokio_postgres::connect(url, NoTls)
        .await
        .with_context(|| format!("connecting to {url}"))?;
    tokio::spawn(async move {
        if let Err(e) = connection.await {
            eprintln!("postgres connection error: {e}");
        }
    });
    Ok(client)
}

fn split_url(url: &str) -> Result<(String, String)> {
    let mut parsed = Url::parse(url).with_context(|| format!("parsing url {url}"))?;
    let db_name = parsed
        .path_segments()
        .and_then(|mut s| s.next())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| anyhow!("url {url} has no database name in path"))?
        .to_string();
    parsed.set_path("/postgres");
    Ok((parsed.to_string(), db_name))
}

fn quote_ident(s: &str) -> String {
    let escaped = s.replace('"', "\"\"");
    format!("\"{escaped}\"")
}

fn apply_migrations(database_url: &str) -> Result<()> {
    let status = Command::new("cargo")
        .args([
            "run",
            "-q",
            "-p",
            "herald",
            "--bin",
            "herald-cli",
            "--",
            "migration",
            "apply",
        ])
        .env("HERALD_DATABASE_URL", database_url)
        .status()
        .context("spawning herald-cli")?;
    if !status.success() {
        bail!("herald-cli migration apply failed with status {status}");
    }
    Ok(())
}
