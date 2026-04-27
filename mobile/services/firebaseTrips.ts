import {
  collection, doc, getDocs, setDoc, deleteDoc, getDoc,
  query, orderBy, where, onSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { firebaseDb, firebaseAuth, waitForAuth } from "./firebase";
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

  // Listen to the specific trips this device has joined — avoids security rule
  // issues with broad collection queries and ensures we get notified of all
  // changes (including event reordering, layout edits, etc.)
  let innerUnsubs: Unsubscribe[] = [];

  async function setupListeners() {
    try {
      const deviceId = await getDeviceId();
      const memberSnap = await getDocs(
        query(collection(firebaseDb(), TRIP_MEMBERS), where("device_id", "==", deviceId)),
      );
      const tripIds = memberSnap.docs.map(d => d.data().trip_id as string);

      // Backfill UID-keyed member docs for Firestore rule checks
      try {
        await waitForAuth();
        const uid = firebaseAuth().currentUser?.uid;
        if (uid) {
          for (const memberDoc of memberSnap.docs) {
            const data = memberDoc.data();
            const uidKey = `${uid}_${data.trip_id}`;
            // Only create if it doesn't exist yet (merge: true is safe)
            setDoc(doc(firebaseDb(), TRIP_MEMBERS, uidKey), {
              ...data,
              uid,
            }, { merge: true }).catch(() => {});
          }
        }
      } catch { /* auth not ready — skip backfill */ }

      // Clean up any previous listeners
      innerUnsubs.forEach(u => u());
      innerUnsubs = [];

      if (tripIds.length === 0) return;

      // Subscribe to each trip doc individually
      for (const tripId of tripIds) {
        const unsub = onSnapshot(doc(firebaseDb(), TRIPS, tripId), () => {
          // Any trip doc changed — re-fetch all joined trips
          fetchTrips().then(onChange).catch(() => {});
        }, (err) => {
          console.warn(`[subscribeToTrips] listener error for ${tripId}:`, err.message);
        });
        innerUnsubs.push(unsub);
      }
    } catch (err) {
      console.warn("[subscribeToTrips] setup failed:", err);
    }
  }

  setupListeners();

  return () => { innerUnsubs.forEach(u => u()); };
}

export async function upsertTrip(trip: Trip): Promise<void> {
  console.log("[upsertTrip] saving trip:", trip.id, "media:", trip.media?.length ?? 0);
  await setDoc(doc(firebaseDb(), TRIPS, trip.id), tripToDoc(trip), { merge: true });
  console.log("[upsertTrip] done");
}

export async function removeTrip(id: string): Promise<void> {
  await deleteDoc(doc(firebaseDb(), TRIPS, id));
}

export async function fetchTripById(id: string): Promise<Trip | null> {
  try {
    const snap = await getDoc(doc(firebaseDb(), TRIPS, id));
    if (!snap.exists()) return null;
    return docToTrip(snap.id, snap.data());
  } catch {
    // getDoc can fail on security rules for unpublished trips
    return null;
  }
}

export async function fetchTripByShortCode(code: string): Promise<Trip | null> {
  const normalized = code.trim().toUpperCase();
  if (!/^[A-Z0-9]{4,6}$/.test(normalized)) return null;

  // The status filter is required by Firestore security rules —
  // unauthenticated reads are only allowed for published trips,
  // and Firestore rejects queries that could return non-published docs.
  for (const status of ["Published", "published"]) {
    try {
      const q = query(
        collection(firebaseDb(), TRIPS),
        where("short_code", "==", normalized),
        where("status", "==", status),
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        return docToTrip(snap.docs[0].id, snap.docs[0].data());
      }
    } catch (err) {
      console.warn(`[fetchTripByShortCode] query failed for status="${status}":`, err);
    }
  }
  return null;
}

// ── Role Check ─────────────────────────────────────────────────────────────

export type TripMemberRole = "traveler" | "leader";

/** Get this device's role for a specific trip */
export async function fetchMemberRole(tripId: string): Promise<TripMemberRole> {
  try {
    const deviceId = await getDeviceId();
    const snap = await getDoc(doc(firebaseDb(), TRIP_MEMBERS, `${deviceId}_${tripId}`));
    if (snap.exists()) {
      return (snap.data().role as TripMemberRole) || "traveler";
    }
  } catch { /* default to traveler */ }
  return "traveler";
}

/** Subscribe to role changes for this device on a specific trip */
export function subscribeToMemberRole(
  tripId: string,
  onChange: (role: TripMemberRole) => void,
): Unsubscribe {
  let unsub: Unsubscribe = () => {};
  getDeviceId().then(deviceId => {
    unsub = onSnapshot(doc(firebaseDb(), TRIP_MEMBERS, `${deviceId}_${tripId}`), (snap) => {
      if (snap.exists()) {
        onChange((snap.data().role as TripMemberRole) || "traveler");
      } else {
        onChange("traveler");
      }
    }, () => { onChange("traveler"); });
  });
  return () => unsub();
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
    await waitForAuth();
    const uid = firebaseAuth().currentUser?.uid ?? null;

    const memberData = {
      device_id: deviceId,
      trip_id: tripId,
      trip_name: tripName,
      name: userName,
      avatar: avatar || null,
      joined_at: new Date().toISOString(),
      ...(uid ? { uid } : {}),
    };

    // Device-keyed doc (includes uid so rules can verify ownership)
    const memberId = `${deviceId}_${tripId}`;
    await setDoc(doc(firebaseDb(), TRIP_MEMBERS, memberId), memberData, { merge: true });

    // UID-keyed doc so Firestore rules can verify membership via isTripMember()
    if (uid) {
      const uidMemberId = `${uid}_${tripId}`;
      await setDoc(doc(firebaseDb(), TRIP_MEMBERS, uidMemberId), memberData, { merge: true });
    }
  } catch {
    // non-critical — don't block the join flow
  }
}

/** Update name/avatar on all existing trip_members docs for this device */
export async function updateMemberProfile(name: string, avatar: string | null): Promise<void> {
  try {
    await waitForAuth();
    const uid = firebaseAuth().currentUser?.uid;
    if (!uid) return;

    // Query by uid — Firestore rules allow update when resource.data.uid == request.auth.uid
    const snap = await getDocs(
      query(collection(firebaseDb(), TRIP_MEMBERS), where("uid", "==", uid)),
    );
    console.log("[updateMemberProfile] uid:", uid, "found", snap.size, "docs, name:", name);
    if (snap.empty) return;

    // Collect device-keyed doc IDs to update those too
    const deviceId = await getDeviceId();
    const tripIds = new Set<string>();

    for (const d of snap.docs) {
      await setDoc(d.ref, { name, avatar: avatar || null }, { merge: true });
      const data = d.data();
      if (data.trip_id) tripIds.add(data.trip_id);
    }

    // Also update device-keyed docs (they now have uid field too)
    for (const tripId of tripIds) {
      const deviceDocId = `${deviceId}_${tripId}`;
      const deviceRef = doc(firebaseDb(), TRIP_MEMBERS, deviceDocId);
      const deviceSnap = await getDoc(deviceRef);
      if (deviceSnap.exists()) {
        await setDoc(deviceRef, { name, avatar: avatar || null, uid }, { merge: true });
      }
    }
    console.log("[updateMemberProfile] done");
  } catch (err) {
    console.warn("[updateMemberProfile] failed:", err);
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
