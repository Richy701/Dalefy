import { createContext, useContext, useCallback, useMemo, useEffect, useState, useRef, type ReactNode } from "react";
import type { Trip, TravelEvent } from "@/types";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { INITIAL_TRIPS } from "@/data/trips";
import { isSupabaseConfigured } from "@/services/supabase";
import { subscribeToTrips, upsertTrip, removeTrip } from "@/services/supabaseTrips";

interface TripsContextType {
  trips: Trip[];
  ready: boolean;
  setTrips: React.Dispatch<React.SetStateAction<Trip[]>>;
  addTrip: (trip: Trip) => void;
  deleteTrip: (id: string) => void;
  updateTrip: (id: string, updates: Partial<Trip>) => void;
  addEvent: (tripId: string, event: TravelEvent) => void;
  updateEvent: (tripId: string, event: TravelEvent) => void;
  deleteEvent: (tripId: string, eventId: string) => void;
}

const TripsContext = createContext<TripsContextType>({
  trips: [],
  ready: false,
  setTrips: () => {},
  addTrip: () => {},
  deleteTrip: () => {},
  updateTrip: () => {},
  addEvent: () => {},
  updateEvent: () => {},
  deleteEvent: () => {},
});

function useSupabaseTrips() {
  const [trips, setTripsState] = useState<Trip[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const unsub = subscribeToTrips((incoming) => {
      setTripsState(incoming);
      setReady(true);
    });
    return unsub;
  }, []);

  const setTrips: React.Dispatch<React.SetStateAction<Trip[]>> = useCallback((action) => {
    setTripsState((prev) => {
      const next = typeof action === "function" ? action(prev) : action;
      syncToSupabase(prev, next);
      return next;
    });
  }, []);

  return { trips, setTrips, ready };
}

function syncToSupabase(prev: Trip[], next: Trip[]) {
  const prevIds = new Set(prev.map((t) => t.id));
  const nextIds = new Set(next.map((t) => t.id));

  for (const trip of next) {
    const old = prev.find((t) => t.id === trip.id);
    if (!old || JSON.stringify(old) !== JSON.stringify(trip)) {
      console.log("[syncToSupabase] upserting trip:", trip.id, trip.name, "events:", trip.events.length);
      upsertTrip(trip).catch(err => console.error("[syncToSupabase] upsert failed:", err));
    }
  }

  for (const id of prevIds) {
    if (!nextIds.has(id)) {
      console.log("[syncToSupabase] removing trip:", id);
      removeTrip(id).catch(err => console.error("[syncToSupabase] remove failed:", err));
    }
  }
}

function useLocalTrips() {
  const [trips, setTrips] = useLocalStorage<Trip[]>("daf-adventures-v4", INITIAL_TRIPS);
  return { trips, setTrips, ready: true };
}

export function TripsProvider({ children }: { children: ReactNode }) {
  const useCloud = isSupabaseConfigured();
  const local = useLocalTrips();
  const cloud = useSupabaseTrips();

  const { trips, setTrips } = useCloud ? cloud : local;
  const ready = useCloud ? cloud.ready : local.ready;

  // Seed / recover Supabase from localStorage
  const seeded = useRef(false);
  useEffect(() => {
    if (!useCloud || !cloud.ready || seeded.current) return;
    seeded.current = true;

    console.log("[TripsContext] seed check — cloud:", cloud.trips.length, "local:", local.trips.length);

    // Full seed when Supabase is empty
    if (cloud.trips.length === 0 && local.trips.length > 0) {
      console.log("[TripsContext] seeding Supabase from localStorage:", local.trips.map(t => t.name));
      Promise.all(local.trips.map(upsertTrip))
        .then(() => {
          console.log("[TripsContext] seed complete");
          subscribeToTrips((incoming) => {
            if (incoming.length > 0) cloud.setTrips(incoming);
          });
        })
        .catch(err => console.error("[TripsContext] seed failed:", err));
      return;
    }

    // Recover: if localStorage has more events for a trip, push it back
    const toRecover: Trip[] = [];
    for (const lt of local.trips) {
      const ct = cloud.trips.find((t) => t.id === lt.id);
      if (ct && lt.events.length > ct.events.length) {
        console.log("[TripsContext] recovering trip from localStorage:", lt.name, `(${lt.events.length} vs ${ct.events.length} events)`);
        toRecover.push(lt);
      }
    }
    if (toRecover.length > 0) {
      Promise.all(toRecover.map(upsertTrip)).then(() => {
        console.log("[TripsContext] recovery complete, refreshing...");
        subscribeToTrips((incoming) => {
          if (incoming.length > 0) cloud.setTrips(incoming);
        });
      });
    }
  }, [useCloud, cloud.ready, cloud.trips.length, local.trips]);

  const addTrip = useCallback((trip: Trip) => {
    setTrips(prev => [trip, ...prev]);
    if (useCloud) local.setTrips(prev => [trip, ...prev]);
  }, [setTrips, useCloud, local]);

  const deleteTrip = useCallback((id: string) => {
    setTrips(prev => prev.filter(t => t.id !== id));
    // Also remove from localStorage so recovery logic doesn't resurrect it
    if (useCloud) {
      local.setTrips(prev => prev.filter(t => t.id !== id));
    }
  }, [setTrips, useCloud, local]);

  const updateTrip = useCallback((id: string, updates: Partial<Trip>) => {
    const updater = (prev: Trip[]) => prev.map(t => t.id === id ? { ...t, ...updates } : t);
    setTrips(updater);
    if (useCloud) local.setTrips(updater);
  }, [setTrips, useCloud, local]);

  const addEvent = useCallback((tripId: string, event: TravelEvent) => {
    const updater = (prev: Trip[]) => prev.map(t => {
      if (t.id !== tripId) return t;
      return { ...t, events: [...t.events, event] };
    });
    setTrips(updater);
    if (useCloud) local.setTrips(updater);
  }, [setTrips, useCloud, local]);

  const updateEvent = useCallback((tripId: string, event: TravelEvent) => {
    const updater = (prev: Trip[]) => prev.map(t => {
      if (t.id !== tripId) return t;
      const exists = t.events.some(e => e.id === event.id);
      const newEvents = exists
        ? t.events.map(e => e.id === event.id ? event : e)
        : [...t.events, event];
      return { ...t, events: newEvents };
    });
    setTrips(updater);
    if (useCloud) local.setTrips(updater);
  }, [setTrips, useCloud, local]);

  const deleteEvent = useCallback((tripId: string, eventId: string) => {
    const updater = (prev: Trip[]) => prev.map(t => {
      if (t.id !== tripId) return t;
      return { ...t, events: t.events.filter(e => e.id !== eventId) };
    });
    setTrips(updater);
    if (useCloud) local.setTrips(updater);
  }, [setTrips, useCloud, local]);

  const value = useMemo(
    () => ({ trips, ready, setTrips, addTrip, deleteTrip, updateTrip, addEvent, updateEvent, deleteEvent }),
    [trips, ready, setTrips, addTrip, deleteTrip, updateTrip, addEvent, updateEvent, deleteEvent]
  );

  return (
    <TripsContext.Provider value={value}>
      {children}
    </TripsContext.Provider>
  );
}

export function useTrips() {
  return useContext(TripsContext);
}
