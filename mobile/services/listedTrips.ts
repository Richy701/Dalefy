import { useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Trip } from "@/shared/types";

export interface ListedTrip { trip: Trip; travelerId: string | null }

const KEY = "daf-listed-trips-dismissed";
let listed: ListedTrip[] = [];
let dismissed = new Set<string>();
let visible: ListedTrip[] = [];
const listeners = new Set<() => void>();

function publish() {
  visible = listed.filter(t => !dismissed.has(t.trip.id));
  listeners.forEach(notify => notify());
}

// "Not now" and leaving a trip stick on this phone, or the row would come back on every open
AsyncStorage.getItem(KEY)
  .then(raw => { if (raw) { dismissed = new Set(JSON.parse(raw) as string[]); publish(); } })
  .catch(() => {});

/** The published trips an organiser listed this account's email on, from the server's latest answer */
export function setListedTrips(next: ListedTrip[]) {
  listed = next;
  publish();
}

export function dismissListedTrip(tripId: string) {
  dismissed = new Set(dismissed).add(tripId);
  AsyncStorage.setItem(KEY, JSON.stringify([...dismissed])).catch(() => {});
  publish();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export const useListedTrips = () => useSyncExternalStore(subscribe, () => visible);
