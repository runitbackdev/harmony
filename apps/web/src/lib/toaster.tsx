import { X } from "lucide-react";
import { Toast } from "@runitback/react";
import { toastManager } from "./toast";

function ToastList() {
  const { toasts } = Toast.useToastManager();

  return toasts.map((toast) => (
    <Toast.Root key={toast.id} toast={toast}>
      <Toast.Content>
        <div className="flex flex-col gap-0.5">
          <Toast.Title />
          <Toast.Description />
        </div>
        <Toast.Close
          aria-label="Close"
          className="ml-auto cursor-pointer text-bg/60 transition-colors hover:text-bg"
        >
          <X size={14} />
        </Toast.Close>
      </Toast.Content>
    </Toast.Root>
  ));
}

export function Toaster() {
  return (
    <Toast.Provider toastManager={toastManager}>
      <Toast.Portal>
        <Toast.Viewport>
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  );
}
