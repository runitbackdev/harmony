import { useCallback, useRef, useState } from "react";

function hasFiles(dt: DataTransfer): boolean {
  return Array.from(dt.types).includes("Files");
}

export function useDropZone(onDrop: (files: File[]) => void) {
  const [isDragging, setIsDragging] = useState(false);
  // Counter tracks nested dragenter/dragleave pairs so we don't flicker
  // when the pointer moves between child elements.
  const depth = useRef(0);

  const onDragEnter = useCallback((e: React.DragEvent) => {
    if (!hasFiles(e.dataTransfer)) return;
    e.preventDefault();
    depth.current += 1;
    if (depth.current === 1) setIsDragging(true);
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    if (depth.current === 0) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    if (depth.current === 0) return;
    e.preventDefault();
    depth.current -= 1;
    if (depth.current === 0) setIsDragging(false);
  }, []);

  const onDropHandler = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      depth.current = 0;
      setIsDragging(false);
      const files = Array.from(e.dataTransfer.files).filter((f) => f.size > 0);
      if (files.length > 0) onDrop(files);
    },
    [onDrop],
  );

  return {
    isDragging,
    dropZoneProps: {
      onDragEnter,
      onDragOver,
      onDragLeave,
      onDrop: onDropHandler,
    },
  };
}
