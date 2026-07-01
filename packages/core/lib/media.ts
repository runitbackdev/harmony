import { IS_DESKTOP } from "./platform";

// Per-target gateway base for plaintext media. Web hits the same-origin
// service-worker route; desktop hits the `media://` custom URI scheme.
const MEDIA_BASE = IS_DESKTOP ? "media://" : "/_media/";

function parseMxc(mxc: string): [server: string, id: string] | null {
  if (!mxc.startsWith("mxc://")) return null;
  const [server, id] = mxc.slice("mxc://".length).split("/", 2);
  return server && id ? [server, id] : null;
}

export function mediaSrc(mxc: string | null): string | null {
  if (!mxc) return null;
  const parsed = parseMxc(mxc);
  if (!parsed) return null;
  const [server, id] = parsed;
  return `${MEDIA_BASE}download/${server}/${id}?allow_redirect=true`;
}

export function mediaThumbnailSrc(mxc: string | null, size: number): string | null {
  if (!mxc) return null;
  const parsed = parseMxc(mxc);
  if (!parsed) return null;
  const [server, id] = parsed;
  const params = new URLSearchParams({
    width: String(size),
    height: String(size),
    method: "crop",
    allow_redirect: "true",
  });
  return `${MEDIA_BASE}thumbnail/${server}/${id}?${params}`;
}
