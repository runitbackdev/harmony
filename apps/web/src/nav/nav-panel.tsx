import { SpaceRail } from "./space-rail";
import { RoomSidebar } from "./room-sidebar";
import { useParams } from "@tanstack/react-router";

interface NavPanelProps {
  /** Called after the user picks a space or room. Used by mobile to close the drawer. */
  onAfterNavigate?: () => void;
}

/**
 * Mobile navigation panel combining space rail and room sidebar.
 * Used within a Drawer for mobile responsiveness.
 */
export function NavPanel({ onAfterNavigate }: NavPanelProps) {
  const { spaceId } = useParams({ strict: false });

  return (
    <>
      <SpaceRail onAfterNavigate={onAfterNavigate} />
      {spaceId && <RoomSidebar spaceId={spaceId} onAfterNavigate={onAfterNavigate} />}
    </>
  );
}
