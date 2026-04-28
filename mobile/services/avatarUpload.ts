import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { firebaseStorage, firebaseAuth, waitForAuth } from "./firebase";

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

    const blob = await uriToBlob(localUri);

    // Validate size client-side (2MB limit)
    if (blob.size > 2 * 1024 * 1024) {
      console.warn("[AvatarUpload] File too large:", blob.size);
      return null;
    }

    // Determine extension from content type or URI
    const type = blob.type || "";
    const lower = localUri.toLowerCase();
    const contentType = type.includes("png") || lower.includes(".png") ? "image/png"
      : type.includes("webp") || lower.includes(".webp") ? "image/webp"
      : "image/jpeg";
    const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";

    const storageRef = ref(firebaseStorage(), `avatars/${uid}/avatar.${ext}`);
    await uploadBytes(storageRef, blob, { contentType });

    const url = await getDownloadURL(storageRef);
    console.log("[AvatarUpload] Uploaded:", url);
    return url;
  } catch (err) {
    console.warn("[AvatarUpload] Upload failed:", err);
    return null;
  }
}
