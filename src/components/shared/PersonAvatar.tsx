import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

/**
 * A traveller's photo when the directory has one, their initials when it doesn't. The same circle on the
 * directory, a trip's traveller list and the phone, so a photo added once shows everywhere.
 */
export function PersonAvatar({ avatar, initials, name, className, fallbackClassName }: {
  avatar?: string | null;
  initials: string;
  name?: string;
  className?: string;
  fallbackClassName?: string;
}) {
  const src = avatar && /^https?:\/\//.test(avatar) ? avatar : undefined;
  return (
    <Avatar className={cn("size-9", className)}>
      {src && <AvatarImage src={src} alt={name ? `${name}'s photo` : ""} />}
      <AvatarFallback className={cn("bg-secondary text-muted-foreground text-xs font-semibold uppercase", fallbackClassName)}>{initials}</AvatarFallback>
    </Avatar>
  );
}
