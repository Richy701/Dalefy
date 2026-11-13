import { useState, useEffect, useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { subscribeToMemberRole, type TripMemberRole } from "@/services/firebaseTrips";
import { isCoordinating, subscribeCoordinating } from "@/services/coordinating";

const ROLE_KEY = "daf-trip-roles";
let rolesCache: Record<string, TripMemberRole> | null = null;
const rolesReady = AsyncStorage.getItem(ROLE_KEY)
  .then(raw => { rolesCache = raw ? JSON.parse(raw) : {}; })
  .catch(() => { rolesCache = {}; });

// "Preview as a traveller": a leader sees the trip as an ordinary traveller would, on this phone only
const PREVIEW_KEY = "daf-traveller-preview";
let previewing = new Set<string>();
const previewListeners = new Set<() => void>();
AsyncStorage.getItem(PREVIEW_KEY)
  .then(raw => { previewing = new Set(raw ? JSON.parse(raw) as string[] : []); previewListeners.forEach(l => l()); })
  .catch(() => {});
function subscribePreview(listener: () => void) {
  previewListeners.add(listener);
  return () => { previewListeners.delete(listener); };
}
export function setTravellerPreview(tripId: string, on: boolean) {
  const next = new Set(previewing);
  if (on) next.add(tripId); else next.delete(tripId);
  previewing = next;
  AsyncStorage.setItem(PREVIEW_KEY, JSON.stringify([...next])).catch(() => {});
  previewListeners.forEach(l => l());
}

function rememberRole(tripId: string, role: TripMemberRole) {
  rolesCache = { ...(rolesCache ?? {}), [tripId]: role };
  AsyncStorage.setItem(ROLE_KEY, JSON.stringify(rolesCache)).catch(() => {});
}

/**
 * Subscribe to the current account's role for a specific trip.
 * Starts from the last role seen on this device so leader-only content
 * does not flicker on launch or vanish offline; live updates replace it.
 */
export function useTripRole(tripId: string | undefined): {
  role: TripMemberRole;
  /** Sees leader-only content; false while previewing as a traveller */
  isLeader: boolean;
  isCoordinator: boolean;
  /** Really a leader or coordinator, so the preview switch is theirs to use */
  canPreview: boolean;
  previewing: boolean;
} {
  const preview = useSyncExternalStore(subscribePreview, () => !!tripId && previewing.has(tripId));
  const isCoordinator = useSyncExternalStore(subscribeCoordinating, () => isCoordinating(tripId));
  const [role, setRole] = useState<TripMemberRole>(() => (tripId && rolesCache?.[tripId]) || "traveler");

  useEffect(() => {
    if (!tripId) return;
    let cancelled = false;
    rolesReady.then(() => {
      const known = rolesCache?.[tripId];
      if (!cancelled && known) setRole(known);
    });
    const unsub = subscribeToMemberRole(tripId, (r) => {
      if (cancelled) return;
      console.log("[useTripRole]", tripId, "role:", r);
      setRole(r);
      rememberRole(tripId, r);
    });
    return () => { cancelled = true; unsub(); };
  }, [tripId]);

  // A coordinator oversees from home and sees what a leader sees; the server decides, this only follows it
  const canPreview = role === "leader" || isCoordinator;
  return { role, isLeader: canPreview && !preview, isCoordinator, canPreview, previewing: canPreview && preview };
}
