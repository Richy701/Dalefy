import { useState, useEffect } from "react";
import { subscribeToMemberRole, type TripMemberRole } from "@/services/firebaseTrips";

/**
 * Subscribe to the current device's role for a specific trip.
 * Returns "traveler" by default, "leader" if promoted by admin.
 */
export function useTripRole(tripId: string | undefined): { role: TripMemberRole; isLeader: boolean } {
  const [role, setRole] = useState<TripMemberRole>("traveler");

  useEffect(() => {
    if (!tripId) return;
    const unsub = subscribeToMemberRole(tripId, (r) => {
      console.log("[useTripRole]", tripId, "role:", r);
      setRole(r);
    });
    return () => unsub();
  }, [tripId]);

  return { role, isLeader: role === "leader" };
}
