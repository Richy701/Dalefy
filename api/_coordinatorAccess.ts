import { getDocument, queryDocuments, updateDocument, decodeValue, encodeValue, type FirestoreDoc } from "./_firebaseAdmin.js";
import { listedAsCoordinator, listedAsTripLeader } from "./_tripView.js";

async function isOnTeam(trip: Record<string, unknown>, uid: string): Promise<boolean> {
  const orgId = trip.organization_id;
  if (typeof orgId !== "string" || !orgId) return false;
  const member = await getDocument("org_members", `${uid}_${orgId}`);
  return decodeValue(member?.fields?.organization_id) === orgId && decodeValue(member?.fields?.user_id) === uid;
}

/**
 * Being ticked on a trip isn't enough: someone who has left the team loses access at once, even if they're
 * still on the list, so their team membership is checked on every request.
 */
export async function hasCoordinatorAccess(trip: Record<string, unknown>, uid: string): Promise<boolean> {
  if (!listedAsCoordinator(trip, uid)) return false;
  return isOnTeam(trip, uid);
}

/**
 * The role of someone who has joined this trip. A teammate ticked as trip leader in the Workspace becomes one when
 * they join, since the rules don't let a phone give itself the role, and stops being one if they leave the team or
 * the trip goes private. Everyone else keeps the role on their record.
 */
export async function settledRole(
  trip: Record<string, unknown>,
  tripId: string,
  member: Record<string, unknown>,
  account: { sub?: string; email?: unknown; email_verified?: unknown },
): Promise<unknown> {
  if (!account.sub || account.email_verified !== true || !listedAsTripLeader(trip, account.email)) return member.role;
  const role = trip.private !== true && await isOnTeam(trip, account.sub) ? "leader" : "traveler";
  if ((member.role ?? "traveler") === role) return role;
  try {
    // Every record of theirs on the trip: the same account on another phone has its own
    const docs = await queryDocuments("trip_members", "trip_id", tripId, 2000);
    const mine = docs.filter((d: FirestoreDoc) => decodeValue(d.fields?.uid) === account.sub);
    await Promise.all(mine.map((d: FirestoreDoc) => updateDocument("trip_members", d.name.split("/").pop()!, { role: encodeValue(role) }, ["role"])));
  } catch (error) {
    // This request still answers with the right role; the next one tries the write again
    console.warn("[trip] couldn't save trip leader role:", error instanceof Error ? error.message : error);
  }
  return role;
}
