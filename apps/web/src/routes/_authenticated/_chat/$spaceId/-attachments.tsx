import type { Attachment } from "@harmony/core";

export function buildAttachment(file: File, mxcUrl: string): Attachment {
  const mimetype = file.type || "application/octet-stream";
  const info = { mimetype, size: file.size };
  switch (mimetype.split("/")[0]) {
    case "image":
      return { msgtype: "m.image", body: file.name, url: mxcUrl, info };
    case "video":
      return { msgtype: "m.video", body: file.name, url: mxcUrl, info };
    case "audio":
      return { msgtype: "m.audio", body: file.name, url: mxcUrl, info };
    default:
      return { msgtype: "m.file", body: file.name, filename: file.name, url: mxcUrl, info };
  }
}
