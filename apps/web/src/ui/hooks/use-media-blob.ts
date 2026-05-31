import { useEffect, useState } from "react";
import { mxcToHttp } from "../media";

type MediaBlobState =
  | { status: "loading"; url: null }
  | { status: "loaded"; url: string }
  | { status: "error"; url: null };

// Fetches authenticated media through the service worker (which injects the
// access token) and exposes it as a same-origin object URL. Use this for
// <audio>/<video> elements and downloads, where a cross-origin element `src`
// or navigation would bypass the worker's auth and 401.
export function useMediaBlob(mxc: string | null): MediaBlobState {
  const [state, setState] = useState<MediaBlobState>({ status: "loading", url: null });

  useEffect(() => {
    const src = mxcToHttp(mxc);
    if (!src) {
      setState({ status: "error", url: null });
      return;
    }

    let objectUrl: string | null = null;
    let cancelled = false;
    setState({ status: "loading", url: null });

    fetch(src)
      .then((res) => {
        if (!res.ok) throw new Error(`media fetch failed: ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ status: "loaded", url: objectUrl });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error", url: null });
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [mxc]);

  return state;
}
