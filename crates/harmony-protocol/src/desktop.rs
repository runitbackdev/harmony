//! Desktop transport scaffolding for `#[harmony_export]` subscription
//! wrappers.
//!
//! Each subscription wrapper:
//! 1. Calls the original async fn → `Subscription<I, C>`.
//! 2. On startup error returns `Rpc::err(_)`.
//! 3. On startup ok spawns a pump task that forwards stream items as
//!    `StreamEvent::Chunk(_)` over the Tauri `Channel`, then sends
//!    `StreamEvent::End` on natural completion.
//! 4. Registers the pump's `AbortHandle` in `REGISTRY` keyed by the
//!    frontend-supplied subscription id.
//!
//! `harmony_unsubscribe` aborts the pump for a given id.

use std::sync::OnceLock;

use dashmap::DashMap;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::UriSchemeResponder;
use tauri::http::{Request, Response, StatusCode, Uri, header};
use tokio::task::AbortHandle;

use crate::error::HarmonyError;
use crate::wrappers::SubscriptionStream;

/// Streamed envelope sent over `Channel<StreamEvent<C>>`.
///
/// The `Error` variant is reserved for future mid-stream failures — the
/// current `Subscription` ABI doesn't surface stream-level errors, but
/// defining the variant up front avoids a wire break later.
#[derive(Serialize, Deserialize)]
#[serde(tag = "kind", content = "data", rename_all = "camelCase")]
pub enum StreamEvent<C> {
    Chunk(C),
    End,
    Error(HarmonyError),
}

fn registry() -> &'static DashMap<String, AbortHandle> {
    static REGISTRY: OnceLock<DashMap<String, AbortHandle>> = OnceLock::new();
    REGISTRY.get_or_init(DashMap::new)
}

/// Spawn the pump for a subscription and return the registered
/// `AbortHandle`. Pump ends on upstream completion, on
/// channel-send failure (frontend dropped), or via `harmony_unsubscribe`.
pub fn spawn_pump<C>(
    subscription_id: String,
    stream: SubscriptionStream<C>,
    channel: tauri::ipc::Channel<StreamEvent<C>>,
) -> AbortHandle
where
    C: Serialize + Send + 'static,
{
    let key = subscription_id.clone();
    let handle = tokio::spawn(async move {
        let mut stream = stream;
        while let Some(chunk) = stream.next().await {
            if channel.send(StreamEvent::Chunk(chunk)).is_err() {
                break;
            }
        }
        let _ = channel.send(StreamEvent::End);
        registry().remove(&key);
    });
    let abort = handle.abort_handle();
    registry().insert(subscription_id, abort.clone());
    abort
}

/// Frontend-driven cancel. No-op if id unknown (already-ended pump or
/// never-existed id). Takes `String` by value — Tauri command args must
/// be owned deserializable types.
#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub fn harmony_unsubscribe(subscription_id: String) {
    if let Some((_, handle)) = registry().remove(&subscription_id) {
        handle.abort();
    }
}

/// Desktop counterpart to the web service worker's `/_media/` route.
///
/// Serves a plaintext `media://{download,thumbnail}/{server}/{id}` request by
/// proxying the homeserver's authed-media endpoint with the session token and
/// any forwarded `Range`. Encrypted media never reaches here — it rides the
/// invoke RPC (`media.fetch`), which decrypts in the core.
pub fn serve_media(request: &Request<Vec<u8>>, responder: UriSchemeResponder) {
    let target = parse_media_uri(request.uri());
    let range = request
        .headers()
        .get(header::RANGE)
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned);

    tauri::async_runtime::spawn(async move {
        let response = match target {
            Some(target) => proxy_media(target, range).await,
            None => empty(StatusCode::BAD_REQUEST),
        };
        responder.respond(response);
    });
}

struct MediaTarget {
    verb: String,
    server: String,
    id: String,
    query: Option<String>,
}

// WebKit/WebKitGTK deliver `media://{verb}/{server}/{id}` (verb in the
// authority); Windows WebView2 maps custom schemes to
// `http://media.localhost/{verb}/{server}/{id}` (verb in the path). Accept both
// by treating a verb-shaped authority as a leading path segment.
fn parse_media_uri(uri: &Uri) -> Option<MediaTarget> {
    let mut segments: Vec<&str> = Vec::new();
    if let Some(host) = uri.host()
        && (host == "download" || host == "thumbnail")
    {
        segments.push(host);
    }
    segments.extend(uri.path().split('/').filter(|segment| !segment.is_empty()));

    let [verb, server, id] = segments.as_slice() else {
        return None;
    };
    if *verb != "download" && *verb != "thumbnail" {
        return None;
    }

    Some(MediaTarget {
        verb: (*verb).to_owned(),
        server: (*server).to_owned(),
        id: (*id).to_owned(),
        query: uri.query().map(str::to_owned),
    })
}

async fn proxy_media(target: MediaTarget, range: Option<String>) -> Response<Vec<u8>> {
    let Some(client) = crate::client::get() else {
        return empty(StatusCode::SERVICE_UNAVAILABLE);
    };
    let Some(token) = client.access_token() else {
        return empty(StatusCode::UNAUTHORIZED);
    };

    let MediaTarget {
        verb,
        server,
        id,
        query,
    } = target;
    let mut url = format!(
        "{base}_matrix/client/v1/media/{verb}/{server}/{id}",
        base = client.homeserver(),
    );
    if let Some(query) = query {
        url.push('?');
        url.push_str(&query);
    }

    let mut request = matrix_sdk::reqwest::Client::new()
        .get(&url)
        .bearer_auth(token);
    if let Some(range) = range {
        request = request.header(header::RANGE, range);
    }

    let Ok(upstream) = request.send().await else {
        return empty(StatusCode::BAD_GATEWAY);
    };

    let mut builder = Response::builder().status(upstream.status().as_u16());
    for name in [
        header::CONTENT_TYPE,
        header::CONTENT_RANGE,
        header::ACCEPT_RANGES,
    ] {
        if let Some(value) = upstream.headers().get(name.as_str())
            && let Ok(value) = value.to_str()
        {
            builder = builder.header(name, value);
        }
    }

    let Ok(bytes) = upstream.bytes().await else {
        return empty(StatusCode::BAD_GATEWAY);
    };
    let bytes = bytes.to_vec();
    builder = builder.header(header::CONTENT_LENGTH, bytes.len().to_string());

    builder
        .body(bytes)
        .unwrap_or_else(|_| empty(StatusCode::INTERNAL_SERVER_ERROR))
}

fn empty(code: StatusCode) -> Response<Vec<u8>> {
    Response::builder()
        .status(code)
        .body(Vec::new())
        .unwrap_or_else(|_| Response::new(Vec::new()))
}
