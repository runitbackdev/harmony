import { Avatar } from "@skeletonlabs/skeleton-react";
import { cn, getInitials } from "../utils";
import { mediaThumbnailSrc } from "@harmony/core";
import { useMediaReady } from "@harmony/react";

interface MxAvatarProps {
  mxc: string | null;
  name: string;
  size?: number;
  alt?: string;
  className?: string;
}

function MxAvatar({ mxc, name, size = 96, alt, className }: MxAvatarProps) {
  // Hold the thumbnail URL until the SW controls the page; until then show the
  // initials fallback rather than emitting a URL that 404s on a hard reload.
  const src = useMediaReady() ? mediaThumbnailSrc(mxc, size) : null;

  return (
    <Avatar className={cn(className)}>
      {src && <Avatar.Image src={src} alt={alt ?? name} />}
      <Avatar.Fallback>{getInitials(name)}</Avatar.Fallback>
    </Avatar>
  );
}

export { MxAvatar };
