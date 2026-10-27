import type { ImageFocalPoint } from "@/types";

/** CSS object-position for a cover or event photo. Undefined keeps the browser's centred crop. */
export function objectPosition(pos?: ImageFocalPoint | null): string | undefined {
  return pos ? `${pos.x}% ${pos.y}%` : undefined;
}
