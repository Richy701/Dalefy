import type { Trip } from "../shared/types";
import { changeTripMedia } from "./firebaseTrips";

/** Delete one explicit ID; never infer deletions from a stale gallery snapshot. */
export async function deleteGalleryPhoto(tripId: string, mediaId: string): Promise<void> {
  if (!tripId || !mediaId) throw new Error("Missing photo identity");
  await changeTripMedia(tripId, [], [mediaId]);
}

export function withoutGalleryPhoto(trips: Trip[], tripId: string, mediaId: string): Trip[] {
  return trips.map(trip => trip.id === tripId
    ? { ...trip, media: (trip.media ?? []).filter(photo => photo.id !== mediaId) }
    : trip);
}
