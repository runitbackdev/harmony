import type { Attachment } from "@harmony/wasm";
import { Loader2 } from "lucide-react";
import { useMediaBlob } from "../../hooks/use-media-blob";

export default function AttachmentAudio({ attachment }: { attachment: Attachment }) {
  const { status, url } = useMediaBlob(attachment.url ?? null);
  const name = attachment.filename ?? attachment.body;

  if (status === "error") {
    return (
      <div className="mt-1 max-w-sm rounded-lg border border-surface-200-800 px-3 py-2 text-xs text-surface-500">
        Failed to load audio
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="mt-1 flex h-9 max-w-sm items-center gap-2 rounded-lg border border-surface-200-800 px-3 text-xs text-surface-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading audio…
      </div>
    );
  }

  return (
    <audio
      src={url}
      controls
      className="mt-1 w-full max-w-sm"
      aria-label={`Audio: ${name}`}
      preload="metadata"
    />
  );
}
