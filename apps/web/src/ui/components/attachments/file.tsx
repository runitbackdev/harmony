import { useState } from "react";
import type { Attachment } from "@harmony/wasm";
import { Loader2 } from "lucide-react";
import { mxcToHttp } from "../../media";
import { cn, formatBytes } from "../../utils";

export default function AttachmentFile({ attachment }: { attachment: Attachment }) {
  const name = attachment.filename ?? attachment.body;
  const info = attachment.info as { size?: number; mimetype?: string } | undefined;
  const { size, mimetype } = info ?? {};
  const src = mxcToHttp(attachment.url ?? null);

  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    if (!src || downloading) return;
    setDownloading(true);
    try {
      // Fetch through the service worker (which injects auth) and download from a
      // same-origin blob URL — a cross-origin `<a download>` would bypass the
      // worker and ignore the download hint.
      const res = await fetch(src);
      if (!res.ok) throw new Error(`download failed: ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name ?? "download";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // Swallow — the button returns to its idle state and the user can retry.
    } finally {
      setDownloading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={!src || downloading}
      data-scope="attachment"
      data-part="file"
      className={cn(
        "mt-1 flex max-w-sm items-center gap-3 rounded-lg border border-surface-200-800 px-3 py-2",
        "text-left text-sm text-surface-800-200 transition-colors",
        src
          ? "hover:border-surface-400-600 hover:text-surface-950-50"
          : "cursor-default opacity-60",
      )}
      aria-label={`Download ${name}`}
    >
      <svg
        aria-hidden="true"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="shrink-0 text-surface-400"
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
      <div className="min-w-0">
        <div className="truncate font-medium">{name}</div>
        {(size != null || mimetype) && (
          <div className="text-xs text-surface-500">
            {[mimetype, size != null ? formatBytes(size) : null].filter(Boolean).join(" · ")}
          </div>
        )}
      </div>
      {src &&
        (downloading ? (
          <Loader2 className="ml-auto h-3.5 w-3.5 shrink-0 animate-spin text-surface-400" />
        ) : (
          <svg
            aria-hidden="true"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="ml-auto shrink-0 text-surface-400"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        ))}
    </button>
  );
}
