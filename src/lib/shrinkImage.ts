/**
 * Scales a photo down to at most `maxEdge` px on its long side and re-encodes it as JPEG, so a cover straight
 * off a camera (2 MB and up) doesn't make every phone download it in full. Anything it can't read, or that
 * comes out no smaller, is returned unchanged.
 */
export async function shrinkImage(blob: Blob, maxEdge = 2400, quality = 0.82): Promise<Blob> {
  if (!/^image\/(jpeg|png|webp|heic|heif|avif)$/.test(blob.type)) return blob;
  const bitmap = await createImageBitmap(blob).catch(() => null);
  if (!bitmap) return blob;
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) { bitmap.close(); return blob; }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const out = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", quality));
  return out && out.size < blob.size ? out : blob;
}
