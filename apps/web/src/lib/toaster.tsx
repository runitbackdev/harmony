import { Toast } from "@/ui";
import { toaster } from "./toast";

export function Toaster() {
  return (
    <Toast.Group toaster={toaster}>
      {(t) => (
        <Toast key={t.id} toast={t}>
          <Toast.Message>
            <Toast.Title>{String(t.title)}</Toast.Title>
            {t.description && <Toast.Description>{String(t.description)}</Toast.Description>}
          </Toast.Message>
          <Toast.CloseTrigger>×</Toast.CloseTrigger>
        </Toast>
      )}
    </Toast.Group>
  );
}
