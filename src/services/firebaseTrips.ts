import { tripPatch, syncLinkedOrganizer } from "@/lib/tripSave";
import { deriveAttendeesString } from "@/lib/travelerSync";
import {
  runTransaction, collection, doc, getDoc, getDocs, setDoc, deleteDoc, deleteField, writeBatch, query, orderBy, where, onSnapshot, serverTimestamp,
  documentId, limit,
  type Unsubscribe,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { shrinkImage } from "@/lib/shrinkImage";
import { onAuthStateChanged } from "firebase/auth";
import { firebaseDb, firebaseAuth, firebaseStorage } from "./firebase";
import type { Trip } from "@/types";
import { logger } from "@/lib/logger";

const TRIPS = "trips";
const TRIP_MEMBERS = "trip_members";

/** Demo/seed trip IDs - never return these from cloud queries */
const DEMO_IDS = new Set(["1", "2", "3", "4", "5", "6", "7", "8"]);

/** Wait for Firebase Auth to resolve AND ensure the ID token is ready.
 *  currentUser is null until the SDK restores from IndexedDB, and the
 *  Firestore SDK needs a valid token before queries will succeed. */
export function waitForAuth(): Promise<string | null> {
  const auth = firebaseAuth();
  const ensureToken = async (user: import("firebase/auth").User) => {
    await user.getIdToken();
    return user.uid;
  };
  if (auth.currentUser) return ensureToken(auth.currentUser);
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      unsub();
      if (!user) { resolve(null); return; }
      resolve(await ensureToken(user));
    });
  });
}

export async function fetchTrips(orgId?: string | null): Promise<Trip[]> {
  const uid = await waitForAuth();
  if (!uid) return [];

  const constraint = orgId
    ? where("organization_id", "==", orgId)
    : where("user_id", "==", uid);

  const snap = await getDocs(
    query(collection(firebaseDb(), TRIPS), constraint, orderBy("start", "desc")),
  );
  const all = snap.docs.map((d) => docToTrip(d.id, d.data()));
  const filtered = all.filter((t) => !DEMO_IDS.has(t.id));
  const blocked = all.length - filtered.length;
  if (blocked > 0) logger.log("fetchTrips", `filtered out ${blocked} demo trips from ${all.length} total`);
  return filtered;
}

/** `fromCache` is true when the snapshot came from the offline copy rather than the server. `onGiveUp` fires once retries run out. */
export function subscribeToTrips(onChange: (trips: Trip[], fromCache: boolean) => void, orgId?: string | null, onGiveUp?: () => void): Unsubscribe {
  let innerUnsub: Unsubscribe | null = null;
  let cancelled = false;

  const startListener = (uid: string, attempt = 1) => {
    if (cancelled) return;
    const constraint = orgId
      ? where("organization_id", "==", orgId)
      : where("user_id", "==", uid);
    const q = query(collection(firebaseDb(), TRIPS), constraint, orderBy("start", "desc"));
    innerUnsub = onSnapshot(q, (snap) => {
      const all = snap.docs.map((d) => docToTrip(d.id, d.data()));
      const filtered = all.filter((t) => !DEMO_IDS.has(t.id));
      const blocked = all.length - filtered.length;
      if (blocked > 0) logger.log("subscribeToTrips", `filtered out ${blocked} demo trips from ${all.length} total`);
      onChange(filtered, snap.metadata.fromCache);
    }, (err) => {
      logger.log("subscribeToTrips", `snapshot error (attempt ${attempt}):`, err.message);
      if (cancelled) return;
      if (attempt < 3) setTimeout(() => startListener(uid, attempt + 1), attempt * 1500);
      else onGiveUp?.();
    });
  };

  waitForAuth().then((uid) => {
    if (!uid || cancelled) { onChange([], false); return; }
    startListener(uid);
  });

  return () => { cancelled = true; innerUnsub?.(); };
}

