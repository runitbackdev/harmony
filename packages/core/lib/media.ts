import { hostTarget } from "./platform";

// Per-target gateway base for plaintext media. Web hits the same-origin
// service-worker route; desktop hits the `media://` custom URI scheme. Mobile
// has neither until the loopback byte-source lands, so callers get null.
function mediaBase() {
  switch (hostTarget()) {
    case "desktop":
      return "media://";
    case "mobile":
      return null;
    default:
      return "/_media/";
  }
}

function parseMxc(mxc: string): [server: string, id: string] | null {
  if (!mxc.startsWith("mxc://")) return null;
  const [server, id] = mxc.slice("mxc://".length).split("/", 2);
  return server && id ? [server, id] : null;
}

export function mediaSrc(mxc: string | null): string | null {
  if (!mxc) return null;
  const base = mediaBase();
  if (!base) return null;
  const parsed = parseMxc(mxc);
  if (!parsed) return null;
  const [server, id] = parsed;
  return `${base}download/${server}/${id}?allow_redirect=true`;
}

export function mediaThumbnailSrc(mxc: string | null, size: number): string | null {
  if (!mxc) return null;
  const base = mediaBase();
  if (!base) return null;
  const parsed = parseMxc(mxc);
  if (!parsed) return null;
  const [server, id] = parsed;
  const params = new URLSearchParams({
    width: String(size),
    height: String(size),
    method: "crop",
    allow_redirect: "true",
  });
  return `${base}thumbnail/${server}/${id}?${params}`;
}
