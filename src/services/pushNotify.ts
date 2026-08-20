import { isFirebaseConfigured } from "./firebase";
import { apiFetch, getIdToken } from "@/lib/api";
import { logger } from "@/lib/logger";

/**
 * Notify trip members of itinerary changes via the server-side endpoint.
 * The endpoint handles looking up which devices are members of the trip
 * and sending push notifications only to them.
 */
export async function notifyTripUpdate(tripId: string, tripName: string, changes: string[]) {
  if (!isFirebaseConfigured() || !changes.length) return;

  const idToken = await getIdToken();
  if (!idToken) return;

  apiFetch("/api/notify-trip-update", {
    method: "POST",
    body: { tripId, tripName, changes },
    auth: idToken,
  }).catch(e => logger.warn("PushNotify", "notify-trip-update failed:", e));
}
