import { createContext, useContext, useCallback, useMemo, useEffect, useState, useRef, type ReactNode } from "react";
import type { Trip, TravelEvent } from "@/types";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { INITIAL_TRIPS } from "@/data/trips";
import { isSupabaseConfigured } from "@/services/supabase";
import { subscribeToTrips, upsertTrip, removeTrip } from "@/services/supabaseTrips";

interface TripsContextType {
  trips: Trip[];
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
    if (!old || old !== trip) {
      upsertTrip(trip);
    }
  }

  for (const id of prevIds) {
    if (!nextIds.has(id)) {
      removeTrip(id);
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

  // Seed Supabase from localStorage on first use
  const seeded = useRef(false);
  useEffect(() => {
    if (!useCloud || !cloud.ready || seeded.current) return;
    if (cloud.trips.length === 0 && local.trips.length > 0) {
      seeded.current = true;
      Promise.all(local.trips.map(upsertTrip)).then(() => {
        subscribeToTrips((incoming) => {
          if (incoming.length > 0) cloud.setTrips(incoming);
        });
      });
    }
  }, [useCloud, cloud.ready, cloud.trips.length, local.trips]);

  const addTrip = useCallback((trip: Trip) => setTrips(prev => [trip, ...prev]), [setTrips]);

  const deleteTrip = useCallback((id: string) => setTrips(prev => prev.filter(t => t.id !== id)), [setTrips]);

  const updateTrip = useCallback((id: string, updates: Partial<Trip>) => {
    setTrips(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  }, [setTrips]);

  const addEvent = useCallback((tripId: string, event: TravelEvent) => {
    setTrips(prev => prev.map(t => {
      if (t.id !== tripId) return t;
      return { ...t, events: [...t.events, event] };
    }));
  }, [setTrips]);

  const updateEvent = useCallback((tripId: string, event: TravelEvent) => {
    setTrips(prev => prev.map(t => {
      if (t.id !== tripId) return t;
      const exists = t.events.some(e => e.id === event.id);
      const newEvents = exists
        ? t.events.map(e => e.id === event.id ? event : e)
        : [...t.events, event];
      return { ...t, events: newEvents };
    }));
  }, [setTrips]);

  const deleteEvent = useCallback((tripId: string, eventId: string) => {
    setTrips(prev => prev.map(t => {
      if (t.id !== tripId) return t;
      return { ...t, events: t.events.filter(e => e.id !== eventId) };
    }));
  }, [setTrips]);

  const value = useMemo(
    () => ({ trips, setTrips, addTrip, deleteTrip, updateTrip, addEvent, updateEvent, deleteEvent }),
    [trips, setTrips, addTrip, deleteTrip, updateTrip, addEvent, updateEvent, deleteEvent]
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
