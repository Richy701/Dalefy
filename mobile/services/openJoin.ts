import { router } from "expo-router";

let lastOpen = 0;

/** Open the Join sheet once: navigate (not push) so an open sheet is reused, and ignore repeat taps while it animates in. */
export function openJoinSheet() {
  const now = Date.now();
  if (now - lastOpen < 800) return;
  lastOpen = now;
  router.navigate("/join");
}