export async function backfillOrgId(orgId: string): Promise<number> {
  const uid = await waitForAuth();
  if (!uid) return 0;

  const snap = await getDocs(
    query(collection(firebaseDb(), TRIPS), where("user_id", "==", uid)),
  );

  let count = 0;
  for (const d of snap.docs) {
    if (DEMO_IDS.has(d.id)) continue;
    const data = d.data();
    if (data.organization_id) continue;
    await setDoc(d.ref, { organization_id: orgId }, { merge: true });
    count++;
  }
  if (count > 0) logger.log("backfillOrgId", `stamped ${count} trips with org ${orgId}`);
  return count;
}

const tripSaves = new Map<string, Promise<unknown>>();
export async function upsertTrip(trip: Trip, orgId?: string | null, before?: Trip): Promise<Trip> {
  const previous = tripSaves.get(trip.id) || Promise.resolve();
  const save = previous.catch(() => {}).then(() => persistTrip(trip, orgId, before));
  tripSaves.set(trip.id, save);
  try { return await save; } finally { if (tripSaves.get(trip.id) === save) tripSaves.delete(trip.id); }
}
async function persistTrip(trip: Trip, orgId?: string | null, before?: Trip): Promise<Trip> {
  const auth = firebaseAuth();
  const userId = auth.currentUser?.uid ?? null;

  if (!userId) throw new Error("Sign in before saving a trip");
  const tripRef = doc(firebaseDb(), TRIPS, trip.id);
  let isNew = false;
  try {
    isNew = !(await getDoc(tripRef)).exists();
  } catch (error) {
    // Rules may deny reading a missing document. A guarded create below still
    // cannot replace an existing record owned by another account.
    if ((error as { code?: string }).code !== "permission-denied") throw error;
    isNew = true;
  }
  if (isNew) {
    await setDoc(tripRef, {
      user_id: userId, organization_id: orgId ?? trip.organizationId ?? null,
      name: trip.name, start: trip.start, end_date: trip.end,
      status: "Draft", events: [],
    });
  }
  const cleanTrip = await uploadTripImages(trip);
  const data = tripToDoc(cleanTrip);
  if (orgId) data.organization_id = orgId;
  // What changed is decided on the trip as the editor has it, before photos are uploaded: an upload gives a
  // photo a new address every time, which would otherwise read as an edit that clashes with the stored one
  const desired = tripToDoc(trip);
  if (orgId) desired.organization_id = orgId;

  logger.log("upsertTrip", "saving:", trip.id, trip.name, orgId ? `org:${orgId}` : "no-org", isNew ? "(new)" : "(update)");
  const saved = await runTransaction(firebaseDb(), async tx => {
    const latest = await tx.get(tripRef);
    const current = latest.data() || {};
    const patch = before ? tripPatch(tripToDoc(before), desired, current) : data;
    // The fields that did change are written with their uploaded photo addresses
    if (before) for (const key of Object.keys(patch)) if (key !== 'history' && key in data) patch[key] = data[key];
    const merged = syncLinkedOrganizer({ ...current, ...patch });
    if ('travelers' in patch) {
      const travelers = (merged.travelers || []) as Array<{ name: string; email?: string }>;
      merged.attendees = deriveAttendeesString(travelers);
      merged.pax_count = String(travelers.length);
      merged.traveler_emails = [...new Set(travelers.map(person => (person.email || '').trim().toLowerCase()).filter(Boolean))];
    }
    tx.set(tripRef, merged, { merge: true });
    tx.set(doc(firebaseDb(), 'trip_versions', trip.id), { updated_at: serverTimestamp() });
    return docToTrip(trip.id, merged);
  });
  // Travellers' apps listen to this stamp and reload the filtered trip when it moves.
  // Best-effort: a missed stamp only delays their update to the app's next check.
  setDoc(doc(firebaseDb(), "trip_versions", trip.id), { updated_at: serverTimestamp() })
    .catch((err) => logger.error("upsertTrip", "trip_versions stamp failed:", err));
  return saved;
}

