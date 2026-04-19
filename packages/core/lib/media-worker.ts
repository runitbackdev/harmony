type GetAuth = () => { token: string; homeserverOrigin: string } | null;

type IncomingRequest = { type: "harmony/auth/request" };

function post(message: unknown) {
  navigator.serviceWorker?.controller?.postMessage(message);
}

export function setMediaAuth(token: string, homeserverOrigin: string) {
  post({ type: "harmony/auth/set", token, homeserverOrigin });
}

export function clearMediaAuth() {
  post({ type: "harmony/auth/clear" });
}

export function listenForTokenRequests(getAuth: GetAuth) {
  if (typeof navigator === "undefined" || !navigator.serviceWorker) return;

  navigator.serviceWorker.addEventListener("message", (event) => {
    const data = event.data as IncomingRequest | undefined;
    if (data?.type !== "harmony/auth/request") return;

    const port = event.ports[0];
    if (!port) return;

    const current = getAuth();
    port.postMessage({
      type: "harmony/auth/reply",
      token: current?.token ?? null,
      homeserverOrigin: current?.homeserverOrigin ?? null,
    });
  });

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    const current = getAuth();
    if (current) setMediaAuth(current.token, current.homeserverOrigin);
  });
}
