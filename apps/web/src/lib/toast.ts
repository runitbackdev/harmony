import { createToaster } from "@skeletonlabs/skeleton-react";

export const toaster = createToaster({
  placement: "bottom-end",
  overlap: false,
  duration: 4000,
  max: 5,
});

export const toast = {
  info: (title: string, description?: string) =>
    toaster.create({ title, description, type: "info" }),
  success: (title: string, description?: string) =>
    toaster.create({ title, description, type: "success" }),
  error: (title: string, description?: string) =>
    toaster.create({ title, description, type: "error" }),
};

export function notImplemented(): void {
  toast.info("Not implemented yet");
}
