use figment::{
    providers::{Env, Format, Serialized, Toml},
    Figment,
};
use serde::{Deserialize, Serialize};
use url::Url;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub database_url: String,
    pub homeserver_url: Url,
    pub port: u16,
    pub hs_token: String,
    pub as_token: String,
    pub sender_localpart: String,
    pub token_cache_ttl_secs: u64,
    pub shutdown_timeout_secs: u64,
    pub membership_cache_ttl_secs: u64,
    pub membership_cache_max_users: u64,
    pub membership_cache_max_rooms: u64,
    pub presence_identify_timeout_secs: u64,
    pub presence_max_spaces_per_subscribe: usize,
    pub presence_max_subscriptions_per_conn: usize,
    pub presence_auto_idle_secs: u64,
    pub presence_offline_grace_secs: u64,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            database_url: "postgres://herald:herald@localhost:5432/herald".into(),
            homeserver_url: Url::parse("http://localhost:8008").expect("valid default url"),
            port: 3000,
            hs_token: String::new(),
            as_token: String::new(),
            sender_localpart: "herald".into(),
            token_cache_ttl_secs: 60,
            shutdown_timeout_secs: 30,
            membership_cache_ttl_secs: 300,
            membership_cache_max_users: 10_000,
            membership_cache_max_rooms: 10_000,
            presence_identify_timeout_secs: 5,
            presence_max_spaces_per_subscribe: 200,
            presence_max_subscriptions_per_conn: 500,
            presence_auto_idle_secs: 300,
            presence_offline_grace_secs: 30,
        }
    }
}

impl Config {
    pub fn load() -> Result<Self, figment::Error> {
        let cfg: Self = Figment::new()
            .merge(Serialized::defaults(Self::default()))
            .merge(Toml::file("Herald.toml"))
            .merge(Env::prefixed("HERALD_"))
            .extract()?;

        if cfg.hs_token.is_empty() {
            return Err(figment::Error::from(
                "hs_token must be set (HERALD_HS_TOKEN or Herald.toml)",
            ));
        }

        if cfg.as_token.is_empty() {
            return Err(figment::Error::from(
                "as_token must be set (HERALD_AS_TOKEN or Herald.toml)",
            ));
        }

        Ok(cfg)
    }
}
