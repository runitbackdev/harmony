/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope;

type AuthState = {
  token: string;
  homeserverOrigin: string;
};

type IncomingMessage =
  | { type: "harmony/auth/set"; token: string; homeserverOrigin: string }
  | { type: "harmony/auth/clear" }
  | { type: "harmony/auth/reply"; token: string | null; homeserverOrigin: string | null }
  | { type: "harmony/claim" };

const AUTHED_MEDIA_PREFIX = "/_matrix/client/v1/media/";
const LOCAL_MEDIA_PREFIX = "/_media/";
const REQUEST_TOKEN_TIMEOUT_MS = 2000;

let auth: AuthState | null = null;

self.addEventListener("install", () => {
  void self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  const data = event.data as IncomingMessage | undefined;
  if (!data || typeof data !== "object") return;

  switch (data.type) {
    case "harmony/auth/set":
      auth = { token: data.token, homeserverOrigin: data.homeserverOrigin };
      break;
    case "harmony/auth/clear":
      auth = null;
      break;
    // A hard-reloaded page loads uncontrolled, and an already-active worker
    // won't re-run `activate` (so its `clients.claim()` never re-fires). The
    // page pings us to claim it, which fires `controllerchange` on its side.
    case "harmony/claim":
      void self.clients.claim();
      break;
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Same-origin gateway: /_media/{download,thumbnail}/{server}/{id} rewrites to
  // the homeserver's authed-media endpoint. The page stays same-origin; the SW
  // does the cross-origin authed fetch.
  if (url.origin === self.location.origin && url.pathname.startsWith(LOCAL_MEDIA_PREFIX)) {
    event.respondWith(handleLocalMediaFetch(request, url));
  }
});

async function handleLocalMediaFetch(request: Request, url: URL): Promise<Response> {
  let current = auth ?? (await recoverAuthFromClients());
  if (!current) return fetch(request);

  // Swap the /_media/ prefix for the homeserver authed-media base, preserving
  // the verb/server/id tail and query (width/height/method/allow_redirect).
  const tail = url.pathname.slice(LOCAL_MEDIA_PREFIX.length) + url.search;
  const target = `${current.homeserverOrigin}${AUTHED_MEDIA_PREFIX}${tail}`;
  // Clone method + headers (incl. Range) onto the rewritten URL.
  const rewritten = new Request(target, request);

  const response = await fetchWithAuth(rewritten, current.token);
  if (response.status !== 401) return response;

  // Token was missing or stale — drop it, re-request from the page, retry once.
  // Covers the first-paint race where the auth message hadn't reached the SW
  // before the page started requesting media.
  auth = null;
  current = await recoverAuthFromClients();
  if (!current) return response;

  return fetchWithAuth(rewritten, current.token);
}

function fetchWithAuth(request: Request, token: string): Promise<Response> {
  return fetch(request.url, {
    method: request.method,
    headers: withAuth(request.headers, token),
    mode: "cors",
    credentials: "omit",
  });
}

function withAuth(original: Headers, token: string): Headers {
  const headers = new Headers(original);
  headers.set("Authorization", `Bearer ${token}`);
  return headers;
}

let recovering: Promise<AuthState | null> | null = null;

function recoverAuthFromClients(): Promise<AuthState | null> {
  // Dedupe concurrent recoveries so a burst of media requests on first paint
  // doesn't fan out into one token round-trip per request.
  recovering ??= doRecoverAuthFromClients().finally(() => {
    recovering = null;
  });
  return recovering;
}

async function doRecoverAuthFromClients(): Promise<AuthState | null> {
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  if (clients.length === 0) return null;

  const reply = await requestTokenFromClient(clients[0]);
  if (!reply || !reply.token || !reply.homeserverOrigin) return null;

  auth = { token: reply.token, homeserverOrigin: reply.homeserverOrigin };
  return auth;
}

function requestTokenFromClient(
  client: Client,
): Promise<{ token: string | null; homeserverOrigin: string | null } | null> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timeout = setTimeout(() => resolve(null), REQUEST_TOKEN_TIMEOUT_MS);

    channel.port1.onmessage = (event: MessageEvent<IncomingMessage>) => {
      clearTimeout(timeout);
      if (event.data?.type === "harmony/auth/reply") {
        resolve({
          token: event.data.token,
          homeserverOrigin: event.data.homeserverOrigin,
        });
      } else {
        resolve(null);
      }
    };

    client.postMessage({ type: "harmony/auth/request" }, [channel.port2]);
  });
}
