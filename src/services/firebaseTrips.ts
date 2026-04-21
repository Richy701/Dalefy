import {
  collection, doc, getDocs, setDoc, deleteDoc, query, orderBy, where, onSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { firebaseDb, firebaseAuth } from "./firebase";
import type { Trip, TravelEvent } from "@/types";
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

export async function upsertTrip(trip: Trip): Promise<void> {
  const auth = firebaseAuth();
  const userId = auth.currentUser?.uid ?? null;

  // Strip base64 data before writing — Firestore has a 1MB doc limit.
  // Base64 images are preserved in localStorage; only URLs survive cloud sync.
  const cleanTrip = stripBase64(trip);

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

// ── Base64 stripping ──────────────────────────────────────────────────────
// Firestore docs must be < 1MB. Base64 images easily exceed that.
// We strip them before cloud write; localStorage keeps the full data.

function isBase64(url?: string): boolean {
  return !!url && url.startsWith("data:");
}

function stripBase64(trip: Trip): Trip {
  const clean = { ...trip };

  // Trip cover
  if (isBase64(clean.image)) clean.image = "";

  // Trip-level media
  if (clean.media?.length) {
    clean.media = clean.media.filter(m => !isBase64(m.url));
  }

  // Events
  clean.events = clean.events.map(ev => {
    const e = { ...ev };
    if (isBase64(e.image)) e.image = undefined;
    if (e.media?.length) e.media = e.media.filter(m => !isBase64(m.url));
    if (e.documents?.length) e.documents = e.documents.filter(d => !isBase64(d.url));
    return e;
  });

  return clean;
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
