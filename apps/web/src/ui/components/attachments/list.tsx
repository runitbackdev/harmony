import type { Attachment } from "@harmony/harmony-bindings-web";
import AttachmentAudio from "./audio";
import AttachmentFile from "./file";
import AttachmentImage from "./image";
import AttachmentVideo from "./video";

export default function AttachmentList({ attachments }: { attachments: Attachment[] }) {
  if (attachments.length === 0) return null;

  return (
    <div data-scope="attachment" data-part="list" className="flex flex-col">
      {attachments.map((attachment, i) => {
        switch (attachment.msgtype) {
          case "m.image":
            return <AttachmentImage key={i} attachment={attachment} />;
          case "m.video":
            return <AttachmentVideo key={i} attachment={attachment} />;
          case "m.audio":
            return <AttachmentAudio key={i} attachment={attachment} />;
          case "m.file":
            return <AttachmentFile key={i} attachment={attachment} />;
          default:
            return null;
        }
      })}
    </div>
  );
}
