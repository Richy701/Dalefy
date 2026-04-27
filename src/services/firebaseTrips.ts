import {
  collection, doc, getDocs, setDoc, deleteDoc, query, orderBy, where, onSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { onAuthStateChanged } from "firebase/auth";
import { firebaseDb, firebaseAuth, firebaseStorage } from "./firebase";
import type { Trip } from "@/types";
import { logger } from "@/lib/logger";

const TRIPS = "trips";
const TRIP_MEMBERS = "trip_members";

/** Demo/seed trip IDs — never return these from cloud queries */
const DEMO_IDS = new Set(["1", "2", "3", "4", "5", "6", "7", "8"]);

/** Wait for Firebase Auth to resolve — currentUser is null until the SDK
 *  restores the session from IndexedDB (takes a few hundred ms on refresh). */
function waitForAuth(): Promise<string | null> {
  const auth = firebaseAuth();
  if (auth.currentUser) return Promise.resolve(auth.currentUser.uid);
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub();
      resolve(user?.uid ?? null);
    });
  });
}

export async function fetchTrips(): Promise<Trip[]> {
  const uid = await waitForAuth();
  if (!uid) return [];

  const snap = await getDocs(
    query(collection(firebaseDb(), TRIPS), where("user_id", "==", uid), orderBy("start", "desc")),
  );
  const all = snap.docs.map((d) => docToTrip(d.id, d.data()));
  const filtered = all.filter((t) => !DEMO_IDS.has(t.id));
  const blocked = all.length - filtered.length;
  if (blocked > 0) logger.log("fetchTrips", `filtered out ${blocked} demo trips from ${all.length} total`);
  return filtered;
}

export function subscribeToTrips(onChange: (trips: Trip[]) => void): Unsubscribe {
  let innerUnsub: Unsubscribe | null = null;

  // Wait for auth then set up the real listener
  waitForAuth().then((uid) => {
    if (!uid) { onChange([]); return; }
    const q = query(collection(firebaseDb(), TRIPS), where("user_id", "==", uid), orderBy("start", "desc"));
    innerUnsub = onSnapshot(q, (snap) => {
      const all = snap.docs.map((d) => docToTrip(d.id, d.data()));
      const filtered = all.filter((t) => !DEMO_IDS.has(t.id));
      const blocked = all.length - filtered.length;
      if (blocked > 0) logger.log("subscribeToTrips", `filtered out ${blocked} demo trips from ${all.length} total`);
      onChange(filtered);
    });
  });

  return () => { innerUnsub?.(); };
}

export async function upsertTrip(trip: Trip): Promise<Trip> {
  const auth = firebaseAuth();
  const userId = auth.currentUser?.uid ?? null;

  // Upload base64 images to Firebase Storage, replace with download URLs.
  // Firestore has a 1MB doc limit — base64 images easily exceed that.
  const cleanTrip = await uploadTripImages(trip);

  const data = tripToDoc(cleanTrip);
  if (userId) data.user_id = userId;

  logger.log("upsertTrip", "saving:", trip.id, trip.name);
  await setDoc(doc(firebaseDb(), TRIPS, trip.id), data, { merge: true });
  return cleanTrip;
}

export async function removeTrip(id: string): Promise<void> {
  await deleteDoc(doc(firebaseDb(), TRIPS, id));
}

export async function fetchTripByShortCode(code: string): Promise<Trip | null> {
  const normalized = code.trim().toUpperCase();
  if (!/^[A-Z0-9]{4,6}$/.test(normalized)) return null;

  const q = query(
    collection(firebaseDb(), TRIPS),
    where("short_code", "==", normalized),
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return docToTrip(d.id, d.data());
}

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I to avoid confusion
function randomCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return code;
}

export async function generateUniqueShortCode(): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const candidate = randomCode();
    const q = query(
      collection(firebaseDb(), TRIPS),
      where("short_code", "==", candidate),
    );
    const snap = await getDocs(q);
    if (snap.empty) return candidate;
  }
  throw new Error("Could not allocate unique trip code");
}

// ── Trip Members ────────────────────────────────────────────────────────────

export type TripMemberRole = "traveler" | "leader";

export interface TripMember {
  device_id: string;
  trip_id: string;
  trip_name: string;
  name: string;
  avatar: string | null;
  joined_at: string;
  role?: TripMemberRole;
}

