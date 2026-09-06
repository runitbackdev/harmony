//! Desktop transport scaffolding for `#[harmony_export]` subscription
//! wrappers.
//!
//! Subscriptions are consumer-driven: the wrapper registers the stream
//! under the frontend-supplied id and returns the initial value. Nothing
//! is polled until `harmony_poll` asks, so backpressure is structural
//! rather than a protocol — the same property the wasm binding gets from
//! `ReadableStream::from_stream`. `harmony_unsubscribe` drops the stream
//! and wakes any in-flight poll.

use std::pin::Pin;
use std::sync::{Arc, OnceLock};

use dashmap::DashMap;
use futures_util::{FutureExt, Stream, StreamExt};
use serde::Serialize;
use tauri::UriSchemeResponder;
use tauri::http::{Request, Response, StatusCode, Uri, header};
use tokio::sync::{Mutex, Notify};

use crate::wrappers::SubscriptionStream;

/// Chunks are erased to `Value` at registration so one non-generic
/// `harmony_poll` serves every subscription. The typed half stays in the
/// macro-emitted closure; only storage is erased.
type ErasedStream = Pin<Box<dyn Stream<Item = serde_json::Value> + Send>>;

struct PullSubscription {
    stream: Mutex<Option<ErasedStream>>,
    cancel: Notify,
}

fn pull_registry() -> &'static DashMap<String, Arc<PullSubscription>> {
    static PULL: OnceLock<DashMap<String, Arc<PullSubscription>>> = OnceLock::new();
    PULL.get_or_init(DashMap::new)
}

/// Register a subscription for consumer-driven polling. Nothing is polled
/// until `harmony_poll` asks, so a slow frontend cannot be outrun.
pub fn register_pull<C>(subscription_id: String, stream: SubscriptionStream<C>)
where
    C: Serialize + Send + 'static,
{
    let erased = stream.map(|chunk| serde_json::to_value(chunk).unwrap_or(serde_json::Value::Null));
    pull_registry().insert(
        subscription_id,
        Arc::new(PullSubscription {
            stream: Mutex::new(Some(Box::pin(erased))),
            cancel: Notify::new(),
        }),
    );
}

/// Await the next chunk, then drain what else is ready, up to `max`.
///
/// An empty batch means the subscription is over — ended upstream,
/// cancelled, or never registered — and the caller should stop polling.
/// The immediate-drain half collapses a `flat_map`ped burst into one IPC
/// response instead of one per diff.
#[tauri::command]
pub async fn harmony_poll(subscription_id: String, max: usize) -> Vec<serde_json::Value> {
    // Clone the Arc out and drop the DashMap guard before any await —
    // holding a shard lock across one deadlocks against unsubscribe.
    let Some(entry) = pull_registry()
        .get(&subscription_id)
        .map(|r| Arc::clone(&r))
    else {
        return Vec::new();
    };

    let mut guard = entry.stream.lock().await;
    let Some(stream) = guard.as_mut() else {
        return Vec::new();
    };

    let first = tokio::select! {
        item = stream.next() => item,
        () = entry.cancel.notified() => None,
    };
    let Some(first) = first else {
        *guard = None;
        drop(guard);
        pull_registry().remove(&subscription_id);
        return Vec::new();
    };

    let mut batch = vec![first];
    while batch.len() < max.max(1) {
        match stream.next().now_or_never() {
            Some(Some(chunk)) => batch.push(chunk),
            _ => break,
        }
    }
    batch
}

/// Frontend-driven cancel. No-op if id unknown (already-ended pump or
/// Frontend-driven cancel. Drops the stream and wakes any in-flight poll.
///
/// No-op if the id is unknown (already-ended or never-existed). Takes
/// `String` by value — Tauri command args must be owned deserializable
/// types.
#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub fn harmony_unsubscribe(subscription_id: String) {
    // `notify_one` stores a permit, so an in-flight poll that has not yet
    // reached `notified()` still wakes instead of hanging until upstream
    // happens to yield.
    if let Some((_, entry)) = pull_registry().remove(&subscription_id) {
        entry.cancel.notify_one();
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

#[cfg(test)]
mod pull_tests {
    use std::sync::Arc;
    use std::sync::atomic::{AtomicU32, Ordering};

    use futures_util::{StreamExt, stream};

    use super::{harmony_poll, harmony_unsubscribe, register_pull};

    fn counted(count: u32) -> (crate::wrappers::SubscriptionStream<u32>, Arc<AtomicU32>) {
        let polls = Arc::new(AtomicU32::new(0));
        let counter = Arc::clone(&polls);
        let stream = stream::iter(0..count).inspect(move |_| {
            counter.fetch_add(1, Ordering::SeqCst);
        });
        (Box::pin(stream), polls)
    }

    #[tokio::test]
    async fn registering_polls_nothing() {
        let (stream, polls) = counted(5);
        register_pull("lazy".into(), stream);

        tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        assert_eq!(
            polls.load(Ordering::SeqCst),
            0,
            "producer ran without a consumer"
        );

        harmony_unsubscribe("lazy".into());
    }

    #[tokio::test]
    async fn poll_drains_ready_chunks_up_to_max() {
        let (stream, _) = counted(10);
        register_pull("batch".into(), stream);

        let batch = harmony_poll("batch".into(), 4).await;
        assert_eq!(batch.len(), 4, "did not coalesce ready chunks");
        assert_eq!(batch[0], serde_json::json!(0));
        assert_eq!(batch[3], serde_json::json!(3));

        harmony_unsubscribe("batch".into());
    }

    #[tokio::test]
    async fn empty_batch_signals_the_end() {
        let (stream, _) = counted(2);
        register_pull("end".into(), stream);

        assert_eq!(harmony_poll("end".into(), 16).await.len(), 2);
        assert!(
            harmony_poll("end".into(), 16).await.is_empty(),
            "no end signal"
        );
        // Ended subscriptions deregister themselves.
        assert!(harmony_poll("end".into(), 16).await.is_empty());
    }

    #[tokio::test]
    async fn unknown_id_is_empty_not_a_hang() {
        assert!(harmony_poll("never-existed".into(), 16).await.is_empty());
    }

    #[tokio::test]
    async fn unsubscribe_wakes_an_in_flight_poll() {
        // A stream that never yields: only the cancel path can end this poll.
        let stream: crate::wrappers::SubscriptionStream<u32> = Box::pin(stream::pending());
        register_pull("stuck".into(), stream);

        let poll = tokio::spawn(harmony_poll("stuck".into(), 16));
        tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        harmony_unsubscribe("stuck".into());

        let batch = tokio::time::timeout(std::time::Duration::from_secs(2), poll)
            .await
            .expect("in-flight poll hung through unsubscribe")
            .expect("poll task panicked");
        assert!(batch.is_empty());
    }

    // Proves `registering_polls_nothing` is non-vacuous: the same counter
    // does move when something drains without being asked.
    #[tokio::test]
    async fn negative_control_detached_drain_runs_ahead() {
        let (mut stream, polls) = counted(5);
        tokio::spawn(async move { while stream.next().await.is_some() {} });

        tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        assert_eq!(
            polls.load(Ordering::SeqCst),
            5,
            "detached drain did NOT run ahead"
        );
    }
}
