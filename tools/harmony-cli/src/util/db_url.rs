use anyhow::{Result, bail};

pub fn resolve(flag: Option<String>) -> Result<String> {
    if let Some(url) = flag {
        return Ok(url);
    }
    if let Ok(url) = std::env::var("HERALD_DATABASE_URL") {
        return Ok(url);
    }
    if let Ok(url) = std::env::var("DATABASE_URL") {
        return Ok(url);
    }
    bail!(
        "no database URL found. Set one of:\n  \
         --database-url <url>\n  \
         HERALD_DATABASE_URL=<url>\n  \
         DATABASE_URL=<url>"
    )
}
