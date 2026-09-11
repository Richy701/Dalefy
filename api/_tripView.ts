type Data = Record<string, unknown>;

export function record(value: unknown): Data {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Data : {};
}

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

/** Explicit allowlists keep new internal fields private by default. */
export function publishedTripView(tripId: string, trip: Data, leader = false, member = false): Data | null {
  if (!["Published", "published"].includes(String(trip.status))) return null;
  const snap = record(trip.published_snapshot);
  // Legacy trips need republishing. Never fall back to working fields.
  if (!Array.isArray(snap.events) || typeof snap.publishedAt !== "string") return null;
  const info = list(snap.info).filter(v => leader || record(v).leaderOnly !== true).map(v => ({
    ...strings(v, ["id", "title", "body", "deadline", "actionUrl", "actionLabel"]),
    leaderOnly: record(v).leaderOnly === true,
    documents: documents(record(v).documents),
  }));
  const events = snap.events.map(v => {
    const data = record(v);
    const result: Data = strings(v, [
      "id", "type", "date", "time", "endTime", "endDate", "title", "description", "location",
      "image", "roomType", "airline", "flightNum", "terminal", "arrTerminal", "gate", "arrGate",
      "baggageBelt", "duration", "status", "depAirport", "arrAirport", "depTz", "arrTz",
      "checkin", "checkout", "transferType", "aircraft",
      ...(leader ? ["supplier", "price", "confNumber", "notes", "seatDetails"] : []),
    ]);
    for (const key of ["locationCoords", "depCoords", "arrCoords"]) {
      if (Array.isArray(data[key]) && data[key].length === 2 && data[key].every(n => typeof n === "number" && Number.isFinite(n))) result[key] = data[key];
    }
    if (typeof data.isOvernight === "boolean") result.isOvernight = data.isOvernight;
    result.assignedTo = list(data.assignedTo).filter(v => typeof v === "string");
    result.documents = documents(data.documents);
    result.media = list(data.media).map(v => strings(v, ["type", "url", "name"]));
    return result;
  });
  return {
    id: tripId,
    ...strings(snap, ["name", "destination", "start", "image"]),
    end_date: typeof snap.end === "string" ? snap.end : "",
    pax_count: typeof snap.paxCount === "string" ? snap.paxCount : "",
    organization_id: typeof trip.organization_id === "string" ? trip.organization_id : null,
    status: "Published",
    events,
    info,
    organizer: typeof record(snap.organizer).name === "string" && String(record(snap.organizer).name).trim()
      ? strings(snap.organizer, ["name", "role", "company", "email", "phone", "avatar"])
      : null,
    documents: documents(snap.documents),
    // Names support the intentional itinerary-personalization picker; never expose emails.
    travelers: list(snap.travelers).map(v => strings(v, ["id", "name", "initials"])),
    media: member ? list(trip.media).map(v => ({
      ...strings(v, ["id", "type", "name", "url", "uploadedAt", "uploadedBy", "uploaderId"]),
      size: typeof record(v).size === "number" ? record(v).size : 0,
    })) : [],
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
    if (typeof item.size !== "number" || item.size < 0 || item.size > 25 * 1024 * 1024) throw new Error("Invalid upload size");
    result.push({ ...strings(item, ["id", "type", "name", "url", "uploadedBy"]), size: item.size, uploaderId: uid, uploadedAt: new Date().toISOString() });
  }
  if (result.length > 1000) throw new Error("Trip media limit reached");
  return result;
}
