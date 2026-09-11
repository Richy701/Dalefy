import {
  collection, doc, getDocs, setDoc, deleteDoc, getDoc,
  query, where, onSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { firebaseDb, firebaseAuth, waitForAuth } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import type { Trip } from "@/shared/types";
import { getDeviceId } from "./deviceId";

const TRIPS = "trips";
const TRIP_MEMBERS = "trip_members";
// Enable only after the API, server identity, and security rules are deployed together.
const USE_TRIP_API = process.env.EXPO_PUBLIC_TRIP_API_ENABLED === "true";

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Trip connection timed out")), 15000); }),
  ]).finally(() => clearTimeout(timer));
}

const API_BASE = (process.env.EXPO_PUBLIC_APP_URL ?? "https://dalefy.vercel.app").replace(/\/$/, "");

async function tripRequest(params: string, body?: unknown): Promise<{ trip?: Record<string, unknown> }> {
  await waitForAuth();
  const user = firebaseAuth().currentUser;
  const token = await user?.getIdToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${API_BASE}/api/trip${params}`, {
      method: body ? "POST" : "GET",
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    if (response.status === 404 && !body) {
      // A missing deployment is not an authoritative empty trip list.
      const error = await response.json().catch(() => null);
      if (error?.error === "Itinerary unavailable") return {};
      throw new Error("Trip service is not deployed");
    }
    if (!response.ok) throw new Error(response.status === 409 ? "Trip changed. Please try again." : "Unable to load or update trip");
    const data = await response.json();
    if (user?.uid !== firebaseAuth().currentUser?.uid) throw new Error("Account changed");
    return data;
  } finally { clearTimeout(timer); }
}

export async function fetchTrips(): Promise<Trip[]> {
  await waitForAuth();
  const uid = firebaseAuth().currentUser?.uid;
  if (!uid) throw new Error("Waiting for sign-in");
  const members = await withTimeout(getDocs(query(collection(firebaseDb(), TRIP_MEMBERS), where("uid", "==", uid))));
  const deviceId = await getDeviceId();
  const legacyMembers = USE_TRIP_API ? [] : (await withTimeout(getDocs(query(
    collection(firebaseDb(), TRIP_MEMBERS), where("device_id", "==", deviceId),
  )))).docs;
  const ids = [...new Set([...members.docs, ...legacyMembers].map(d => d.data().trip_id).filter((id): id is string => typeof id === "string" && !!id))];
  const trips = await Promise.all(ids.map(fetchTripById));
  if (uid !== firebaseAuth().currentUser?.uid) throw new Error("Account changed");
  return trips.filter((t): t is Trip => t !== null).sort((a, b) => b.start.localeCompare(a.start));
}

export function subscribeToTrips(onChange: (trips: Trip[]) => void): Unsubscribe {
  let cancelled = false;
  let fetching = false;
  let membershipUnsub: Unsubscribe = () => {};
  const refresh = async () => {
    if (cancelled || fetching) return;
    fetching = true;
    try {
      const trips = await fetchTrips();
      if (!cancelled) onChange(trips);
    } catch { /* Preserve offline cache on network failure, never on successful empty results. */ }
    finally { fetching = false; }
  };
  const authUnsub = onAuthStateChanged(firebaseAuth(), user => {
    membershipUnsub();
    const uid = user?.uid;
    if (cancelled || !uid) return;
    membershipUnsub = onSnapshot(query(collection(firebaseDb(), TRIP_MEMBERS), where("uid", "==", uid)), () => { void refresh(); });
  });
  void refresh();
  // Working trip documents are no longer readable by travelers.
  const timer = setInterval(() => { void refresh(); }, 30000);
  return () => { cancelled = true; clearInterval(timer); membershipUnsub(); authUnsub(); };
}

export async function changeTripMedia(tripId: string, add: NonNullable<Trip["media"]>, remove: string[] = []): Promise<void> {
  await tripRequest("", { tripId, add, remove });
}

export async function upsertTrip(trip: Trip): Promise<void> {
  // Compatibility for the gallery upload path: only append media, never write a trip.
  await changeTripMedia(trip.id, trip.media ?? []);
}

export async function removeTrip(id: string): Promise<void> {
  await deleteDoc(doc(firebaseDb(), TRIPS, id));
}

export async function fetchTripById(id: string): Promise<Trip | null> {
  if (!USE_TRIP_API) {
    await waitForAuth();
    const snap = await withTimeout(getDoc(doc(firebaseDb(), TRIPS, id)));
    return snap.exists() ? legacyDocToTrip(snap.id, snap.data()) : null;
  }
  const { trip } = await tripRequest(`?id=${encodeURIComponent(id)}`);
  return trip ? docToTrip(id, trip) : null;
}

export async function fetchTripByShortCode(code: string): Promise<Trip | null> {
  const normalized = code.trim().toUpperCase();
  if (!/^[A-Z0-9]{4,6}$/.test(normalized)) return null;
  if (!USE_TRIP_API) {
    await waitForAuth();
    for (const status of ["Published", "published"]) {
      const snap = await withTimeout(getDocs(query(collection(firebaseDb(), TRIPS),
        where("short_code", "==", normalized), where("status", "==", status))));
      if (!snap.empty) return legacyDocToTrip(snap.docs[0].id, snap.docs[0].data());
    }
    return null;
  }
  const { trip } = await tripRequest(`?code=${encodeURIComponent(normalized)}`);
  return trip ? docToTrip(String(trip.id), trip) : null;
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
  linkedTravelerId?: string,
  email?: string,
): Promise<boolean> {
  try {
    const deviceId = await getDeviceId();
    await waitForAuth();
    const uid = firebaseAuth().currentUser?.uid ?? null;
    const authEmail = email || firebaseAuth().currentUser?.email || null;

    const memberData = {
      device_id: deviceId,
      trip_id: tripId,
      trip_name: tripName,
      name: userName,
      avatar: avatar || null,
      joined_at: new Date().toISOString(),
      ...(uid ? { uid } : {}),
      ...(authEmail ? { email: authEmail } : {}),
      ...(linkedTravelerId ? { linked_traveler_id: linkedTravelerId } : {}),
    };

    // Device-keyed doc (includes uid so rules can verify ownership)
    const memberId = `${deviceId}_${tripId}`;
    await setDoc(doc(firebaseDb(), TRIP_MEMBERS, memberId), memberData, { merge: true });

    // UID-keyed doc so Firestore rules can verify membership via isTripMember()
    if (uid) {
      const uidMemberId = `${uid}_${tripId}`;
      await setDoc(doc(firebaseDb(), TRIP_MEMBERS, uidMemberId), memberData, { merge: true });
    }
    return true;
  } catch {
    // The membership write failed — the caller should surface this, since
    // fetchTrips keys off trip_members and the trip would otherwise silently
    // disappear on next load.
    return false;
  }
}

export async function fetchClaimedTravelerIds(tripId: string): Promise<Set<string>> {
  try {
    await waitForAuth();
    const snap = await getDocs(
      query(
        collection(firebaseDb(), TRIP_MEMBERS),
        where("trip_id", "==", tripId),
      ),
    );
    const claimed = new Set<string>();
    snap.forEach((d) => {
      const id = d.data().linked_traveler_id;
      if (id) claimed.add(id);
    });
    return claimed;
  } catch {
    return new Set();
  }
}

export async function updateLinkedTraveler(
  tripId: string,
  linkedTravelerId: string,
): Promise<void> {
  try {
    const deviceId = await getDeviceId();
    await waitForAuth();
    const uid = firebaseAuth().currentUser?.uid ?? null;

    const memberId = `${deviceId}_${tripId}`;
    await setDoc(
      doc(firebaseDb(), TRIP_MEMBERS, memberId),
      { linked_traveler_id: linkedTravelerId },
      { merge: true },
    );

    if (uid) {
      const uidMemberId = `${uid}_${tripId}`;
      await setDoc(
        doc(firebaseDb(), TRIP_MEMBERS, uidMemberId),
        { linked_traveler_id: linkedTravelerId },
        { merge: true },
      );
    }
  } catch {
    // non-critical
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

/** Contact changes belong to the caller's membership, never the private roster. */
export async function patchTravelerEmail(tripId: string, _travelerId: string, email: string): Promise<void> {
  try {
    await waitForAuth();
    const uid = firebaseAuth().currentUser?.uid;
    if (!uid) return;
    await setDoc(doc(firebaseDb(), TRIP_MEMBERS, `${uid}_${tripId}`), { email }, { merge: true });
  } catch { /* Joining remains successful when an optional contact update fails. */ }
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
    documents: (data.documents as Trip["documents"]) ?? undefined,
  };
}

// Temporary compatibility with the currently deployed Firestore reader.
// Keep the published itinerary separate from organizer edits; do not retain the raw document.
function legacyDocToTrip(id: string, data: Record<string, unknown>): Trip {
  const trip = docToTrip(id, data);
  const snap = data.published_snapshot as Trip["publishedSnapshot"];
  const published = snap ? {
    ...trip, name: snap.name, image: snap.image, destination: snap.destination,
    start: snap.start, end: snap.end, paxCount: snap.paxCount, events: snap.events,
    info: snap.info, organizer: snap.organizer, documents: snap.documents,
  } : trip;
  delete published.budget;
  delete published.travelerIds;
  published.travelers = published.travelers?.map(({ id, name, initials }) => ({ id, name, initials }));
  return published;
}