export async function removeTrip(id: string): Promise<void> {
  // Cascade: delete trip_members for this trip so they don't become orphans
  try {
    const members = await getDocs(query(collection(firebaseDb(), TRIP_MEMBERS), where("trip_id", "==", id)));
    if (members.size > 0) {
      const batch = writeBatch(firebaseDb());
      for (const d of members.docs) batch.delete(d.ref);
      await batch.commit();
      logger.log("removeTrip", `cascade-deleted ${members.size} trip_members for trip ${id}`);
    }
  } catch (err) {
    logger.error("removeTrip", "trip_members cleanup failed (continuing):", err);
  }
  await deleteDoc(doc(firebaseDb(), TRIPS, id));
}

export async function fetchTripByShortCode(code: string): Promise<Trip | null> {
  const normalized = code.trim().toUpperCase();
  if (!/^[A-Z0-9]{4,6}$/.test(normalized)) return null;

  const { apiFetch } = await import("@/lib/api");
  const { trip } = await apiFetch<{ trip: Record<string, unknown> }>(`/api/trip?code=${encodeURIComponent(normalized)}`);
  return trip ? docToTrip(String(trip.id), trip) : null;
}

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I to avoid confusion
function randomCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return code;
}

export function generateUniqueShortCode(): string {
  return randomCode();
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
  linked_traveler_id?: string;
  uid?: string;
  email?: string;
  /** When they last opened the app, stamped by the app a few times a day */
  last_seen_at?: string;
  platform?: string;
}

export interface PushLogEntry {
  id: string;
  trip_id: string;
  trip_name: string;
  category: "message" | "flight" | "trip_update";
  title: string;
  body: string;
  recipients: string[];
  sent_by: string;
  sent_at: string;
  sent: number;
  failed: number;
  /** People it didn't notify (it's still in their app inbox); only on messages sent since this was recorded */
  missed?: string[];
}

/**
 * Pushes one person received, newest first. Read per trip, the way the rules let staff read a trip's
 * records; IDs are time-first, so descending document order is newest first without an index.
 */
export async function fetchPushLog(personKeys: string[], tripIds: string[], max = 20): Promise<PushLogEntry[]> {
  const keys = new Set(personKeys.filter(Boolean));
  const ids = [...new Set(tripIds.filter(Boolean))];
  const snaps = await Promise.all(ids.map(id =>
    getDocs(query(collection(firebaseDb(), "push_log"), where("trip_id", "==", id), orderBy(documentId(), "desc"), limit(60))).catch(() => null),
  ));
  return snaps.flatMap(s => s?.docs ?? [])
    .map(d => ({ id: d.id, ...(d.data() as Omit<PushLogEntry, "id">) }))
    .filter(e => (e.recipients ?? []).some(k => keys.has(k)))
    .sort((a, b) => String(b.sent_at).localeCompare(String(a.sent_at)))
    .slice(0, max);
}

/** An app user is one person whether a doc names their device or their account */
const isPerson = (data: { device_id?: string; uid?: string }, key: string) => data.device_id === key || data.uid === key;

/**
 * Every member doc on the given trips. Read one trip at a time: the rules only let a trip's own staff read
 * its roster, and only through a query filtered on that trip.
 */
async function memberDocsOfTrips(tripIds: string[]) {
  const ids = [...new Set(tripIds.filter(Boolean))];
  const snaps = await Promise.all(ids.map(id =>
    getDocs(query(collection(firebaseDb(), TRIP_MEMBERS), where("trip_id", "==", id))).catch(() => null),
  ));
  return snaps.flatMap(snap => snap?.docs ?? []);
}

