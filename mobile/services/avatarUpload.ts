import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { firebaseStorage, firebaseAuth, waitForAuth } from "./firebase";
import * as FileSystem from "expo-file-system";
import { Platform } from "react-native";

/**
 * Read a local file URI into a Uint8Array.
 * On Android, fetch() can't reliably read file:// and content:// URIs,
 * so we use expo-file-system to read as base64 and decode.
 */
async function readFileAsBytes(uri: string): Promise<Uint8Array> {
  if (Platform.OS === "android") {
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const binaryStr = atob(base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    return bytes;
  }

  const response = await fetch(uri);
  const blob = await response.blob();
  const buffer = await new Response(blob).arrayBuffer();
  return new Uint8Array(buffer);
}

/**
 * Uploads a local image URI to Firebase Storage under the
 * authenticated user's UID-scoped avatar path.
 *
 * Security: only the owning UID can write to /avatars/{uid}/*
 * via Storage rules. Images are capped at 2MB and must be
 * png/jpeg/webp.
 *
 * Returns the public download URL on success, or null on failure.
 */
export async function uploadAvatar(localUri: string): Promise<string | null> {
  try {
    await waitForAuth();

    const auth = firebaseAuth();
    const uid = auth.currentUser?.uid;
    if (!uid) {
      console.warn("[AvatarUpload] No authenticated user");
      return null;
    }

    const bytes = await readFileAsBytes(localUri);

    // Validate size client-side (2MB limit)
    if (bytes.length > 2 * 1024 * 1024) {
      console.warn("[AvatarUpload] File too large:", bytes.length);
      return null;
    }

    // Determine extension from URI
    const lower = localUri.toLowerCase();
    const contentType = lower.includes(".png") ? "image/png" : lower.includes(".webp") ? "image/webp" : "image/jpeg";
    const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";

    const storageRef = ref(firebaseStorage(), `avatars/${uid}/avatar.${ext}`);
    await uploadBytes(storageRef, bytes, { contentType });

    const url = await getDownloadURL(storageRef);
    console.log("[AvatarUpload] Uploaded:", url);
    return url;
  } catch (err) {
    console.warn("[AvatarUpload] Upload failed:", err);
    return null;
  }
}
