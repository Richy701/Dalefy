type Data = Record<string, unknown>;

export function record(value: unknown): Data {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Data : {};
}

/** Photo capture time from EXIF, device-local "YYYY-MM-DDTHH:MM:SS"; groups the gallery by trip day */
const TAKEN_AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;

function strings(value: unknown, keys: string[]): Data {
  const data = record(value);
  return Object.fromEntries(keys.filter(k => typeof data[k] === "string").map(k => [k, data[k]]));
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function documents(value: unknown): Data[] {
  return list(value).map(v => ({
    ...strings(v, ["id", "name", "mimeType", "url", "uploadedAt"]),
    size: typeof record(v).size === "number" ? record(v).size : 0,
  }));
}

export function membershipMatches(member: Data, uid: string, tripId: string): boolean {
  return member.uid === uid && member.trip_id === tripId;
}

/** A cover or event photo focal point: two percentages, nothing else gets through. */
function focalPoint(v: unknown): { x: number; y: number } | null {
  const p = record(v);
  const ok = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 100;
  return ok(p.x) && ok(p.y) ? { x: p.x, y: p.y } : null;
}

/** Individual booking references by traveller id, keeping only real text. */
function travelerRefs(value: unknown): Record<string, string> {
  return Object.fromEntries(Object.entries(record(value))
    .filter((e): e is [string, string] => typeof e[1] === "string" && !!e[1].trim())
    .map(([id, ref]) => [id, ref.trim()]));
}

/**
 * A booking reference plus a surname can change a booking, so a traveller only ever gets their own: they must have
 * joined, be linked to someone on the published list, and be on the event. Others' references never leave the server.
 */
function onEvent(event: Data, travelerId: string): boolean {
  const assigned = list(event.assignedTo);
  return !assigned.length || assigned.includes(travelerId);
}
function ownBookingRef(event: Data, travelerId: string | null): string | null {
  if (!travelerId || !onEvent(event, travelerId)) return null;
  const shared = typeof event.confNumber === "string" ? event.confNumber.trim() : "";
  return travelerRefs(event.travelerRefs)[travelerId] || shared || null;
}

/**
 * How to reach the organiser is taken from the working copy when the published copy has none and it's still the same
 * person. Saves used to blank a linked organiser's email there, and a number added later doesn't count as a change to
 * publish. Never from anyone else: a replaced organiser's details wait for the next publish.
 */
function publishedOrganizer(published: unknown, working: unknown): Data | null {
  const org = strings(published, ["name", "role", "company", "email", "phone", "avatar"]);
  if (typeof org.name !== "string" || !org.name.trim()) return null;
  const now = record(working);
  const same = typeof now.name === "string" && now.name.trim().toLowerCase() === org.name.trim().toLowerCase();
  if (same) {
    for (const key of ["email", "phone"]) {
      const value = now[key];
      if (!String(org[key] ?? "").trim() && typeof value === "string" && value.trim()) org[key] = value.trim();
    }
  }
  return org;
}

/**
 * Explicit allowlists keep new internal fields private by default.
 * linkedTravelerId is who a joined member picked; only a member's own value may be passed.
 */
export function publishedTripView(tripId: string, trip: Data, leader = false, member = false, linkedTravelerId: unknown = null): Data | null {
  if (!["Published", "published"].includes(String(trip.status))) return null;
  const snap = record(trip.published_snapshot);
  // Legacy trips need republishing. Never fall back to working fields.
  if (!Array.isArray(snap.events) || typeof snap.publishedAt !== "string") return null;
  const info = list(snap.info).filter(v => leader || record(v).leaderOnly !== true).map(v => ({
    ...strings(v, ["id", "title", "body", "deadline", "actionUrl", "actionLabel"]),
    leaderOnly: record(v).leaderOnly === true,
    documents: documents(record(v).documents),
  }));
  const listedId = member && typeof linkedTravelerId === "string"
    && list(snap.travelers).some(t => record(t).id === linkedTravelerId) ? linkedTravelerId : null;
  const events = snap.events.map(v => {
    const data = record(v);
    const result: Data = strings(v, [
      "id", "type", "date", "time", "endTime", "endDate", "title", "description", "location",
      "image", "roomType", "airline", "flightNum", "terminal", "arrTerminal", "gate", "arrGate",
      "baggageBelt", "checkInDesk", "duration", "status", "depAirport", "arrAirport", "depTz", "arrTz",
      "checkin", "checkout", "transferType", "aircraft", "meetingPoint", "contactName", "contactPhone",
      ...(leader ? ["supplier", "price", "confNumber", "notes", "seatDetails"] : []),
    ]);
    if (leader) {
      const refs = travelerRefs(data.travelerRefs);
      if (Object.keys(refs).length) result.travelerRefs = refs;
    } else {
      const ref = ownBookingRef(data, listedId);
      if (ref) result.confNumber = ref;
    }
    // Same rule as references: everyone's for a leader, otherwise only their own
    if (leader) {
      const seats = travelerRefs(data.travelerSeats), tickets = travelerRefs(data.travelerTickets);
      if (Object.keys(seats).length) result.travelerSeats = seats;
      if (Object.keys(tickets).length) result.travelerTickets = tickets;
    }
    if (listedId && onEvent(data, listedId)) {
      const seat = travelerRefs(data.travelerSeats)[listedId], ticket = travelerRefs(data.travelerTickets)[listedId];
      if (seat) result.seatDetails = seat;
      if (ticket) result.ticketNumber = ticket;
    }
    for (const key of ["locationCoords", "depCoords", "arrCoords"]) {
      if (Array.isArray(data[key]) && data[key].length === 2 && data[key].every(n => typeof n === "number" && Number.isFinite(n))) result[key] = data[key];
    }
    if (typeof data.isOvernight === "boolean") result.isOvernight = data.isOvernight;
    const focal = focalPoint(data.imagePosition);
    if (focal) result.imagePosition = focal;
    result.assignedTo = list(data.assignedTo).filter(v => typeof v === "string");
    result.documents = documents(data.documents);
    result.media = list(data.media).map(v => strings(v, ["type", "url", "name"]));
    return result;
  });
  return {
    id: tripId,
    ...strings(snap, ["name", "destination", "start", "image"]),
    ...(focalPoint(snap.imagePosition) ? { imagePosition: focalPoint(snap.imagePosition) } : {}),
    end_date: typeof snap.end === "string" ? snap.end : "",
    // An explicit traveller list, even one emptied since publishing, is the head count; the typed number only
    // serves trips that never had a list. Otherwise the app keeps saying "1 traveller" after the last one is removed.
    pax_count: Array.isArray(snap.travelers) ? String(snap.travelers.length) : typeof snap.paxCount === "string" ? snap.paxCount : "",
    organization_id: typeof trip.organization_id === "string" ? trip.organization_id : null,
    status: "Published",
    events,
    info,
    organizer: publishedOrganizer(snap.organizer, trip.organizer),
    documents: documents(snap.documents),
    // Names support the intentional itinerary-personalization picker; never expose emails.
    travelers: list(snap.travelers).map(v => strings(v, ["id", "name", "initials", "avatar"])),
    media: member ? list(trip.media).map(v => ({
      ...strings(v, ["id", "type", "name", "url", "thumbUrl", "uploadedAt", "takenAt", "uploadedBy", "uploaderId"]),
      size: typeof record(v).size === "number" ? record(v).size : 0,
    })) : [],
  };
}

/** Listed as this trip's coordinator. Private trips have none. The caller must also check they're still on the team. */
export function listedAsCoordinator(trip: Data, uid: string): boolean {
  return trip.private !== true && list(trip.coordinators).some(c => record(c).userId === uid);
}

/**
 * Ticked as trip leader in the Workspace, on the traveller entry carrying this verified sign-in email. Matched by
 * email because a member can change their own linked_traveler_id, so that link can't be what grants leader access.
 */
export function listedAsTripLeader(trip: Data, email: unknown): boolean {
  const norm = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() : "");
  const me = norm(email);
  return !!me && list(trip.travelers).map(record).some(t => t.tripLeader === true && norm(t.email) === me);
}