export async function fetchTripMembers(tripIds: string[]): Promise<TripMember[]> {
  try {
    const docs = await memberDocsOfTrips(tripIds);
    // Deduplicate: logTripJoin creates two docs per join (device_id + uid keyed).
    // Keep one entry per device_id+trip_id pair - prefer the device-keyed doc.
    const all = docs.map((d) => d.data() as TripMember)
      .sort((a, b) => String(b.joined_at ?? "").localeCompare(String(a.joined_at ?? "")));
    const seen = new Map<string, TripMember>();
    for (const m of all) {
      const key = `${m.device_id}_${m.trip_id}`;
      const kept = seen.get(key);
      if (!kept) { seen.set(key, m); continue; }
      // The app writes a confirmed email and the account onto the account-keyed doc only; carry them over
      if (!kept.email && m.email) kept.email = m.email;
      if (!kept.uid && m.uid) kept.uid = m.uid;
      if (!kept.linked_traveler_id && m.linked_traveler_id) kept.linked_traveler_id = m.linked_traveler_id;
      if (m.last_seen_at && (!kept.last_seen_at || m.last_seen_at > kept.last_seen_at)) { kept.last_seen_at = m.last_seen_at; kept.platform = m.platform; }
    }
    return Array.from(seen.values());
  } catch {
    return [];
  }
}

/** Point a member's app account at one of the trip's travellers, on both of their docs (null unlinks them) */
export async function setMemberTraveler(tripId: string, deviceId: string, travelerId: string | null): Promise<void> {
  const docs = (await memberDocsOfTrips([tripId])).filter(d => d.data().device_id === deviceId);
  await Promise.all(docs.map(d => setDoc(d.ref, { linked_traveler_id: travelerId ?? deleteField() }, { merge: true })));
}

/** Unlink whoever picked this traveller in the app, e.g. when the traveller is taken off the trip */
export async function unlinkTraveler(tripId: string, travelerId: string): Promise<void> {
  const docs = (await memberDocsOfTrips([tripId])).filter(d => d.data().linked_traveler_id === travelerId);
  await Promise.all(docs.map(d => setDoc(d.ref, { linked_traveler_id: deleteField() }, { merge: true })));
}

/** Delete a device's trip_members docs (both device-keyed and uid-keyed) on the given trips */
/** A roster entry someone picked in the app, so removing them can take it off the trip too */
export interface RosterLink { tripId: string; travelerId: string }

const rosterLinks = (docs: { data(): Record<string, any> }[]): RosterLink[] =>
  docs.map(d => ({ tripId: d.data().trip_id, travelerId: d.data().linked_traveler_id }))
    .filter((l): l is RosterLink => typeof l.tripId === "string" && typeof l.travelerId === "string" && !!l.travelerId);

export async function deleteAppUser(deviceId: string, tripIds: string[]): Promise<{ count: number; links: RosterLink[] }> {
  const refs = new Map<string, import("firebase/firestore").DocumentReference>();
  const matched = (await memberDocsOfTrips(tripIds)).filter(d => isPerson(d.data(), deviceId));
  for (const d of matched) refs.set(d.id, d.ref);

  if (refs.size === 0) return { count: 0, links: [] };

  const db = firebaseDb();
  const allRefs = [...refs.values()];
  // Firestore batches support up to 500 ops
  for (let i = 0; i < allRefs.length; i += 500) {
    const batch = writeBatch(db);
    for (const r of allRefs.slice(i, i + 500)) batch.delete(r);
    await batch.commit();
  }
  logger.log("deleteAppUser", `deleted ${allRefs.length} docs for device ${deviceId}`);
  return { count: allRefs.length, links: rosterLinks(matched) };
}

/** Delete several people's trip_members docs on the given trips with one roster read; returns how many people had any */
export async function deleteAppUsers(personKeys: string[], tripIds: string[]): Promise<{ count: number; links: RosterLink[] }> {
  const keys = new Set(personKeys);
  const docs = (await memberDocsOfTrips(tripIds)).filter(d => keys.has(d.data().device_id) || keys.has(d.data().uid));
  if (docs.length === 0) return { count: 0, links: [] };
  const db = firebaseDb();
  for (let i = 0; i < docs.length; i += 500) {
    const batch = writeBatch(db);
    for (const d of docs.slice(i, i + 500)) batch.delete(d.ref);
    await batch.commit();
  }
  const found = new Set(docs.flatMap(d => [d.data().device_id, d.data().uid].filter(Boolean)));
  const people = [...keys].filter(k => found.has(k)).length;
  logger.log("deleteAppUsers", `deleted ${docs.length} docs for ${people} people`);
  return { count: people, links: rosterLinks(docs) };
}

