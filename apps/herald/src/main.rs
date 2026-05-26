use std::net::SocketAddr;
use std::time::Duration;

use axum::middleware::from_fn_with_state;
use tokio_util::sync::CancellationToken;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use std::sync::Arc;

use herald::auth::TokenCache;
use herald::config::Config;
use herald::matrix::{MatrixApi, MatrixClient, TransactionCache};
use herald::membership::MembershipCache;
use herald::presence::fanout::PresenceFanout;
use herald::presence::registry::PresenceRegistry;
use herald::presence::subscriptions::SubscriptionRegistry;
use herald::state::AppState;
use herald::{api, auth, build_db, health, matrix, presence};

const TOKEN_CACHE_MAX_CAPACITY: u64 = 10_000;
const TRANSACTION_CACHE_MAX_CAPACITY: u64 = 10_000;
const TRANSACTION_CACHE_TTL_SECS: u64 = 600;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();

    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "herald=debug,tower_http=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let config = Config::load()?;

    let db = build_db(&config.database_url).await?;

    let matrix = MatrixClient::new(config.homeserver_url.clone(), config.as_token.clone());
    let tokens = TokenCache::new(
        matrix.clone(),
        Duration::from_secs(config.token_cache_ttl_secs),
        TOKEN_CACHE_MAX_CAPACITY,
    );
    let transactions = TransactionCache::new(
        Duration::from_secs(TRANSACTION_CACHE_TTL_SECS),
        TRANSACTION_CACHE_MAX_CAPACITY,
    );
    let membership = MembershipCache::new(
        Arc::new(matrix.clone()) as Arc<dyn MatrixApi>,
        Duration::from_secs(config.membership_cache_ttl_secs),
        config.membership_cache_max_users,
        config.membership_cache_max_rooms,
    );
    let subscriptions = Arc::new(SubscriptionRegistry::new());
    let presence_fanout = PresenceFanout::new(membership.clone(), subscriptions.clone());
    let presence_registry = PresenceRegistry::new(
        presence_fanout.clone(),
        Duration::from_secs(config.presence_offline_grace_secs),
        Some(db.clone()),
    );

    let shutdown = CancellationToken::new();
    let state = AppState {
        db,
        matrix,
        config: config.clone(),
        tokens,
        transactions,
        membership,
        subscriptions,
        presence_fanout: presence_fanout.clone(),
        presence_registry,
        shutdown: shutdown.clone(),
    };

    let app = axum::Router::new()
        .route("/health", axum::routing::get(health::check))
        .nest(
            "/api",
            api::router()
                .layer(from_fn_with_state(
                    state.clone(),
                    auth::user_token::require_user,
                ))
                .layer(api::rate_limit::default_tier()),
        )
        .nest(
            "/_matrix/app/v1",
            matrix::router().layer(from_fn_with_state(state.clone(), auth::hs_token::verify)),
        )
        .nest("/ws/v1", presence::router())
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], config.port));
    tracing::debug!("listening on {}", addr);

    spawn_signal_listener(shutdown.clone());
    spawn_shutdown_watchdog(shutdown.clone(), config.shutdown_timeout_secs);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    // Shutdown flow: signal listener cancels the token. Axum's
    // graceful_shutdown stops accept and waits for in-flight tasks. Each WS
    // Connection also selects on the same token and emits Close(1012
    // SERVICE_RESTART), then exits cleanly — so axum::serve drains promptly
    // instead of stalling on long-lived WS upgrades.
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown({
        let shutdown = shutdown.clone();
        async move { shutdown.cancelled().await }
    })
    .await?;

    // TODO(harmony-t16.9): flush pending custom-status writes before exit.
    presence_fanout.shutdown().await;
    tracing::info!("shutdown complete");

    Ok(())
}

fn spawn_signal_listener(shutdown: CancellationToken) {
    tokio::spawn(async move {
        wait_for_signal().await;
        tracing::info!("shutdown signal received, draining");
        shutdown.cancel();
    });
}

fn spawn_shutdown_watchdog(shutdown: CancellationToken, timeout_secs: u64) {
    tokio::spawn(async move {
        shutdown.cancelled().await;
        tokio::time::sleep(Duration::from_secs(timeout_secs)).await;
        tracing::error!(
            timeout_secs,
            "graceful shutdown exceeded timeout, forcing exit"
        );
        std::process::exit(1);
    });
}

async fn wait_for_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("install ctrl-c handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("install SIGTERM handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        () = ctrl_c => tracing::debug!("SIGINT received"),
        () = terminate => tracing::debug!("SIGTERM received"),
    }
}
