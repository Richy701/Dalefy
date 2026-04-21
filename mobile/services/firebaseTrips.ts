import {
  collection, doc, getDocs, setDoc, deleteDoc, getDoc,
  query, orderBy, where, onSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { firebaseDb } from "./firebase";
import type { Trip } from "@/shared/types";
import { getDeviceId } from "./deviceId";

const TRIPS = "trips";
const TRIP_MEMBERS = "trip_members";

/**
 * Fetch only trips this device has explicitly joined (via PIN or creation).
 * 1. Get trip IDs from trip_members where device_id matches
 * 2. Fetch those trips from the trips collection
 */
export async function fetchTrips(): Promise<Trip[]> {
  const deviceId = await getDeviceId();

  // Get trip IDs this device has joined
  const memberSnap = await getDocs(
    query(collection(firebaseDb(), TRIP_MEMBERS), where("device_id", "==", deviceId)),
  );
  const tripIds = memberSnap.docs.map(d => d.data().trip_id as string);
  if (tripIds.length === 0) return [];

  // Firestore "in" queries support max 30 values — batch if needed
  const trips: Trip[] = [];
  for (let i = 0; i < tripIds.length; i += 30) {
    const batch = tripIds.slice(i, i + 30);
    const snap = await getDocs(
      query(collection(firebaseDb(), TRIPS), where("__name__", "in", batch)),
    );
    for (const d of snap.docs) {
      trips.push(docToTrip(d.id, d.data()));
    }
  }

  // Sort by start date descending
  trips.sort((a, b) => (b.start > a.start ? 1 : b.start < a.start ? -1 : 0));
  return trips;
}

export function subscribeToTrips(onChange: (trips: Trip[]) => void): Unsubscribe {
  // Initial fetch
  fetchTrips().then(onChange).catch(() => {});

  // Listen for changes on the trips collection
  const q = query(collection(firebaseDb(), TRIPS), orderBy("start", "desc"));
  return onSnapshot(q, () => {
    // Re-fetch with device filter when any trip changes
    fetchTrips().then(onChange).catch(() => {});
  });
}

export async function upsertTrip(trip: Trip): Promise<void> {
  await setDoc(doc(firebaseDb(), TRIPS, trip.id), tripToDoc(trip), { merge: true });
}

export async function removeTrip(id: string): Promise<void> {
  await deleteDoc(doc(firebaseDb(), TRIPS, id));
}

export async function fetchTripById(id: string): Promise<Trip | null> {
  const snap = await getDoc(doc(firebaseDb(), TRIPS, id));
  if (!snap.exists()) return null;
  return docToTrip(snap.id, snap.data());
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

// ── Trip Members ────────────────────────────────────────────────────────────

export async function logTripJoin(
  tripId: string,
  tripName: string,
  userName: string,
  avatar?: string,
): Promise<void> {
  try {
    const deviceId = await getDeviceId();
    const memberId = `${deviceId}_${tripId}`;
    await setDoc(doc(firebaseDb(), TRIP_MEMBERS, memberId), {
      device_id: deviceId,
      trip_id: tripId,
      trip_name: tripName,
      name: userName,
      avatar: avatar || null,
      joined_at: new Date().toISOString(),
    }, { merge: true });
  } catch {
    // non-critical — don't block the join flow
  }
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
