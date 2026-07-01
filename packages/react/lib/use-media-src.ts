import { useEffect, useState } from "react";
import { isMediaReady, mediaSrc, rpc, whenMediaReady } from "@harmony/core";
import type { Attachment } from "@harmony/core";

export type MediaSrcStatus = "loading" | "loaded" | "error";
export type MediaSrcState = { src: string | null; status: MediaSrcStatus };

// Flips true once plaintext `/_media/` URLs will reach the SW. Lets components
// that build a URL directly (e.g. avatars) hold off until a hard-reloaded page
// is claimed, instead of emitting a URL that 404s.
export function useMediaReady(): boolean {
  const [ready, setReady] = useState(isMediaReady);

  useEffect(() => {
    if (ready) return;
    let cancelled = false;
    whenMediaReady()
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [ready]);

  return ready;
}

// Resolves an attachment to a renderable `src`, hiding the (target × encryption)
// matrix. Plaintext (web `/_media/` or desktop `media://`) resolves synchronously
// from the mxc — seeded into state so there's no loading flash, but only once the
// SW controls the page (`isMediaReady`); a hard-reloaded page is uncontrolled, so
// we hold in `loading` until `whenMediaReady` claims it, else the URL 404s. Encrypted
// media can't be decrypted by the URL schemes (keys live in `file`, not the mxc), so
// it rides `media.fetch` through the bridge on both targets and lands as a blob URL.
export function useMediaSrc(attachment: Attachment): MediaSrcState {
  const needsDecrypt = attachment.file != null;

  const [state, setState] = useState<MediaSrcState>(() =>
    needsDecrypt || !isMediaReady()
      ? { src: null, status: "loading" }
      : { src: mediaSrc(attachment.url), status: "loaded" },
  );

  useEffect(() => {
    if (!needsDecrypt) {
      if (isMediaReady()) {
        setState({ src: mediaSrc(attachment.url), status: "loaded" });
        return;
      }
      let cancelled = false;
      setState({ src: null, status: "loading" });
      whenMediaReady()
        .then(() => {
          if (!cancelled) setState({ src: mediaSrc(attachment.url), status: "loaded" });
        })
        .catch(console.error);
      return () => {
        cancelled = true;
      };
    }

    let objectUrl: string | null = null;
    let cancelled = false;
    setState({ src: null, status: "loading" });

    rpc("media.fetch", {
      file: attachment.file,
      contentType: attachment.info?.mimetype ?? null,
    })
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setState({ src: null, status: "error" });
          return;
        }
        const { bytes, contentType } = result.value;
        objectUrl = URL.createObjectURL(new Blob([bytes], { type: contentType }));
        setState({ src: objectUrl, status: "loaded" });
      })
      .catch(() => {
        if (!cancelled) setState({ src: null, status: "error" });
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [needsDecrypt, attachment.url, attachment.file, attachment.info?.mimetype]);

  return state;
}
