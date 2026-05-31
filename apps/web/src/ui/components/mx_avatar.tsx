import { Avatar } from "@skeletonlabs/skeleton-react";
import { cn, getInitials } from "../utils";
import { mxcToHttpThumbnail } from "../media";

interface MxAvatarProps {
  mxc: string | null;
  name: string;
  size?: number;
  alt?: string;
  className?: string;
}

function MxAvatar({ mxc, name, size = 96, alt, className }: MxAvatarProps) {
  const src = mxcToHttpThumbnail(mxc, size);

  return (
    <Avatar className={cn(className)}>
      {src && <Avatar.Image src={src} alt={alt ?? name} />}
      <Avatar.Fallback>{getInitials(name)}</Avatar.Fallback>
    </Avatar>
  );
}

export { MxAvatar };
