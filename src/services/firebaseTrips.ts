import {
  collection, doc, getDocs, setDoc, deleteDoc, query, orderBy, where, onSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { firebaseDb, firebaseAuth, firebaseStorage } from "./firebase";
import type { Trip, TravelEvent } from "@/types";
import { logger } from "@/lib/logger";

const TRIPS = "trips";
const TRIP_MEMBERS = "trip_members";

/** Demo/seed trip IDs — never return these from cloud queries */
const DEMO_IDS = new Set(["1", "2", "3", "4", "5", "6", "7", "8"]);

export async function fetchTrips(): Promise<Trip[]> {
  const uid = firebaseAuth().currentUser?.uid;
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
  const uid = firebaseAuth().currentUser?.uid;
  if (!uid) { onChange([]); return () => {}; }

  const q = query(collection(firebaseDb(), TRIPS), where("user_id", "==", uid), orderBy("start", "desc"));
  return onSnapshot(q, (snap) => {
    const all = snap.docs.map((d) => docToTrip(d.id, d.data()));
    const filtered = all.filter((t) => !DEMO_IDS.has(t.id));
    const blocked = all.length - filtered.length;
    if (blocked > 0) logger.log("subscribeToTrips", `filtered out ${blocked} demo trips from ${all.length} total`);
    onChange(filtered);
  });
}

export async function upsertTrip(trip: Trip): Promise<void> {
  const auth = firebaseAuth();
  const userId = auth.currentUser?.uid ?? null;

  // Upload base64 images to Storage before writing to Firestore
  const uploadedEvents = await uploadEventMedia(trip.id, trip.events);
  const cleanTrip = { ...trip, events: uploadedEvents };

  // Trip cover image
  if (isBase64(cleanTrip.image)) {
    try {
      cleanTrip.image = await uploadBase64(`trips/${trip.id}/cover`, cleanTrip.image);
    } catch (e) { logger.error("upsertTrip", "cover upload failed:", e); }
  }

  // Trip-level media
  if (cleanTrip.media?.length) {
    cleanTrip.media = await Promise.all(cleanTrip.media.map(async (m, i) => {
      if (isBase64(m.url)) {
        try {
          const url = await uploadBase64(`trips/${trip.id}/media/${m.id}`, m.url);
          return { ...m, url };
        } catch (e) { logger.error("upsertTrip", "trip media upload failed:", e); }
      }
      return m;
    }));
  }

  const data = tripToDoc(cleanTrip);
  if (userId) data.user_id = userId;

  logger.log("upsertTrip", "saving:", trip.id, trip.name);
  await setDoc(doc(firebaseDb(), TRIPS, trip.id), data, { merge: true });
}

export async function removeTrip(id: string): Promise<void> {
  await deleteDoc(doc(firebaseDb(), TRIPS, id));
}

export async function fetchTripByShortCode(code: string): Promise<Trip | null> {
  const normalized = code.trim();
  if (!/^\d{4}$/.test(normalized)) return null;

  const q = query(
    collection(firebaseDb(), TRIPS),
    where("short_code", "==", normalized),
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return docToTrip(d.id, d.data());
}

function randomCode(): string {
  return String(Math.floor(Math.random() * 10000)).padStart(4, "0");
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

export interface TripMember {
  device_id: string;
  trip_id: string;
  trip_name: string;
  name: string;
  avatar: string | null;
  joined_at: string;
}

export async function fetchTripMembers(): Promise<TripMember[]> {
  try {
    const snap = await getDocs(
      query(collection(firebaseDb(), TRIP_MEMBERS), orderBy("joined_at", "desc")),
    );
    return snap.docs.map((d) => d.data() as TripMember);
  } catch {
    return [];
  }
}

// ── Storage helpers ────────────────────────────────────────────────────────

function isBase64(url?: string): boolean {
  return !!url && url.startsWith("data:");
}

async function uploadBase64(path: string, dataUrl: string): Promise<string> {
  const [meta, base64] = dataUrl.split(",");
  const mime = meta.match(/:(.*?);/)?.[1] ?? "application/octet-stream";
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const storageRef = ref(firebaseStorage(), path);
  await uploadBytes(storageRef, bytes, { contentType: mime });
  return getDownloadURL(storageRef);
}

/** Upload any base64 images in events to Storage, return events with URLs. */
async function uploadEventMedia(tripId: string, events: TravelEvent[]): Promise<TravelEvent[]> {
  return Promise.all(events.map(async (ev) => {
    const patched = { ...ev };

    // Event thumbnail
    if (isBase64(patched.image)) {
      try {
        patched.image = await uploadBase64(`trips/${tripId}/events/${ev.id}/image`, patched.image!);
      } catch (e) { logger.error("uploadEventMedia", "image upload failed:", e); }
    }

    // Event media
    if (patched.media?.length) {
      patched.media = await Promise.all(patched.media.map(async (m, i) => {
        if (isBase64(m.url)) {
          try {
            const url = await uploadBase64(`trips/${tripId}/events/${ev.id}/media/${i}`, m.url);
            return { ...m, url };
          } catch (e) { logger.error("uploadEventMedia", "media upload failed:", e); }
        }
        return m;
      }));
    }

    // Event documents (strip base64 — too large for both Storage and Firestore in bulk)
    if (patched.documents?.length) {
      patched.documents = await Promise.all(patched.documents.map(async (d, i) => {
        if (isBase64(d.url)) {
          try {
            const url = await uploadBase64(`trips/${tripId}/events/${ev.id}/docs/${d.id}`, d.url);
            return { ...d, url };
          } catch (e) { logger.error("uploadEventMedia", "doc upload failed:", e); }
        }
        return d;
      }));
    }

    return patched;
  }));
}

// ── Mappers ─────────────────────────────────────────────────────────────────

function tripToDoc(trip: Trip): Record<string, unknown> {
  return {
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
    image: trip.image,
    events: trip.events,
    media: trip.media ?? null,
    short_code: trip.shortCode ?? null,
    organization_id: trip.organizationId ?? null,
    traveler_ids: trip.travelerIds ?? null,
    travelers: trip.travelers ?? null,
    organizer: trip.organizer ?? null,
    info: trip.info ?? null,
  };
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
