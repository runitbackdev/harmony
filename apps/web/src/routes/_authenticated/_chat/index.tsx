import { createFileRoute, redirect } from "@tanstack/react-router";
import { getFirstSpace, subscribeSpaces } from "@harmony/react";

export const Route = createFileRoute("/_authenticated/_chat/")({
  loader: async () => {
    await subscribeSpaces();
    const first = getFirstSpace();
    if (!first) return;
    throw redirect({ to: "/$spaceId", params: { spaceId: first.roomId } });
  },
  component: NoSpaces,
});

function NoSpaces() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <p className="text-sm text-surface-500">No spaces yet — create one to get started.</p>
    </div>
  );
}
