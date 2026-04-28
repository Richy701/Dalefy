import { isFirebaseConfigured, firebaseAuth } from "./firebase";

/**
 * Notify trip members of itinerary changes via the server-side endpoint.
 * The endpoint handles looking up which devices are members of the trip
 * and sending push notifications only to them.
 */
export async function notifyTripUpdate(tripId: string, tripName: string, changes: string[]) {
  if (!isFirebaseConfigured() || !changes.length) return;

  const idToken = await firebaseAuth().currentUser?.getIdToken().catch(() => null);
  if (!idToken) return;

  fetch("/api/notify-trip-update", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ tripId, tripName, changes }),
  }).catch(() => {});
}
