import { rpc } from "@harmony/core";
import type { Attachment } from "@harmony/core";

export async function mediaUpload(file: File) {
  // serde_wasm_bindgen reads the `Bytes` field straight off this typed array
  // on the worker side; `Array.from` would box every byte into a JS number.
  const data = new Uint8Array(await file.arrayBuffer());
  const result = await rpc("media.upload", {
    contentType: file.type || "application/octet-stream",
    data,
  });
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

export function buildAttachment(file: File, mxcUrl: string): Attachment {
  const mimetype = file.type || "application/octet-stream";
  const info = { width: null, height: null, durationMs: null, size: file.size, mimetype };
  const base = {
    body: file.name,
    filename: null,
    url: mxcUrl,
    file: null,
    format: null,
    formattedBody: null,
    info,
  };
  switch (mimetype.split("/")[0]) {
    case "image":
      return { ...base, msgtype: "m.image" };
    case "video":
      return { ...base, msgtype: "m.video" };
    case "audio":
      return { ...base, msgtype: "m.audio" };
    default:
      return { ...base, msgtype: "m.file", filename: file.name };
  }
}
