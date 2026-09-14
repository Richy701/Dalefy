import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { firebaseStorage, waitForAuth, firebaseAuth } from "./firebase";
import * as ImageManipulator from "expo-image-manipulator";
import { Image } from "react-native";
import type { TripMedia } from "@/shared/types";

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB — must match storage.rules

const HEIC_TYPES = ["image/heic", "image/heif"];
const HEIC_EXTS = [".heic", ".heif"];

/** Check if a file is HEIC by mime type or URI extension */
function isHeic(uri: string, mimeType: string): boolean {
  if (HEIC_TYPES.includes(mimeType.toLowerCase())) return true;
  const lower = uri.toLowerCase();
  return HEIC_EXTS.some(ext => lower.endsWith(ext) || lower.includes(ext + "?"));
}

const MAX_IMAGE_EDGE = 2048;
const THUMB_EDGE = 600;

/** Bound the longest edge so the image never exceeds `edge` pixels. */
async function resizeToFit(uri: string, edge: number, compress: number): Promise<string> {
  const { width, height } = await new Promise<{ width: number; height: number }>((resolve, reject) =>
    Image.getSize(uri, (w, h) => resolve({ width: w, height: h }), reject));
  const resize = width >= height ? { width: Math.min(width, edge) } : { height: Math.min(height, edge) };
  const result = await ImageManipulator.manipulateAsync(uri, [{ resize }], {
    compress,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  return result.uri;
}

/** Convert HEIC/HEIF to JPEG and cap the size so phone originals upload and display quickly. */
async function ensureWebCompatible(uri: string, mimeType: string): Promise<{ uri: string; contentType: string }> {
  if (mimeType.startsWith("image/") && mimeType !== "image/gif") {
    try {
      return { uri: await resizeToFit(uri, MAX_IMAGE_EDGE, 0.85), contentType: "image/jpeg" };
    } catch {
      // Fall through to the original bytes if the image cannot be decoded here.
    }
  }
  if (isHeic(uri, mimeType)) {
    const result = await ImageManipulator.manipulateAsync(uri, [], {
      compress: 0.85,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    return { uri: result.uri, contentType: "image/jpeg" };
  }
  return { uri, contentType: mimeType };
}

/** Guess MIME type from URI extension */
function guessMimeType(uri: string): string {
  const lower = uri.toLowerCase();
  if (lower.includes(".png")) return "image/png";
  if (lower.includes(".webp")) return "image/webp";
  if (lower.includes(".gif")) return "image/gif";
  if (lower.includes(".heic")) return "image/heic";
  if (lower.includes(".heif")) return "image/heif";
  if (lower.includes(".mp4")) return "video/mp4";
  if (lower.includes(".mov")) return "video/quicktime";
  if (lower.includes(".m4v")) return "video/x-m4v";
  if (lower.includes(".3gp")) return "video/3gpp";
  if (lower.includes(".webm")) return "video/webm";
  return "image/jpeg";
}

/**
 * Read a local file URI into a Blob via XMLHttpRequest.
 * Unlike fetch(), XHR properly handles file:// and content:// URIs
 * on Android without loading the entire file into a base64 string.
 */
function uriToBlob(uri: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onload = () => resolve(xhr.response as Blob);
    xhr.onerror = () => reject(new Error("Failed to read file"));
    xhr.responseType = "blob";
    xhr.open("GET", uri, true);
    xhr.send(null);
  });
}

/**
 * Uploads a single media file to Firebase Storage under trips/{tripId}/media/.
 * Images also get a small thumbnail next to the original for gallery grids.
 * Returns the download URLs on success, or null on failure.
 */
export async function uploadMediaFile(
  localUri: string,
  tripId: string,
  mediaId: string,
): Promise<{ url: string; thumbUrl?: string } | null> {
  try {
    await waitForAuth();
    const uid = firebaseAuth().currentUser?.uid;
    if (!uid) {
      console.warn("[MediaUpload] No authenticated user");
      return null;
    }

    // Detect type from the original URI
    const rawType = guessMimeType(localUri);

    // Convert HEIC → JPEG before uploading
    const { uri: uploadUri, contentType } = await ensureWebCompatible(localUri, rawType);

    // Read the file into a blob (XHR handles file:// and content:// on Android)
    const blob = await uriToBlob(uploadUri);

    if (blob.size > MAX_FILE_SIZE) {
      const sizeMB = (blob.size / (1024 * 1024)).toFixed(1);
      throw new Error(`File too large (${sizeMB} MB). Maximum is 25 MB.`);
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

    const storagePath = `trips/${tripId}/media/${uid}/${mediaId}.${ext}`;
    const storageRef = ref(firebaseStorage(), storagePath);
    await uploadBytes(storageRef, blob, { contentType });

    const url = await getDownloadURL(storageRef);
    console.log("[MediaUpload] Uploaded:", storagePath);

    let thumbUrl: string | undefined;
    if (contentType.startsWith("image/")) {
      try {
        const thumbBlob = await uriToBlob(await resizeToFit(uploadUri, THUMB_EDGE, 0.7));
        const thumbRef = ref(firebaseStorage(), `trips/${tripId}/media/${uid}/${mediaId}_thumb.jpg`);
        await uploadBytes(thumbRef, thumbBlob, { contentType: "image/jpeg" });
        thumbUrl = await getDownloadURL(thumbRef);
      } catch (err) {
        console.warn("[MediaUpload] Thumbnail skipped:", err);
      }
    }
    return { url, thumbUrl };
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
  onProgress?: (completed: number, total: number) => void,
): Promise<TripMedia[]> {
  const total = items.length;
  const results: TripMedia[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.url.includes("firebasestorage")) {
      results.push(item);
    } else {
      const uploaded = await uploadMediaFile(item.url, tripId, item.id);
      results.push(uploaded ? { ...item, url: uploaded.url, thumbUrl: uploaded.thumbUrl } : item);
    }
    onProgress?.(i + 1, total);
  }
  return results;
}
