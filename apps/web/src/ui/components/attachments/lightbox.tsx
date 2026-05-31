import { X } from "lucide-react";
import { Dialog } from "../dialog";

export default function Lightbox({
  src,
  name,
  open,
  onClose,
}: {
  src: string;
  name: string;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(details) => !details.open && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="bg-black/90 backdrop-blur-sm" />
        <Dialog.Positioner>
          <Dialog.Content className="relative flex max-h-[90vh] w-auto max-w-[95vw] items-center justify-center rounded-none border-0 bg-transparent p-0 shadow-none">
            <Dialog.Title className="sr-only">{name || "Image"}</Dialog.Title>
            <div className="absolute top-0 right-0 left-0 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent p-4 text-white">
              <span className="max-w-[70%] truncate text-sm font-medium">{name}</span>
              <Dialog.CloseTrigger className="static rounded-full p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white">
                <X className="h-6 w-6" />
              </Dialog.CloseTrigger>
            </div>

            <img
              src={src}
              alt={name}
              className="mx-auto max-h-[85vh] max-w-[95vw] select-none rounded object-contain"
            />
          </Dialog.Content>
        </Dialog.Positioner>
      </Dialog.Portal>
    </Dialog>
  );
}