export async function fetchTripMembers(): Promise<TripMember[]> {
  try {
    const snap = await getDocs(
      query(collection(firebaseDb(), TRIP_MEMBERS), orderBy("joined_at", "desc")),
    );
    // Deduplicate: logTripJoin creates two docs per join (device_id + uid keyed).
    // Keep one entry per device_id+trip_id pair — prefer the device-keyed doc.
    const all = snap.docs.map((d) => d.data() as TripMember);
    const seen = new Map<string, TripMember>();
    for (const m of all) {
      const key = `${m.device_id}_${m.trip_id}`;
      if (!seen.has(key)) seen.set(key, m);
    }
    return Array.from(seen.values());
  } catch {
    return [];
  }
}

/** Delete all trip_members docs for a given device_id (both device-keyed and uid-keyed) */
export async function deleteAppUser(deviceId: string): Promise<number> {
  const snap = await getDocs(
    query(collection(firebaseDb(), TRIP_MEMBERS), where("device_id", "==", deviceId)),
  );
  if (snap.empty) return 0;
  let deleted = 0;
  for (const d of snap.docs) {
    try {
      await deleteDoc(d.ref);
      deleted++;
    } catch (err) {
      logger.log("deleteAppUser", `failed to delete ${d.id}:`, err);
    }
  }
  logger.log("deleteAppUser", `deleted ${deleted}/${snap.size} docs for device ${deviceId}`);
  return deleted;
}

/** Update the role on all trip_members docs for a device+trip pair */
export async function updateTripMemberRole(
  deviceId: string,
  tripId: string,
  role: TripMemberRole,
): Promise<void> {
  const snap = await getDocs(
    query(
      collection(firebaseDb(), TRIP_MEMBERS),
      where("device_id", "==", deviceId),
      where("trip_id", "==", tripId),
    ),
  );
  for (const d of snap.docs) {
    await setDoc(d.ref, { role }, { merge: true });
  }
  // Also update UID-keyed docs if they exist
  const uidSnap = await getDocs(
    query(
      collection(firebaseDb(), TRIP_MEMBERS),
      where("trip_id", "==", tripId),
    ),
  );
  for (const d of uidSnap.docs) {
    const data = d.data();
    if (data.device_id === deviceId && d.id !== `${deviceId}_${tripId}`) {
      await setDoc(d.ref, { role }, { merge: true });
    }
  }
}

export async function deleteAllTripMembers(): Promise<number> {
  const snap = await getDocs(collection(firebaseDb(), TRIP_MEMBERS));
  if (snap.empty) return 0;
  let deleted = 0;
  for (const d of snap.docs) {
    try {
      await deleteDoc(d.ref);
      deleted++;
    } catch (err) {
      logger.log("deleteAllTripMembers", `failed to delete ${d.id}:`, err);
    }
  }
  logger.log("deleteAllTripMembers", `deleted ${deleted}/${snap.size} docs`);
  return deleted;
}

// ── Image upload ──────────────────────────────────────────────────────────
// Firestore docs must be < 1MB. Base64 images are uploaded to Firebase
// Storage and replaced with download URLs before writing to Firestore.

function isBase64(url?: string): boolean {
  return !!url && url.startsWith("data:");
}

function isFirebaseStorageUrl(url?: string): boolean {
  return !!url && url.includes("firebasestorage.googleapis.com");
}

/** Returns true for external HTTP URLs that should be re-uploaded to Firebase Storage */
function isExternalUrl(url?: string): boolean {
  return !!url && url.startsWith("http") && !isFirebaseStorageUrl(url);
}

