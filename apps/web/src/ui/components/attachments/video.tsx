import type { Attachment } from "@harmony/wasm";
import { Loader2 } from "lucide-react";
import { useMediaBlob } from "../../hooks/use-media-blob";

export default function AttachmentVideo({ attachment }: { attachment: Attachment }) {
  const { status, url } = useMediaBlob(attachment.url ?? null);

  const info = attachment.info as { width?: number; height?: number } | undefined;
  const name = attachment.filename ?? attachment.body;

  if (status === "error") {
    return (
      <div className="mt-1 max-w-sm rounded-lg border border-surface-200-800 px-3 py-2 text-xs text-surface-500">
        Failed to load video
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="mt-1 flex h-40 max-w-sm items-center justify-center rounded-lg border border-surface-200-800 text-surface-500">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <video
      src={url}
      controls
      width={info?.width}
      height={info?.height}
      className="mt-1 max-h-80 max-w-sm rounded-lg"
      aria-label={`Video: ${name}`}
      preload="metadata"
    />
  );
}
