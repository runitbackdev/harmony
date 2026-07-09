import { useState } from "react";
import Lightbox from "./lightbox";
import { ImageOff, Loader2 } from "lucide-react";
import { useMediaSrc } from "@harmony/react";
import { cn, mediaDisplaySize, MEDIA_MAX_WIDTH, MEDIA_MAX_HEIGHT } from "../../utils";
import type { Attachment } from "@harmony/harmony-bindings-web";

export default function AttachmentImage({ attachment }: { attachment: Attachment }) {
  // Resolving the src (sync for plaintext, async decrypt for encrypted) and
  // decoding the <img> are two phases; track them separately and combine.
  const { src, status: srcStatus } = useMediaSrc(attachment);
  const [imgStatus, setImgStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [expanded, setExpanded] = useState<boolean>(false);

  const info = attachment.info as { width?: number; height?: number } | undefined;
  const width = info?.width ?? 400;
  const height = info?.height ?? 320;
  const name = attachment.filename ?? attachment.body;

  // Reserve the box before the src resolves so the row height is stable.
  const { width: displayWidth, height: displayHeight } = mediaDisplaySize(width, height);

  const loaded = srcStatus === "loaded" && !!src && imgStatus === "loaded";
  const failed =
    srcStatus === "error" || imgStatus === "error" || (srcStatus !== "loading" && !src);
  const loading = !loaded && !failed;

  return (
    <>
      <button
        type="button"
        style={
          !src ? { width: displayWidth, height: displayHeight } : { maxWidth: MEDIA_MAX_WIDTH }
        }
        className={cn(
          "relative mt-1 inline-block overflow-hidden rounded-lg border transition-opacity",
          failed ? "border-danger/30" : "border-line",
          loaded ? "cursor-zoom-in hover:opacity-95" : "cursor-default",
        )}
        aria-label={`View full size ${name}`}
        onClick={() => loaded && setExpanded(true)}
      >
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-surface">
            <Loader2 className="h-6 w-6 animate-spin text-sub" />
          </div>
        )}

        {failed && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1 bg-danger/10 p-4 text-center">
            <ImageOff className="h-6 w-6 text-danger" />
            <span className="max-w-full truncate text-data font-medium text-danger">
              Failed to load image
            </span>
          </div>
        )}

        {src && (
          <img
            src={src}
            alt={name || "Image attachment"}
            width={width}
            height={height}
            style={{ maxWidth: MEDIA_MAX_WIDTH, maxHeight: MEDIA_MAX_HEIGHT }}
            className={cn("block object-contain", !loaded && "opacity-0")}
            decoding="async"
            onLoad={() => setImgStatus("loaded")}
            onError={() => setImgStatus("error")}
          />
        )}
      </button>

      {loaded && src && (
        <Lightbox src={src} name={name ?? ""} open={expanded} onClose={() => setExpanded(false)} />
      )}
    </>
  );
}
