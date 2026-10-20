import { router } from "expo-router";

let lastOpen = 0;

/** Open a sheet once: navigate (not push) so an open sheet is reused, and swallow an accidental double tap. Kept short so reopening right after closing never feels ignored. */
export function openSheet(path: "/join" | "/notifications") {
  const now = Date.now();
  if (now - lastOpen < 350) return;
  lastOpen = now;
  router.navigate(path);
}

export function openJoinSheet() {
  openSheet("/join");
}
