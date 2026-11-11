import { firebaseAuth } from "@/services/firebase";
import { apiFetch, ApiError } from "@/lib/api";
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

/** What the AI read from one hotel booking confirmation */
export interface StayRead { guests: string[]; hotel: string; checkIn: string; checkOut: string; confirmationNumber: string; email: string }

const fileToDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(new Error(`Couldn't open ${file.name}`));
  reader.readAsDataURL(file);
});

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Hotel confirmation PDFs, one request each, a few at a time. Each PDF settles on its own, so one unreadable
 * file never loses the rest. `cancelled` stops new reads once the organiser leaves.
 */
export async function readStayPdfs(
  files: File[],
  onRead: (file: File, result: { read: StayRead } | { error: string }) => void,
  cancelled: () => boolean,
): Promise<void> {
  const auth = await firebaseAuth().currentUser?.getIdToken().catch(() => null);
  if (!auth) throw new Error("Sign in to read PDFs");
  const queue = [...files];
  const readOne = async (file: File) => {
    try {
      const pdf = await fileToDataUrl(file);
      if (pdf.length > MAX_BASE64_CHARS) { onRead(file, { error: "Too large to read (over 3MB)" }); return; }
      for (let attempt = 0; ; attempt++) {
        try {
          const read = await apiFetch<StayRead>("/api/parse-itinerary?mode=stays", { method: "POST", body: { pdf }, auth, timeoutMs: 120_000 });
          onRead(file, { read });
          return;
        } catch (error) {
          // A busy minute is worth waiting out; anything else is this file's problem
          const busy = error instanceof ApiError && error.status === 429;
          if (!busy || attempt >= 2 || cancelled()) throw error;
          await wait(20_000);
        }
      }
    } catch (error) {
      onRead(file, { error: error instanceof Error ? error.message : "Couldn't read this PDF" });
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, files.length) }, async () => {
    while (queue.length && !cancelled()) await readOne(queue.shift()!);
  }));
}
