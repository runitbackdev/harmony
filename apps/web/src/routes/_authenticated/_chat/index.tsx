import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/_chat/")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <p className="text-sm text-surface-500">Select a channel to start chatting</p>
    </div>
  );
}
