let url = "http://localhost:8008";

export function configureHomeserver(next: string) {
  url = next;
}

export function homeserverUrl() {
  return url;
}

// Sliced rather than `new URL(url).origin` — React Native's URL polyfill has
// historically shipped without `.origin`.
export function homeserverOrigin() {
  const scheme = url.indexOf("://");
  if (scheme === -1) return url;
  const slash = url.indexOf("/", scheme + 3);
  return slash === -1 ? url : url.slice(0, slash);
}
