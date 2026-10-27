import type { ImageFocalPoint } from "./types";

/** expo-image contentPosition for a hero photo: the focal point chosen on web, else the app's usual slightly-high crop. */
export function heroPosition(pos?: ImageFocalPoint | null): { top: string; left: string } {
  return pos ? { top: `${pos.y}%`, left: `${pos.x}%` } : { top: "35%", left: "50%" };
}
