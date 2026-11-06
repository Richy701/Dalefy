import type { TripMedia } from "@/shared/types";
import { uploadTripMedia } from "./mediaUpload";
import { changeTripMedia } from "./firebaseTrips";

/** A photo is shared only after both Storage and the trip's gallery acknowledge it. */
export async function shareGalleryPhotos(
  items: TripMedia[],
  tripId: string,
  onProgress: (done: number, total: number, saving?: boolean, fraction?: number) => void,
): Promise<{ saved: TripMedia[]; retry: TripMedia[] }> {
  const uploaded = await uploadTripMedia(items, tripId, (done, total, fraction) => onProgress(done, total, false, fraction));
  const ready = uploaded.filter(item => item.url.startsWith("https://"));
  const failed = uploaded.filter(item => !item.url.startsWith("https://"));
  if (!ready.length) return { saved: [], retry: failed };
  onProgress(items.length, items.length, true);
  try {
    // The API merges by ID, so retrying an ambiguous network failure is safe.
    await changeTripMedia(tripId, ready);
    return { saved: ready, retry: failed };
  } catch {
    // Keep cloud URLs: Retry saves the same photos without uploading another copy.
    return { saved: [], retry: uploaded };
  }
}
