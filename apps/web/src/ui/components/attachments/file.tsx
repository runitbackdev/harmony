import type { Attachment } from "@harmony/harmony-bindings-web";
import { Loader2 } from "lucide-react";
import { useMediaSrc } from "@harmony/react";
import { cn, formatBytes } from "../../utils";

export default function AttachmentFile({ attachment }: { attachment: Attachment }) {
  const name = attachment.filename ?? attachment.body;
  const info = attachment.info as { size?: number; mimetype?: string } | undefined;
  const { size, mimetype } = info ?? {};

  // src is same-origin (/_media/ or a blob: URL), so <a download> honors the
  // filename and the SW still injects auth — no manual fetch/blob/click needed.
  const { src, status } = useMediaSrc(attachment);
  const loading = status === "loading";
  const ready = status === "loaded" && !!src;

  return (
    <a
      href={src ?? undefined}
      download={name ?? "download"}
      aria-disabled={!ready}
      data-scope="attachment"
      data-part="file"
      className={cn(
        "mt-1 flex max-w-sm items-center gap-3 rounded-lg border border-surface-200-800 px-3 py-2",
        "text-left text-sm text-surface-800-200 transition-colors",
        ready
          ? "hover:border-surface-400-600 hover:text-surface-950-50"
          : "pointer-events-none cursor-default opacity-60",
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
      {loading ? (
        <Loader2 className="ml-auto h-3.5 w-3.5 shrink-0 animate-spin text-surface-400" />
      ) : (
        ready && (
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
        )
      )}
    </a>
  );
}
