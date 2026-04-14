import type { Trip, TravelEvent } from "@/types";

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function fetchTrips(): Promise<Trip[]> {
  await delay(400);
  const saved = localStorage.getItem("daf-adventures-v3");
  if (!saved) return [];
  return JSON.parse(saved);
}

export async function createTrip(trip: Trip): Promise<Trip> {
  await delay(300);
  const trips = await fetchTrips();
  trips.unshift(trip);
  localStorage.setItem("daf-adventures-v3", JSON.stringify(trips));
  return trip;
}

export async function updateTrip(id: string, updates: Partial<Trip>): Promise<Trip | null> {
  await delay(200);
  const trips = await fetchTrips();
  const idx = trips.findIndex(t => t.id === id);
  if (idx === -1) return null;
  trips[idx] = { ...trips[idx], ...updates };
  localStorage.setItem("daf-adventures-v3", JSON.stringify(trips));
  return trips[idx];
}

export async function deleteTrip(id: string): Promise<boolean> {
  await delay(200);
  const trips = await fetchTrips();
  const filtered = trips.filter(t => t.id !== id);
  localStorage.setItem("daf-adventures-v3", JSON.stringify(filtered));
  return true;
}

export async function addEventToTrip(tripId: string, event: TravelEvent): Promise<TravelEvent> {
  await delay(200);
  const trips = await fetchTrips();
  const trip = trips.find(t => t.id === tripId);
  if (trip) {
    trip.events.push(event);
    localStorage.setItem("daf-adventures-v3", JSON.stringify(trips));
  }
  return event;
}

export async function publishTrip(id: string): Promise<Trip | null> {
  await delay(800);
  return updateTrip(id, { status: "Published" });
}

export async function simulateAiAction(action: string): Promise<string> {
  await delay(1500);
  const responses: Record<string, string> = {
    optimize: "Itinerary optimized! Reduced transit time by 2 hours.",
    suggest: "Added 3 suggested activities based on destination and season.",
    budget: "Budget estimate generated: $12,450 per person (flights + accommodation + activities).",
    summary: "Executive summary generated with key highlights and logistics overview.",
  };
  return responses[action] || "AI action completed successfully.";
}