function base64ToBlob(dataUri: string): Blob {
  const [header, b64] = dataUri.split(",");
  const mime = header.match(/:(.*?);/)?.[1] ?? "image/jpeg";
  const bytes = atob(b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

async function uploadBase64Image(dataUri: string, path: string): Promise<string> {
  const blob = base64ToBlob(dataUri);
  const storageRef = ref(firebaseStorage(), path);
  await uploadBytes(storageRef, blob);
  return getDownloadURL(storageRef);
}

/** Fetch an external image via proxy and re-upload to Firebase Storage for reliable mobile access */
async function reuploadExternalImage(url: string, path: string): Promise<string> {
  // Use the image proxy to avoid CORS issues when fetching from the browser
  const proxyUrl = `/api/image-proxy?url=${encodeURIComponent(url)}`;
  const res = await fetch(proxyUrl);
  if (!res.ok) throw new Error(`Proxy fetch failed: ${res.status}`);
  const blob = await res.blob();
  const storageRef = ref(firebaseStorage(), path);
  await uploadBytes(storageRef, blob);
  return getDownloadURL(storageRef);
}

/** Upload an image (base64 or external URL) to Firebase Storage */
async function uploadImage(imageUrl: string, storagePath: string): Promise<string> {
  if (isBase64(imageUrl)) {
    return uploadBase64Image(imageUrl, storagePath);
  }
  if (isExternalUrl(imageUrl)) {
    return reuploadExternalImage(imageUrl, storagePath);
  }
  return imageUrl; // already a Firebase Storage URL
}

async function uploadTripImages(trip: Trip): Promise<Trip> {
  const clean = { ...trip };

  // Trip cover — upload base64 or external URLs to Firebase Storage
  if (isBase64(clean.image) || isExternalUrl(clean.image)) {
    try {
      clean.image = await uploadImage(clean.image, `trips/${trip.id}/cover`);
      logger.log("uploadTripImages", "uploaded cover for", trip.id);
    } catch (err) {
      logger.log("uploadTripImages", "cover upload failed, keeping original:", err);
      // Keep original URL as fallback — it works on web even if Android fails
    }
  }

  // Trip-level media — upload base64/local to Firebase Storage
  if (clean.media?.length) {
    clean.media = await Promise.all(
      clean.media.map(async (m, i) => {
        if (isBase64(m.url)) {
          try {
            const url = await uploadBase64Image(m.url, `trips/${trip.id}/media/${m.id || `m-${i}`}`);
            return { ...m, url };
          } catch {
            return m; // keep original on failure
          }
        }
        return m;
      }),
    );
  }

  // Events — upload base64 or external image URLs
  clean.events = await Promise.all(clean.events.map(async (ev, i) => {
    const e = { ...ev };
    if (isBase64(e.image) || isExternalUrl(e.image)) {
      try {
        e.image = await uploadImage(e.image!, `trips/${trip.id}/events/${e.id || i}`);
      } catch {
        // Keep original URL as fallback
      }
    }
    if (e.media?.length) e.media = e.media.filter(m => !isBase64(m.url));
    if (e.documents?.length) e.documents = e.documents.filter(d => !isBase64(d.url));
    return e;
  }));

  return clean;
}

// ── Mappers ─────────────────────────────────────────────────────────────────

/** Replace undefined with null — Firestore rejects undefined values */
function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    result[k] = v === undefined ? null : v;
  }
  return result;
}

function tripToDoc(trip: Trip): Record<string, unknown> {
  return stripUndefined({
    name: trip.name,
    attendees: trip.attendees ?? "",
    destination: trip.destination ?? null,
    pax_count: trip.paxCount ?? null,
    trip_type: trip.tripType ?? null,
    budget: trip.budget ?? null,
    currency: trip.currency ?? null,
    start: trip.start,
    end_date: trip.end,
    status: trip.status,
    image: trip.image ?? "",
    events: (trip.events ?? []).map(e => JSON.parse(JSON.stringify(e))),
    media: trip.media ?? null,
    short_code: trip.shortCode ?? null,
    organization_id: trip.organizationId ?? null,
    traveler_ids: trip.travelerIds ?? null,
    travelers: trip.travelers ?? null,
    organizer: trip.organizer ?? null,
    info: trip.info ?? null,
  });
}

function docToTrip(id: string, data: Record<string, unknown>): Trip {
  return {
    id,
    name: data.name as string,
    attendees: (data.attendees as string) ?? "",
    destination: (data.destination as string) ?? undefined,
    paxCount: (data.pax_count as string) ?? undefined,
    tripType: (data.trip_type as string) ?? undefined,
    budget: (data.budget as string) ?? undefined,
    currency: (data.currency as string) ?? undefined,
    start: data.start as string,
    end: data.end_date as string,
    status: data.status as Trip["status"],
    image: data.image as string,
    events: (data.events as Trip["events"]) ?? [],
    media: (data.media as Trip["media"]) ?? undefined,
    shortCode: (data.short_code as string) ?? undefined,
    travelerIds: (data.traveler_ids as string[]) ?? undefined,
    travelers: (data.travelers as Trip["travelers"]) ?? undefined,
    organizer: (data.organizer as Trip["organizer"]) ?? undefined,
    info: (data.info as Trip["info"]) ?? undefined,
    organizationId: (data.organization_id as string) ?? undefined,
  };
}
