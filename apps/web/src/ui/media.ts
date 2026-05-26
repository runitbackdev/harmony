const HOMESERVER_URL = import.meta.env.VITE_HOMESERVER_URL ?? "https://chat.lycanthropy.dev";

export type ThumbnailSize = 32 | 96 | 320;

export function mxcToHttpThumbnail(mxc: string | null, size: ThumbnailSize): string | null {
  if (!mxc || !mxc.startsWith("mxc://")) return null;

  const [serverName, mediaId] = mxc.slice("mxc://".length).split("/", 2);
  if (!serverName || !mediaId) return null;

  const url = new URL(
    `/_matrix/client/v1/media/thumbnail/${serverName}/${mediaId}`,
    HOMESERVER_URL,
  );
  url.searchParams.set("width", String(size));
  url.searchParams.set("height", String(size));
  url.searchParams.set("method", "crop");
  url.searchParams.set("allow_redirect", "true");
  return url.toString();
}
