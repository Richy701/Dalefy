import { useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { subscribeToMemberRole, type TripMemberRole } from "@/services/firebaseTrips";

const ROLE_KEY = "daf-trip-roles";
let rolesCache: Record<string, TripMemberRole> | null = null;
const rolesReady = AsyncStorage.getItem(ROLE_KEY)
  .then(raw => { rolesCache = raw ? JSON.parse(raw) : {}; })
  .catch(() => { rolesCache = {}; });

function rememberRole(tripId: string, role: TripMemberRole) {
  rolesCache = { ...(rolesCache ?? {}), [tripId]: role };
  AsyncStorage.setItem(ROLE_KEY, JSON.stringify(rolesCache)).catch(() => {});
}

/**
 * Subscribe to the current account's role for a specific trip.
 * Starts from the last role seen on this device so leader-only content
 * does not flicker on launch or vanish offline; live updates replace it.
 */
export function useTripRole(tripId: string | undefined): { role: TripMemberRole; isLeader: boolean } {
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

  return { role, isLeader: role === "leader" };
}
