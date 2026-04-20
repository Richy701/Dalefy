import { supabase } from "./supabase";
import type { Trip } from "@/types";

const TABLE = "trips";

export async function fetchTrips(): Promise<Trip[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .order("start", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToTrip);
}

export function subscribeToTrips(onChange: (trips: Trip[]) => void) {
  fetchTrips().then(onChange);

  const channel = supabase
    .channel("trips-realtime")
    .on("postgres_changes", { event: "*", schema: "public", table: TABLE }, () => {
      fetchTrips().then(onChange);
    })
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export async function upsertTrip(trip: Trip): Promise<void> {
  // Attach user_id so RLS scopes trips to their creator
  const { data: { user: authUser } } = await supabase.auth.getUser();
  const userId = authUser?.id ?? null;

  // Always try with all columns first — if columns were added mid-session, recover automatically
  const { error } = await supabase
    .from(TABLE)
    .upsert({ ...tripToRow(trip, true, true), user_id: userId }, { onConflict: "id" });
  if (!error) {
    hasTravelerCols = true;
    hasOrganizerCols = true;
    return;
  }

  // On ANY error (400, column mismatch, etc.) — progressively strip optional columns
  console.warn("[upsertTrip] full upsert failed, retrying without optional cols:", error.message);

  // Try without traveler columns
  hasTravelerCols = false;
  const { error: e2 } = await supabase
    .from(TABLE)
    .upsert({ ...tripToRow(trip), user_id: userId }, { onConflict: "id" });
  if (!e2) return;

  // Try without both traveler + organizer columns
  hasOrganizerCols = false;
  const { error: e3 } = await supabase
    .from(TABLE)
    .upsert({ ...tripToRow(trip), user_id: userId }, { onConflict: "id" });
  if (e3) throw e3;
}

export async function removeTrip(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) throw error;
}

export async function fetchTripByShortCode(code: string): Promise<Trip | null> {
  const normalized = code.trim();
  if (!/^\d{4}$/.test(normalized)) return null;
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("short_code", normalized)
    .maybeSingle();
  if (error || !data) return null;
  return rowToTrip(data);
}

function randomCode(): string {
  return String(Math.floor(Math.random() * 10000)).padStart(4, "0");
}

export async function generateUniqueShortCode(): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const candidate = randomCode();
    const { data, error } = await supabase
      .from(TABLE)
      .select("id")
      .eq("short_code", candidate)
      .maybeSingle();
    if (error) throw error;
    if (!data) return candidate;
  }
  throw new Error("Could not allocate unique trip code");
}

// Columns that may not exist yet — try with them first, fall back without
let hasTravelerCols = true;
let hasOrganizerCols = true;

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
  const { data, error } = await supabase
    .from("trip_members")
    .select("*")
    .order("joined_at", { ascending: false });
  if (error) return [];
  return (data ?? []) as TripMember[];
}

function tripToRow(trip: Trip, forceTraveler?: boolean, forceOrganizer?: boolean) {
  const row: Record<string, unknown> = {
    id: trip.id,
    name: trip.name,
    attendees: trip.attendees,
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
  };
  if (forceTraveler ?? hasTravelerCols) {
    row.traveler_ids = trip.travelerIds ?? null;
    row.travelers = trip.travelers ?? null;
  }
  if (forceOrganizer ?? hasOrganizerCols) {
    row.organizer = trip.organizer ?? null;
    row.info = trip.info ?? null;
  }
  return row;
}

function rowToTrip(row: Record<string, unknown>): Trip {
  return {
    id: row.id as string,
    name: row.name as string,
    attendees: row.attendees as string,
    destination: (row.destination as string) ?? undefined,
    paxCount: (row.pax_count as string) ?? undefined,
    tripType: (row.trip_type as string) ?? undefined,
    budget: (row.budget as string) ?? undefined,
    currency: (row.currency as string) ?? undefined,
    start: row.start as string,
    end: row.end_date as string,
    status: row.status as Trip["status"],
    image: row.image as string,
    events: (row.events as Trip["events"]) ?? [],
    media: (row.media as Trip["media"]) ?? undefined,
    shortCode: (row.short_code as string) ?? undefined,
    travelerIds: (row.traveler_ids as string[]) ?? undefined,
    travelers: (row.travelers as Trip["travelers"]) ?? undefined,
    organizer: (row.organizer as Trip["organizer"]) ?? undefined,
    info: (row.info as Trip["info"]) ?? undefined,
    organizationId: (row.organization_id as string) ?? undefined,
  };
}
