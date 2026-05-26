use anyhow::{Context, Result};
use herald::build_db;
use toasty_cli::{Config as ToastyConfig, MigrationConfig, ToastyCli};

const MIGRATIONS_DIR: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/migrations");

#[tokio::main]
async fn main() -> Result<()> {
    dotenvy::dotenv().ok();

    let database_url = std::env::var("HERALD_DATABASE_URL")
        .or_else(|_| std::env::var("DATABASE_URL"))
        .context("set HERALD_DATABASE_URL or DATABASE_URL")?;

    let db = build_db(&database_url).await?;

    let toasty_config = ToastyConfig::new().migration(MigrationConfig::new().path(MIGRATIONS_DIR));

    ToastyCli::with_config(db, toasty_config)
        .parse_and_run()
        .await
}
