import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { firebaseStorage, waitForAuth, firebaseAuth } from "./firebase";
import type { TripMedia } from "@/shared/types";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB — matches storage rules

/**
 * Uploads a single media file to Firebase Storage under trips/{tripId}/media/.
 * Returns the download URL on success, or null on failure.
 */
export async function uploadMediaFile(
  localUri: string,
  tripId: string,
  mediaId: string,
): Promise<string | null> {
  try {
    await waitForAuth();
    const uid = firebaseAuth().currentUser?.uid;
    if (!uid) {
      console.warn("[MediaUpload] No authenticated user");
      return null;
    }

    const response = await fetch(localUri);
    const blob = await response.blob();

    if (blob.size > MAX_FILE_SIZE) {
      console.warn("[MediaUpload] File too large:", blob.size);
      return null;
    }

    const contentType = blob.type || "image/jpeg";
    const ext = contentType.includes("png") ? "png"
      : contentType.includes("webp") ? "webp"
      : contentType.includes("video") ? "mp4"
      : "jpg";

    const storagePath = `trips/${tripId}/media/${mediaId}.${ext}`;
    const storageRef = ref(firebaseStorage(), storagePath);
    await uploadBytes(storageRef, blob, { contentType });

    const url = await getDownloadURL(storageRef);
    console.log("[MediaUpload] Uploaded:", storagePath);
    return url;
  } catch (err) {
    console.warn("[MediaUpload] Upload failed:", err);
    return null;
  }
}

/**
 * Uploads an array of TripMedia items to Firebase Storage.
 * Returns updated items with cloud URLs replacing local URIs.
 * Items that fail to upload keep their original local URI.
 */
export async function uploadTripMedia(
  items: TripMedia[],
  tripId: string,
): Promise<TripMedia[]> {
  const results = await Promise.all(
    items.map(async (item) => {
      // Skip items already on Firebase Storage
      if (item.url.includes("firebasestorage.googleapis.com")) return item;
      const url = await uploadMediaFile(item.url, tripId, item.id);
      return url ? { ...item, url } : item;
    }),
  );
  return results;
}