/** Update the role on all of a person's trip_members docs for one trip */
export async function updateTripMemberRole(
  personKey: string,
  tripId: string,
  role: TripMemberRole,
): Promise<void> {
  const docs = (await memberDocsOfTrips([tripId])).filter(d => isPerson(d.data(), personKey));
  for (const d of docs) {
    try {
      await setDoc(d.ref, { role }, { merge: true });
    } catch (err) {
      logger.error("updateTripMemberRole", `failed on doc ${d.id}:`, err);
      throw err;
    }
  }
}

/** Remove a person from a single trip (every doc of theirs on it, device- or account-keyed) */
export async function removeUserFromTrip(personKey: string, tripId: string): Promise<number> {
  const docs = (await memberDocsOfTrips([tripId])).filter(d => isPerson(d.data(), personKey));
  if (docs.length === 0) return 0;
  const batch = writeBatch(firebaseDb());
  for (const d of docs) batch.delete(d.ref);
  await batch.commit();
  logger.log("removeUserFromTrip", `removed ${docs.length} docs for ${personKey} from trip ${tripId}`);
  return docs.length;
}

/** Rename an app user across their trip_members docs on the given trips */
export async function renameAppUser(deviceId: string, newName: string, tripIds: string[]): Promise<number> {
  const docs = (await memberDocsOfTrips(tripIds)).filter(d => isPerson(d.data(), deviceId));
  let updated = 0;
  for (const d of docs) {
    try { await setDoc(d.ref, { name: newName }, { merge: true }); updated++; } catch { /* skip */ }
  }
  logger.log("renameAppUser", `renamed ${updated} docs for device ${deviceId} to "${newName}"`);
  return updated;
}

/** Remove everyone who joined the given trips in the app */
export async function deleteAllTripMembers(tripIds: string[]): Promise<number> {
  const docs = await memberDocsOfTrips(tripIds);
  if (!docs.length) return 0;
  let deleted = 0;
  for (const d of docs) {
    try {
      await deleteDoc(d.ref);
      deleted++;
    } catch (err) {
      logger.log("deleteAllTripMembers", `failed to delete ${d.id}:`, err);
    }
  }
  logger.log("deleteAllTripMembers", `deleted ${deleted}/${docs.length} docs`);
  return deleted;
}

// ── Repair: restore user_id ownership ────────────────────────────────────

/** Look up a user's Firebase UID from their email in the profiles collection */
async function findUidByEmail(email: string): Promise<string | null> {
  const snap = await getDocs(
    query(collection(firebaseDb(), "profiles"), where("email", "==", email)),
  );
  return snap.empty ? null : snap.docs[0].id;
}

/**
 * One-time repair: restore `user_id` on trips that were incorrectly overwritten.
 * Finds all org trips where user_id != the original creator, and reassigns
 * trips back to the correct owner based on their email.
 *
 * Call from browser console:
 *   import('/src/services/firebaseTrips.ts').then(m => m.repairTripOwnership('org-id'))
 */