/** A coordinator's picture of who is reachable. Names and leaders' phones only; never emails, seats or who else's device. */
export function oversightView(trip: Data, members: Data[]) {
  const travelers = list(record(trip.published_snapshot).travelers).map(record);
  const working = list(trip.travelers).map(record);
  const inApp = new Set(members.map(m => m.linked_traveler_id).filter(id => typeof id === "string" && id));
  const nameOf = (t: Data) => (typeof t.name === "string" ? t.name.trim() : "");
  const leaders = new Map<string, { name: string; phone: string | null }>();
  for (const m of members) {
    const entry = working.find(t => t.id === m.linked_traveler_id);
    if (m.role !== "leader" && entry?.tripLeader !== true) continue;
    const name = nameOf(entry ?? m);
    if (!name) continue;
    const phone = entry && typeof entry.phone === "string" && entry.phone.trim() ? entry.phone.trim() : null;
    if (!leaders.has(name) || phone) leaders.set(name, { name, phone });
  }
  return {
    total: travelers.length,
    inApp: travelers.filter(t => inApp.has(t.id)).length,
    notInApp: travelers.filter(t => !inApp.has(t.id)).map(nameOf).filter(Boolean),
    leaders: [...leaders.values()],
  };
}

export function storageMediaOwner(url: unknown, tripId: string, bucket: string): string | null {
  if (typeof url !== "string") return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.hostname !== "firebasestorage.googleapis.com") return null;
    const prefix = `/v0/b/${bucket}/o/`;
    if (!parsed.pathname.startsWith(prefix)) return null;
    const path = decodeURIComponent(parsed.pathname.slice(prefix.length)).split("/");
    return path.length === 5 && path[0] === "trips" && path[1] === tripId && path[2] === "media" && path[4] ? path[3] : null;
  } catch { return null; }
}

