import { File, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type AttachmentPickerProps = {
  onAttachment: (file: File) => void;
};

export function AttachmentPickerButton({ onAttachment }: AttachmentPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        type="file"
        multiple
        ref={inputRef}
        onChange={(e) => {
          Array.from(e.target.files ?? []).forEach(onAttachment);
          e.target.value = "";
        }}
        style={{ display: "none" }}
      />
      <button
        type="button"
        data-scope="attachment-picker"
        data-part="trigger"
        onClick={() => inputRef.current?.click()}
        aria-label="Attach files"
      >
        <Plus />
      </button>
    </>
  );
}

type ChipProps = {
  file: File;
  onRemove: () => void;
};

export function AttachmentChip({ file, onRemove }: ChipProps) {
  const isImage = file.type.startsWith("image/");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isImage) return;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file, isImage]);

  return (
    <div data-scope="attachment-chip" data-part="root">
      {previewUrl ? (
        <img src={previewUrl} alt={file.name} data-scope="attachment-chip" data-part="thumbnail" />
      ) : (
        <File data-scope="attachment-chip" data-part="file-icon" />
      )}
      <span data-scope="attachment-chip" data-part="name" title={file.name}>
        {file.name}
      </span>
      <button
        type="button"
        aria-label={`Remove ${file.name}`}
        onClick={onRemove}
        data-scope="attachment-chip"
        data-part="remove"
      >
        <X data-part="remove" />
      </button>
    </div>
  );
}