export async function repairTripOwnership(orgId: string): Promise<{ fixed: number; skipped: number; log: string[] }> {
  const db = firebaseDb();
  const currentUid = firebaseAuth().currentUser?.uid;
  if (!currentUid) return { fixed: 0, skipped: 0, log: ["Not authenticated"] };

  const ashUid = await findUidByEmail("ash.murray@dialaflight.co.uk");
  if (!ashUid) return { fixed: 0, skipped: 0, log: ["Could not find Ash's profile by email"] };

  const snap = await getDocs(
    query(collection(db, TRIPS), where("organization_id", "==", orgId)),
  );

  const log: string[] = [];
  let fixed = 0;
  let skipped = 0;

  for (const d of snap.docs) {
    if (DEMO_IDS.has(d.id)) continue;
    const data = d.data();
    const currentOwner = data.user_id as string;

    // If the trip's user_id matches the current user (you) but was likely
    // created by Ash - check trip_members for the earliest join to infer creator
    if (currentOwner === currentUid) {
      const memberSnap = await getDocs(
        query(collection(db, TRIP_MEMBERS), where("trip_id", "==", d.id)),
      );
      const members = memberSnap.docs.map(m => m.data());
      const ashMember = members.find(m => m.uid === ashUid || m.device_id?.includes(ashUid));

      if (ashMember) {
        log.push(`Restoring "${data.name}" (${d.id}) → Ash (was ${currentOwner.slice(0, 8)}...)`);
        await setDoc(d.ref, { user_id: ashUid }, { merge: true });
        fixed++;
      } else {
        skipped++;
      }
    } else {
      skipped++;
    }
  }

  log.push(`Done: ${fixed} fixed, ${skipped} skipped`);
  for (const l of log) logger.log("repairTripOwnership", l);
  return { fixed, skipped, log };
}

/**
 * Simpler variant: reassign specific trips to Ash by trip ID.
 * Call from console: repairTripsForUser(['trip-id-1', 'trip-id-2'], 'ash.murray@dialaflight.co.uk')
 */
export async function repairTripsForUser(tripIds: string[], email: string): Promise<string[]> {
  const uid = await findUidByEmail(email);
  if (!uid) return [`No profile found for ${email}`];

  const db = firebaseDb();
  const log: string[] = [];

  for (const id of tripIds) {
    const ref = doc(db, TRIPS, id);
    const snap = await getDoc(ref);
    if (!snap.exists()) { log.push(`${id}: not found`); continue; }
    await setDoc(ref, { user_id: uid }, { merge: true });
    log.push(`${id} ("${snap.data().name}"): user_id → ${uid.slice(0, 8)}...`);
  }

  for (const l of log) logger.log("repairTripsForUser", l);
  return log;
}

// ── Image upload ──────────────────────────────────────────────────────────
// Firestore docs must be < 1MB. Base64 images are uploaded to Firebase
// Storage and replaced with download URLs before writing to Firestore.

function isBase64(url?: string): boolean {
  return !!url && url.startsWith("data:");
}

function isFirebaseStorageUrl(url?: string): boolean {
  return !!url && url.includes("firebasestorage");
}

/** Google Places photos arrive as same-origin proxy paths, which the mobile app cannot load */
function isProxyPath(url?: string): boolean {
  return !!url && url.startsWith("/api/image-proxy?");
}

/** Returns true for external HTTP URLs (or proxy paths) that should be re-uploaded to Firebase Storage */
function isExternalUrl(url?: string): boolean {
  return !!url && ((url.startsWith("http") && !isFirebaseStorageUrl(url)) || isProxyPath(url));
}

