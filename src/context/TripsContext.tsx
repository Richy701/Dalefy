import { createContext, useContext, useCallback, useMemo, type ReactNode } from "react";
import type { Trip, TravelEvent } from "@/types";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { INITIAL_TRIPS } from "@/data/trips";

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

export function TripsProvider({ children }: { children: ReactNode }) {
  const [trips, setTrips] = useLocalStorage<Trip[]>("daf-adventures-v3", INITIAL_TRIPS);

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
