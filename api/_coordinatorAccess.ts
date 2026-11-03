import { getDocument, decodeValue } from "./_firebaseAdmin.js";
import { listedAsCoordinator } from "./_tripView.js";

/**
 * Being ticked on a trip isn't enough: someone who has left the team loses access at once, even if they're
 * still on the list, so their team membership is checked on every request.
 */
export async function hasCoordinatorAccess(trip: Record<string, unknown>, uid: string): Promise<boolean> {
  if (!listedAsCoordinator(trip, uid)) return false;
  const orgId = trip.organization_id;
  if (typeof orgId !== "string" || !orgId) return false;
  const member = await getDocument("org_members", `${uid}_${orgId}`);
  return decodeValue(member?.fields?.organization_id) === orgId && decodeValue(member?.fields?.user_id) === uid;
}