function base64ToBlob(dataUri: string): Blob {
  const [header, b64] = dataUri.split(",");
  const mime = header.match(/:(.*?);/)?.[1] ?? "image/jpeg";
  const bytes = atob(b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

async function uploadBase64Image(dataUri: string, path: string, shrink = false): Promise<string> {
  const blob = base64ToBlob(dataUri);
  const storageRef = ref(firebaseStorage(), path);
  await uploadBytes(storageRef, shrink ? await shrinkImage(blob) : blob);
  return getDownloadURL(storageRef);
}

/** Fetch an external image via proxy and re-upload to Firebase Storage for reliable mobile access */
async function reuploadExternalImage(url: string, path: string): Promise<string> {
  // Use the image proxy to avoid CORS issues when fetching from the browser
  const proxyUrl = isProxyPath(url) ? url : `/api/image-proxy?url=${encodeURIComponent(url)}`;
  const res = await fetch(proxyUrl);
  if (!res.ok) throw new Error(`Proxy fetch failed: ${res.status}`);
  const blob = await shrinkImage(await res.blob());
  const storageRef = ref(firebaseStorage(), path);
  await uploadBytes(storageRef, blob);
  return getDownloadURL(storageRef);
}

/** Upload an image (base64 or external URL) to Firebase Storage */
async function uploadImage(imageUrl: string, storagePath: string): Promise<string> {
  if (isBase64(imageUrl)) {
    return uploadBase64Image(imageUrl, storagePath, true);
  }
  if (isExternalUrl(imageUrl)) {
    return reuploadExternalImage(imageUrl, storagePath);
  }
  return imageUrl; // already a Firebase Storage URL
}

async function uploadTripImages(trip: Trip): Promise<Trip> {
  const clean = { ...trip };

  // Trip cover - upload base64 or external URLs to Firebase Storage
  if (isBase64(clean.image) || isExternalUrl(clean.image)) {
    try {
      clean.image = await uploadImage(clean.image, `trips/${trip.id}/cover-${crypto.randomUUID()}`);
      logger.log("uploadTripImages", "uploaded cover for", trip.id);
    } catch (err) {
      logger.log("uploadTripImages", "cover upload failed, keeping original:", err);
      // Keep original URL as fallback - it works on web even if Android fails
    }
  }

  // Trip-level media - upload base64/local to Firebase Storage
  if (clean.media?.length) {
    clean.media = await Promise.all(
      clean.media.map(async (m, i) => {
        if (isBase64(m.url)) {
          try {
            const uid = firebaseAuth().currentUser?.uid ?? "anon";
            const url = await uploadBase64Image(m.url, `trips/${trip.id}/media/${uid}/${m.id || `m-${i}`}`);
            return { ...m, url };
          } catch {
            return m; // keep original on failure
          }
        }
        return m;
      }),
    );
  }

  // Trip-level documents - filter out base64 data URLs (already in Firebase Storage)
  if (clean.documents?.length) {
    clean.documents = clean.documents.filter(d => !isBase64(d.url));
  }

  // Events - upload base64 or external image URLs
  clean.events = await Promise.all(clean.events.map(async (ev, i) => {
    const e = { ...ev };
    if (isBase64(e.image) || isExternalUrl(e.image)) {
      try {
        e.image = await uploadImage(e.image!, `trips/${trip.id}/events/${e.id || i}-${crypto.randomUUID()}`);
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

/** Replace undefined with null - Firestore rejects undefined values */
function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    result[k] = v === undefined ? null : v;
  }
  return result;
}

function tripToDoc(trip: Trip): Record<string, unknown> {
  const raw = stripUndefined({
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
    image_position: trip.imagePosition ?? null,
    events: trip.events ?? [],
    media: trip.media ?? null,
    short_code: trip.shortCode ?? null,
    organization_id: trip.organizationId ?? null,
    traveler_ids: trip.travelerIds ?? null,
    travelers: trip.travelers ?? null,
    // Lower-cased traveller emails, so a traveller signing in to the app can be matched to their trips
    // (api/my-trips). Kept beside travelers on every save; never sent to the app itself.
    traveler_emails: [...new Set((trip.travelers ?? []).map(t => (t.email ?? "").trim().toLowerCase()).filter(Boolean))],
    organizer: trip.organizer ?? null,
    info: trip.info ?? null,
    documents: trip.documents ?? null,
    published_snapshot: trip.publishedSnapshot ?? null,
    archived_at: trip.archivedAt ?? null,
    history: trip.history ?? null,
    tasks: trip.tasks ?? null,
  });
  // Deep-clean: Firestore rejects undefined at any nesting depth.
  // JSON round-trip drops undefined values and deep-clones everything.
  return JSON.parse(JSON.stringify(raw));
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
    documents: (data.documents as Trip["documents"]) ?? undefined,
    organizationId: (data.organization_id as string) ?? undefined,
    publishedSnapshot: (data.published_snapshot as Trip["publishedSnapshot"]) ?? undefined,
    archivedAt: (data.archived_at as string) ?? undefined,
    history: (data.history as Trip["history"]) ?? undefined,
    tasks: (data.tasks as Trip["tasks"]) ?? undefined,
  };
}
