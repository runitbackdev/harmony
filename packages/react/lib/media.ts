import { rpc } from "@harmony/core";

export async function mediaUpload(file: File) {
  const result = await rpc("media.upload", {
    contentType: file.type || "application/octet-stream",
    data: Array.from(await file.bytes()),
  });
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}
