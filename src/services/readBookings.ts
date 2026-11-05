import { firebaseAuth } from "@/services/firebase";
import { apiFetch } from "@/lib/api";
import type { BookingRow } from "@/lib/bookingRefs";

const MAX_PICTURES = 3;
const LONGEST_SIDE = 2400;
// The server refuses anything over 4.5MB, and base64 adds about a third
const MAX_BASE64_CHARS = 4_000_000;

/** Shrunk in the browser so a phone photo fits, but kept sharp: one misread digit is someone else's ticket */
async function toJpeg(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error(`Couldn't open ${file.name}. Use a JPG, PNG or screenshot.`);
  });
  const scale = Math.min(1, LONGEST_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.9);
}

export async function readBookingPictures(files: File[]): Promise<BookingRow[]> {
  if (files.length > MAX_PICTURES) throw new Error(`Add up to ${MAX_PICTURES} pictures at a time.`);
  const images = await Promise.all(files.map(toJpeg));
  if (images.join("").length > MAX_BASE64_CHARS) throw new Error("Those pictures are too large together. Try one at a time.");
  const auth = await firebaseAuth().currentUser?.getIdToken().catch(() => null);
  if (!auth) throw new Error("Sign in to read pictures");
  const { rows } = await apiFetch<{ rows: BookingRow[] }>("/api/parse-itinerary?mode=bookings", { method: "POST", body: { images }, auth, timeoutMs: 120_000 });
  return rows;
}
