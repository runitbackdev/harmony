/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope;

type AuthState = {
  token: string;
  homeserverOrigin: string;
};

type IncomingMessage =
  | { type: "harmony/auth/set"; token: string; homeserverOrigin: string }
  | { type: "harmony/auth/clear" }
  | { type: "harmony/auth/reply"; token: string | null; homeserverOrigin: string | null };

const AUTHED_MEDIA_PREFIX = "/_matrix/client/v1/media/";
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
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (!url.pathname.startsWith(AUTHED_MEDIA_PREFIX)) return;

  event.respondWith(handleMediaFetch(request, url));
});

async function handleMediaFetch(request: Request, url: URL): Promise<Response> {
  const current = auth ?? (await recoverAuthFromClients());

  if (!current || url.origin !== current.homeserverOrigin) {
    return fetch(request);
  }

  const headers = withAuth(request.headers, current.token);

  return fetch(request.url, {
    method: request.method,
    headers,
    mode: "cors",
    credentials: "omit",
  });
}

function withAuth(original: Headers, token: string): Headers {
  const headers = new Headers(original);
  headers.set("Authorization", `Bearer ${token}`);
  return headers;
}

async function recoverAuthFromClients(): Promise<AuthState | null> {
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: false });
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
