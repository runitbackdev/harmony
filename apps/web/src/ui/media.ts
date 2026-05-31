import { HOMESERVER_ORIGIN } from "@harmony/core";

function parseMxcUrl(mxc: string): string[] {
  return mxc.slice("mxc://".length).split("/", 2);
}

export function mxcToHttp(mxc: string | null): string | null {
  if (!mxc || !mxc.startsWith("mxc://")) return null;

  const [serverName, mediaId] = parseMxcUrl(mxc);
  if (!serverName || !mediaId) return null;

  return `${HOMESERVER_ORIGIN}/_matrix/client/v1/media/download/${serverName}/${mediaId}?allow_redirect=true`;
}

export function mxcToHttpThumbnail(mxc: string | null, size: number): string | null {
  if (!mxc || !mxc.startsWith("mxc://")) return null;

  const [serverName, mediaId] = parseMxcUrl(mxc);
  if (!serverName || !mediaId) return null;

  const params = new URLSearchParams({
    width: String(size),
    height: String(size),
    method: "crop",
    allow_redirect: "true",
  });

  return `${HOMESERVER_ORIGIN}/_matrix/client/v1/media/thumbnail/${serverName}/${mediaId}?${params}`;
}
