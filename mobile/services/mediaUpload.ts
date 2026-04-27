import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { firebaseStorage, waitForAuth, firebaseAuth } from "./firebase";
import * as ImageManipulator from "expo-image-manipulator";
import type { TripMedia } from "@/shared/types";

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB

const HEIC_TYPES = ["image/heic", "image/heif"];
const HEIC_EXTS = [".heic", ".heif"];

/** Check if a file is HEIC by mime type or URI extension */
function isHeic(uri: string, mimeType: string): boolean {
  if (HEIC_TYPES.includes(mimeType.toLowerCase())) return true;
  const lower = uri.toLowerCase();
  return HEIC_EXTS.some(ext => lower.endsWith(ext) || lower.includes(ext + "?"));
}

/** Convert HEIC/HEIF to JPEG so browsers can display it */
async function ensureWebCompatible(uri: string, mimeType: string): Promise<{ uri: string; contentType: string }> {
  if (isHeic(uri, mimeType)) {
    const result = await ImageManipulator.manipulateAsync(uri, [], {
      compress: 0.85,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    return { uri: result.uri, contentType: "image/jpeg" };
  }
  return { uri, contentType: mimeType };
}

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

    // Fetch blob to detect type
    const response = await fetch(localUri);
    const originalBlob = await response.blob();
    const rawType = originalBlob.type || "image/jpeg";

    // Convert HEIC → JPEG before uploading
    const { uri: uploadUri, contentType } = await ensureWebCompatible(localUri, rawType);

    // Re-fetch if converted
    const finalBlob = uploadUri !== localUri
      ? await (await fetch(uploadUri)).blob()
      : originalBlob;

    if (finalBlob.size > MAX_FILE_SIZE) {
      console.warn("[MediaUpload] File too large:", finalBlob.size);
      return null;
    }

    const extMap: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/gif": "gif",
      "image/avif": "avif",
      "image/bmp": "bmp",
      "image/tiff": "tiff",
      "video/mp4": "mp4",
      "video/quicktime": "mov",
      "video/x-m4v": "m4v",
      "video/3gpp": "3gp",
      "video/webm": "webm",
    };
    const ext = extMap[contentType] ?? (contentType.startsWith("video/") ? "mp4" : "jpg");

    const storagePath = `trips/${tripId}/media/${mediaId}.${ext}`;
    const storageRef = ref(firebaseStorage(), storagePath);
    await uploadBytes(storageRef, finalBlob, { contentType });

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
