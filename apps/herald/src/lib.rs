pub mod api;
pub mod auth;
pub mod config;
pub mod health;
pub mod matrix;
pub mod membership;
pub mod models;
pub mod presence;
pub mod state;

use toasty::Db;

pub async fn build_db(database_url: &str) -> Result<Db, toasty::Error> {
    Db::builder()
        .models(toasty::models!(crate::*))
        .connect(database_url)
        .await
}
