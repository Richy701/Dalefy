import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { firebaseStorage, waitForAuth, firebaseAuth } from "./firebase";
import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system";
import { Platform } from "react-native";
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
 * Read a local file URI into a Uint8Array.
 * On Android, fetch() can't reliably read file:// and content:// URIs,
 * so we use expo-file-system to read as base64 and decode.
 */
async function readFileAsBytes(uri: string): Promise<{ bytes: Uint8Array; mimeType: string }> {
  if (Platform.OS === "android") {
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const binaryStr = atob(base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    return { bytes, mimeType: guessMimeType(uri) };
  }

  // iOS: fetch() works fine with file:// URIs
  const response = await fetch(uri);
  const blob = await response.blob();
  const buffer = await new Response(blob).arrayBuffer();
  return { bytes: new Uint8Array(buffer), mimeType: blob.type || guessMimeType(uri) };
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

    // Detect type from the original URI
    const rawType = guessMimeType(localUri);

    // Convert HEIC → JPEG before uploading
    const { uri: uploadUri, contentType } = await ensureWebCompatible(localUri, rawType);

    // Read the file into bytes
    const { bytes } = await readFileAsBytes(uploadUri);

    if (bytes.length > MAX_FILE_SIZE) {
      console.warn("[MediaUpload] File too large:", bytes.length);
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
    await uploadBytes(storageRef, bytes, { contentType });

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
