import { Toast } from "@runitbk/react";

export const toastManager = Toast.createToastManager();

export const toast = {
  info: (title: string, description?: string) =>
    toastManager.add({ title, description, type: "info" }),
  success: (title: string, description?: string) =>
    toastManager.add({ title, description, type: "success" }),
  error: (title: string, description?: string) =>
    toastManager.add({ title, description, type: "error" }),
};

export function notImplemented() {
  toast.info("Not implemented yet");
}
