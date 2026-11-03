import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "daf-coordinating-trips";
let ids = new Set<string>();
const listeners = new Set<() => void>();

// Kept on the device so leader details don't vanish offline, like the last known trip role
const ready = AsyncStorage.getItem(KEY)
  .then(raw => { if (raw) { ids = new Set(JSON.parse(raw) as string[]); listeners.forEach(notify => notify()); } })
  .catch(() => {});

function publish(next: Set<string>) {
  ids = next;
  AsyncStorage.setItem(KEY, JSON.stringify([...next])).catch(() => {});
  listeners.forEach(notify => notify());
}

/** The full list from the server: anything missing has been taken away. */
export function setCoordinating(next: string[]) {
  ready.then(() => publish(new Set(next)));
}

/** One trip's answer from the server, without touching the others. */
export function markCoordinating(tripId: string, on: boolean) {
  ready.then(() => {
    if (ids.has(tripId) === on) return;
    const next = new Set(ids);
    if (on) next.add(tripId); else next.delete(tripId);
    publish(next);
  });
}

export const isCoordinating = (tripId: string | undefined) => !!tripId && ids.has(tripId);

export function subscribeCoordinating(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