/** Merge additions/deletions against the server version, never a client trip copy. */
export function mergeTravelerMedia(current: unknown, additions: unknown, removals: unknown, uid: string, tripId: string, bucket: string): Data[] {
  if (!Array.isArray(additions) || additions.length > 50 || !Array.isArray(removals) || removals.length > 50 || !removals.every(v => typeof v === "string")) throw new Error("Invalid media changes");
  const existing = list(current).map(record);
  const removeIds = new Set(removals);
  for (const item of existing) {
    if (typeof item.id === "string" && removeIds.has(item.id) && storageMediaOwner(item.url, tripId, bucket) !== uid) throw new Error("You can only remove your own uploads");
  }
  const result = existing.filter(v => typeof v.id !== "string" || !removeIds.has(v.id));
  for (const value of additions) {
    const item = record(value);
    if (typeof item.id !== "string" || item.id.length > 150 || !item.id || !["image", "video"].includes(String(item.type))) throw new Error("Invalid media item");
    // Retries cannot change someone else's existing metadata.
    if (existing.some(v => v.id === item.id)) continue;
    if (storageMediaOwner(item.url, tripId, bucket) !== uid) throw new Error("Upload must belong to your account and this trip");
    if (item.thumbUrl !== undefined && storageMediaOwner(item.thumbUrl, tripId, bucket) !== uid) throw new Error("Upload must belong to your account and this trip");
    if (typeof item.size !== "number" || item.size < 0 || item.size > 25 * 1024 * 1024) throw new Error("Invalid upload size");
    const takenAt = typeof item.takenAt === "string" && TAKEN_AT.test(item.takenAt) ? { takenAt: item.takenAt } : {};
    result.push({ ...strings(item, ["id", "type", "name", "url", "thumbUrl", "uploadedBy"]), ...takenAt, size: item.size, uploaderId: uid, uploadedAt: new Date().toISOString() });
  }
  if (result.length > 1000) throw new Error("Trip media limit reached");
  return result;
}
