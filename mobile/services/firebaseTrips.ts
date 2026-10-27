import {
  collection, doc, getDocs, setDoc, deleteDoc, getDoc,
  query, where, onSnapshot, limit,
  type Unsubscribe,
} from "firebase/firestore";
import { firebaseDb, firebaseAuth, waitForAuth } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import type { Trip, Notification } from "@/shared/types";
import { getDeviceId } from "./deviceId";
import { AppState, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const TRIPS = "trips";
const TRIP_MEMBERS = "trip_members";
const TRIP_VERSIONS = "trip_versions";
// The filtered API is deployed. Only an explicit local override uses the legacy reader.
const USE_TRIP_API = process.env.EXPO_PUBLIC_TRIP_API_ENABLED !== "false";

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Trip connection timed out")), 15000); }),
  ]).finally(() => clearTimeout(timer));
}

const API_BASE = (process.env.EXPO_PUBLIC_APP_URL ?? "https://dalefy.vercel.app").replace(/\/$/, "");

async function tripRequest(params: string, body?: unknown): Promise<{ trip?: Record<string, unknown>; claimed?: unknown[] }> {
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

/** Full reload as a safety net; edits arrive through the trip_versions listeners */
const SAFETY_POLL_MS = 60 * 60_000;
/** Used only if the version listeners are refused (e.g. rules not deployed yet) */
const FALLBACK_POLL_MS = 5 * 60_000;

/**
 * Keeps the trip list current without re-downloading it on a timer.
 * Travellers can't read trip documents (they hold private fields), so each trip has
 * a tiny trip_versions/{id} stamp they can listen to. When a stamp moves, only that
 * trip is reloaded through the filtered /api/trip. Joining or leaving a trip, and
 * coming back to the app, reload the whole list.
 *
 * The initial list comes from TripsContext's query, so nothing is fetched here on start.
 */
export function subscribeToTrips(
  onChange: (trips: Trip[]) => void,
  onTrip: (id: string, trip: Trip | null) => void,
): Unsubscribe {
  let cancelled = false;
  let fetching = false;
  let lastFull = Date.now();
  let membershipIds: string | null = null;
  let membershipUnsub: Unsubscribe = () => {};
  const versionUnsubs = new Map<string, Unsubscribe>();
  let timer: ReturnType<typeof setInterval> | null = null;
  let pollMs = 0;

  const refresh = async () => {
    if (cancelled || fetching) return;
    fetching = true;
    lastFull = Date.now();
    try {
      const trips = await fetchTrips();
      if (!cancelled) onChange(trips);
    } catch { /* Preserve offline cache on network failure, never on successful empty results. */ }
    finally { fetching = false; }
  };

  const refreshOne = async (id: string) => {
    try {
      const trip = await fetchTripById(id);
      if (!cancelled) onTrip(id, trip);
    } catch { /* Offline: the next foreground or hourly check catches up */ }
  };

  const poll = (ms: number) => {
    if (ms === pollMs) return;
    pollMs = ms;
    if (timer) clearInterval(timer);
    timer = setInterval(() => { void refresh(); }, ms);
  };

  const listenToVersions = (ids: string[]) => {
    for (const [id, unsub] of versionUnsubs) {
      if (!ids.includes(id)) { unsub(); versionUnsubs.delete(id); }
    }
    for (const id of ids) {
      if (versionUnsubs.has(id)) continue;
      // The first value is the stamp for what's already loaded; only later moves are edits
      let seen: string | undefined;
      versionUnsubs.set(id, onSnapshot(doc(firebaseDb(), TRIP_VERSIONS, id), snap => {
        const stamp = snap.exists() ? JSON.stringify(snap.data().updated_at ?? null) : "none";
        if (seen === undefined || stamp === seen) { seen = stamp; return; }
        seen = stamp;
        void refreshOne(id);
      }, () => {
        versionUnsubs.delete(id);
        poll(FALLBACK_POLL_MS);
      }));
    }
  };

  const authUnsub = onAuthStateChanged(firebaseAuth(), user => {
    membershipUnsub();
    membershipIds = null;
    const uid = user?.uid;
    if (cancelled || !uid) { listenToVersions([]); return; }
    membershipUnsub = onSnapshot(query(collection(firebaseDb(), TRIP_MEMBERS), where("uid", "==", uid)), snap => {
      const ids = [...new Set(snap.docs.map(d => d.data().trip_id).filter((id): id is string => typeof id === "string" && !!id))];
      listenToVersions(ids);
      if (snap.metadata.fromCache) return;
      const key = [...ids].sort().join(",");
      // Joined or left a trip since the last server answer
      if (membershipIds !== null && key !== membershipIds) void refresh();
      membershipIds = key;
    });
  });

  // Listeners can pause while the app is in the background; catch up on return
  const appStateSub = AppState.addEventListener("change", state => {
    if (state === "active" && Date.now() - lastFull > 60_000) void refresh();
  });

  poll(SAFETY_POLL_MS);
  return () => {
    cancelled = true;
    if (timer) clearInterval(timer);
    for (const unsub of versionUnsubs.values()) unsub();
    versionUnsubs.clear();
    membershipUnsub();
    authUnsub();
    appStateSub.remove();
  };
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

// ── Trips by sign-in email ─────────────────────────────────────────────────

export interface MyTrip { trip: Trip; travelerId: string | null; travelerName: string | null }

/**
 * The published trips the organiser listed this person's email on, and who they are on each. The server
 * matches the verified sign-in email; the app never sees anyone else's email. Empty for guests.
 */
export async function fetchMyTrips(): Promise<{ name: string | null; trips: MyTrip[] }> {
  await waitForAuth();
  const user = firebaseAuth().currentUser;
  if (!user || user.isAnonymous) return { name: null, trips: [] };
  const token = await user.getIdToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${API_BASE}/api/my-trips`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
    if (!response.ok) return { name: null, trips: [] };
    const data = await response.json() as { name?: string | null; trips?: Array<{ trip: Record<string, unknown>; travelerId: string | null; travelerName: string | null }> };
    return {
      name: data.name ?? null,
      trips: (data.trips ?? []).map(t => ({ trip: docToTrip(String(t.trip.id), t.trip), travelerId: t.travelerId, travelerName: t.travelerName })),
    };
  } catch {
    return { name: null, trips: [] };
  } finally { clearTimeout(timer); }
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

/**
 * Subscribe to role changes for the current account on a specific trip.
 * The server grants leader access from the account membership, so watch that
 * first and fall back to the legacy device membership. Listener errors never
 * downgrade the role: the last known value stays until a document says otherwise.
 */
export function subscribeToMemberRole(
  tripId: string,
  onChange: (role: TripMemberRole) => void,
): Unsubscribe {
  let cancelled = false;
  let accountUnsub: Unsubscribe = () => {};
  let deviceUnsub: Unsubscribe = () => {};
  const roleOf = (data: Record<string, unknown>) => (data.role as TripMemberRole) || "traveler";
  getDeviceId().then(deviceId => {
    if (cancelled) return;
    const watchDevice = () => {
      deviceUnsub();
      deviceUnsub = onSnapshot(doc(firebaseDb(), TRIP_MEMBERS, `${deviceId}_${tripId}`), (snap) => {
        if (!cancelled) onChange(snap.exists() ? roleOf(snap.data()) : "traveler");
      }, () => { /* keep last known role */ });
    };
    const uid = firebaseAuth().currentUser?.uid;
    if (!uid) { watchDevice(); return; }
    accountUnsub = onSnapshot(doc(firebaseDb(), TRIP_MEMBERS, `${uid}_${tripId}`), (snap) => {
      if (cancelled) return;
      if (snap.exists()) { deviceUnsub(); deviceUnsub = () => {}; onChange(roleOf(snap.data())); }
      else watchDevice();
    }, () => { /* keep last known role */ });
  });
  return () => { cancelled = true; accountUnsub(); deviceUnsub(); };
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
      avatar: remoteAvatar(avatar),
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

/**
 * Take this account off a trip. Both membership records go (account- and device-keyed), so the trip
 * leaves every phone signed in as them and the organiser's roster no longer lists them.
 */
export async function leaveTrip(tripId: string): Promise<void> {
  await waitForAuth();
  const uid = firebaseAuth().currentUser?.uid;
  const deviceId = await getDeviceId();
  if (uid) await deleteDoc(doc(firebaseDb(), TRIP_MEMBERS, `${uid}_${tripId}`));
  // Older device-keyed records may predate the account and refuse the delete; the account record is what matters
  await deleteDoc(doc(firebaseDb(), TRIP_MEMBERS, `${deviceId}_${tripId}`)).catch((err: { code?: string }) => {
    if (!uid || err?.code !== "permission-denied") throw err;
  });
}

const LAST_SEEN_EVERY_MS = 15 * 60_000;

/** Stamps this account's memberships with when the app was last opened, so organisers can see who is active */
export async function touchLastSeen(): Promise<void> {
  try {
    await waitForAuth();
    const uid = firebaseAuth().currentUser?.uid;
    if (!uid) return;
    const key = `daf-last-seen:${uid}`;
    const last = Number(await AsyncStorage.getItem(key)) || 0;
    if (Date.now() - last < LAST_SEEN_EVERY_MS) return;
    const snap = await getDocs(query(collection(firebaseDb(), TRIP_MEMBERS), where("uid", "==", uid)));
    if (snap.empty) return;
    const stamp = { last_seen_at: new Date().toISOString(), platform: Platform.OS };
    await Promise.all(snap.docs.map(d => setDoc(d.ref, stamp, { merge: true }).catch(() => {})));
    await AsyncStorage.setItem(key, String(Date.now()));
  } catch { /* cosmetic: the organiser just sees an older time */ }
}

/** Traveller IDs someone on the trip has already picked. Asked of the server, which never says who picked them. */
export async function fetchClaimedTravelerIds(tripId: string): Promise<Set<string>> {
  try {
    await waitForAuth();
    const { claimed } = await tripRequest(`?id=${encodeURIComponent(tripId)}&claimed=1`);
    return new Set(Array.isArray(claimed) ? claimed.filter((id): id is string => typeof id === "string") : []);
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
/** Only an uploaded photo belongs in the roster; a phone-local picker path would be unreadable everywhere else. */
function remoteAvatar(avatar?: string | null): string | null {
  return avatar && /^https:\/\//.test(avatar) ? avatar : null;
}

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
      await setDoc(d.ref, { name, avatar: remoteAvatar(avatar) }, { merge: true });
      const data = d.data();
      if (data.trip_id) tripIds.add(data.trip_id);
    }

    // Also update device-keyed docs (they now have uid field too)
    for (const tripId of tripIds) {
      const deviceDocId = `${deviceId}_${tripId}`;
      const deviceRef = doc(firebaseDb(), TRIP_MEMBERS, deviceDocId);
      const deviceSnap = await getDoc(deviceRef);
      if (deviceSnap.exists()) {
        await setDoc(deviceRef, { name, avatar: remoteAvatar(avatar), uid }, { merge: true });
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
    imagePosition: (data.image_position as Trip["imagePosition"]) ?? undefined,
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
    ...trip, name: snap.name, image: snap.image, imagePosition: snap.imagePosition, destination: snap.destination,
    start: snap.start, end: snap.end, paxCount: snap.paxCount, events: snap.events,
    info: snap.info, organizer: snap.organizer, documents: snap.documents,
  } : trip;
  delete published.budget;
  delete published.travelerIds;
  published.travelers = published.travelers?.map(({ id, name, initials }) => ({ id, name, initials }));
  return published;
}

/** What organisers, flight alerts and itinerary changes have sent this account, from the server's push log; the app's inbox, however the push arrived */
export async function fetchInbox(): Promise<Notification[]> {
  try {
    await waitForAuth();
    const uid = firebaseAuth().currentUser?.uid;
    if (!uid) return [];
    const snap = await getDocs(query(collection(firebaseDb(), "push_log"), where("recipients", "array-contains", uid), limit(50)));
    return snap.docs.map(d => {
      const e = d.data();
      const sentAt = new Date(typeof e.sent_at === "string" ? e.sent_at : Number(d.id.split("-")[0]));
      return {
        id: d.id,
        message: String(e.title ?? "Trip update"),
        detail: String(e.body ?? ""),
        time: sentAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        read: false,
        type: e.category === "flight" ? "flight" : "info",
        tripId: typeof e.trip_id === "string" ? e.trip_id : undefined,
        eventId: typeof e.event_id === "string" ? e.event_id : undefined,
        date: typeof e.date === "string" ? e.date : undefined,
        infoId: typeof e.info_id === "string" ? e.info_id : undefined,
        logged: true,
      } satisfies Notification;
    });
  } catch {
    return [];
  }
}
