import { Avatar } from "@runitback/react";
import { getInitials } from "../utils";
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

  return <Avatar src={src} initials={getInitials(name)} alt={alt ?? name} className={className} />;
}

export { MxAvatar };
