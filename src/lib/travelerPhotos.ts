import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { firebaseStorage } from "@/services/firebase";
import { shrinkImage } from "@/lib/shrinkImage";
import type { Trip, User } from "@/types";

/** Storage allows 2MB per avatar; a 512px JPEG of a headshot is well under 100KB */
const MAX_BYTES = 2 * 1024 * 1024;

/** Shrink a headshot to 512px and store it under the uploader's own avatar folder, which Storage rules allow */
export async function uploadTravelerPhoto(uid: string, travelerId: string, file: Blob): Promise<string> {
  const small = await shrinkImage(file, 512, 0.85);
  if (small.size > MAX_BYTES) throw new Error("That photo is too large even after shrinking. Try a JPEG under 2MB.");
  const type = small.type === "image/png" || small.type === "image/webp" ? small.type : "image/jpeg";
  const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
  const storageRef = ref(firebaseStorage(), `avatars/${uid}/traveler-${travelerId}-${Date.now()}.${ext}`);
  await uploadBytes(storageRef, small, { contentType: type });
  return getDownloadURL(storageRef);
}

/** The trip fields to update when a person's photo changes, or nothing when they're not on it */
export function tripUpdatesForAvatar(trip: Trip, personId: string, avatar: string | null): Partial<Trip> | null {
  if (!trip.travelers?.some(t => t.id === personId)) return null;
  const withPhoto = <T extends { id: string; avatar?: string }>(t: T): T => {
    if (t.id !== personId) return t;
    const next = { ...t };
    if (avatar) next.avatar = avatar; else delete next.avatar;
    return next;
  };
  const updates: Partial<Trip> = { travelers: trip.travelers.map(withPhoto) };
  const snap = trip.publishedSnapshot;
  if (snap?.travelers?.some(t => t.id === personId)) {
    updates.publishedSnapshot = { ...snap, travelers: snap.travelers.map(withPhoto) };
  }
  return updates;
}

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

/** "Carly Singer.png" → "carly singer"; "Edward Terre - Golf.png" → "edward terre"; "ElliotA.png" → "elliota" */
export function nameFromFilename(fileName: string): string {
  return norm(fileName.replace(/\.[a-z0-9]+$/i, "").split(/\s+-\s+/)[0].replace(/[_]+/g, " "));
}

export interface PhotoMatch {
  /** The one person this file is for, when the name settles it */
  person: User | null;
  /** Everyone it could be, when a first name alone is shared */
  candidates: User[];
}

/** Full name first; a bare first name only when exactly one person has it */
export function matchPhotoToPerson(fileName: string, people: User[]): PhotoMatch {
  const stem = nameFromFilename(fileName);
  if (!stem) return { person: null, candidates: [] };
  const exact = people.filter(p => norm(p.name) === stem);
  if (exact.length === 1) return { person: exact[0], candidates: exact };
  if (exact.length > 1) return { person: null, candidates: exact };
  // "Lee Graham.png" must not land on Lee Birkett: a first name alone only stands in when that is all the file gives
  if (stem.includes(" ")) return { person: null, candidates: [] };
  const byFirst = people.filter(p => norm(p.name).split(" ")[0] === stem);
  if (byFirst.length === 1) return { person: byFirst[0], candidates: byFirst };
  return { person: null, candidates: byFirst };
}
