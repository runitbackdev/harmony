import { hostTarget } from "./platform";

type AuthInfo = { token: string; homeserverOrigin: string } | null;
type GetAuth = () => AuthInfo | Promise<AuthInfo>;

type IncomingRequest = { type: "harmony/auth/request" };

// Past this, give up waiting for control and emit the URL anyway — it may 404,
// but a stuck spinner is worse than a visible error.
const CLAIM_TIMEOUT_MS = 3000;

function post(message: unknown) {
  navigator.serviceWorker?.controller?.postMessage(message);
}

export function setMediaAuth(token: string, homeserverOrigin: string) {
  post({ type: "harmony/auth/set", token, homeserverOrigin });
}

export function clearMediaAuth() {
  post({ type: "harmony/auth/clear" });
}

// True when plaintext `/_media/` URLs are safe to render: any non-web host (no
// SW needed) or a web page already controlled by the worker. False on a fresh
// hard reload, where the page is uncontrolled until we claim it.
export function isMediaReady(): boolean {
  if (hostTarget() !== "web") return true;
  if (typeof navigator === "undefined" || !navigator.serviceWorker) return true;
  return navigator.serviceWorker.controller != null;
}

let readyPromise: Promise<void> | null = null;

// Resolves once `/_media/` requests will hit the SW. On a hard reload this
// nudges the active worker to claim us and waits for `controllerchange`.
export function whenMediaReady(): Promise<void> {
  if (isMediaReady()) return Promise.resolve();
  readyPromise ??= ensureControlled();
  return readyPromise;
}

async function ensureControlled(): Promise<void> {
  const sw = navigator.serviceWorker;
  const reg = await sw.ready;
  if (sw.controller) return;

  reg.active?.postMessage({ type: "harmony/claim" });

  await new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      sw.removeEventListener("controllerchange", done);
      resolve();
    };
    const timer = setTimeout(done, CLAIM_TIMEOUT_MS);
    sw.addEventListener("controllerchange", done);
  });
}

export function listenForTokenRequests(getAuth: GetAuth) {
  if (typeof navigator === "undefined" || !navigator.serviceWorker) return;

  navigator.serviceWorker.addEventListener("message", async (event) => {
    const data = event.data as IncomingRequest | undefined;
    if (data?.type !== "harmony/auth/request") return;

    const port = event.ports[0];
    if (!port) return;

    const current = await getAuth();
    port.postMessage({
      type: "harmony/auth/reply",
      token: current?.token ?? null,
      homeserverOrigin: current?.homeserverOrigin ?? null,
    });
  });

  navigator.serviceWorker.addEventListener("controllerchange", async () => {
    const current = await getAuth();
    if (current) setMediaAuth(current.token, current.homeserverOrigin);
  });
}
