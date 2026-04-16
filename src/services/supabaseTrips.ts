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
  const { error } = await supabase
    .from(TABLE)
    .upsert(tripToRow(trip), { onConflict: "id" });
  if (error) throw error;
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

function tripToRow(trip: Trip) {
  return {
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
  };
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
  };
}
