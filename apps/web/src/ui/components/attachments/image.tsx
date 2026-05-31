import { useState } from "react";
import Lightbox from "./lightbox";
import { ImageOff, Loader2 } from "lucide-react";
import { mxcToHttp } from "../../media";
import { cn } from "../../utils";
import type { Attachment } from "@harmony/wasm";

// Matches the `max-w-sm` / `max-h-80` bounds applied to the <img> below.
const MAX_WIDTH = 384;
const MAX_HEIGHT = 320;

export default function AttachmentImage({ attachment }: { attachment: Attachment }) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [expanded, setExpanded] = useState<boolean>(false);

  const info = attachment.info as { width?: number; height?: number } | undefined;
  const width = info?.width ?? 400;
  const height = info?.height ?? 320;
  const name = attachment.filename ?? attachment.body;
  const src = mxcToHttp(attachment.url ?? null);

  // The box the image will occupy once loaded (object-contain within the bounds).
  // Used to size the error state when there's no <img> in the tree to reserve it.
  const scale = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height, 1);
  const displayWidth = Math.round(width * scale);
  const displayHeight = Math.round(height * scale);

  const loaded = status === "loaded";
  const failed = !src || status === "error";

  return (
    <>
      <button
        type="button"
        style={!src ? { width: displayWidth, height: displayHeight } : undefined}
        className={cn(
          "relative mt-1 inline-block max-w-sm overflow-hidden rounded-lg border transition-opacity",
          failed ? "border-error-500/30" : "border-surface-200-800",
          loaded ? "cursor-zoom-in hover:opacity-95" : "cursor-default",
        )}
        aria-label={`View full size ${name}`}
        onClick={() => loaded && setExpanded(true)}
      >
        {status === "loading" && src && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-surface-100-900">
            <Loader2 className="h-6 w-6 animate-spin text-surface-500" />
          </div>
        )}

        {failed && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1 bg-error-500/10 p-4 text-center">
            <ImageOff className="h-6 w-6 text-error-500" />
            <span className="max-w-full truncate text-xs font-medium text-error-500">
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
            className={cn("block max-h-80 max-w-sm object-contain", !loaded && "opacity-0")}
            decoding="async"
            onLoad={() => setStatus("loaded")}
            onError={() => setStatus("error")}
          />
        )}
      </button>

      {loaded && src && (
        <Lightbox src={src} name={name ?? ""} open={expanded} onClose={() => setExpanded(false)} />
      )}
    </>
  );
}
