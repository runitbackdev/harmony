import { useSpaces } from "@harmony/react";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/")({
  component: RouteComponent,
});

function RouteComponent() {
  const spaces = useSpaces();

  return (
    <div>
      {spaces.map((space) => (
        <div key={space.roomId}>{space.displayName}</div>
      ))}
    </div>
  );
}
