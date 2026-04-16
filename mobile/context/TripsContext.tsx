import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Trip } from "@/shared/types";
import { subscribeToTrips, upsertTrip, removeTrip } from "@/services/supabaseTrips";

const CACHE_KEY = "daf-trips-cache";

interface TripsContextValue {
  trips: Trip[];
  ready: boolean;
  synced: boolean;
  addTrip: (trip: Trip) => void;
  deleteTrip: (id: string) => void;
  updateTrip: (trip: Trip) => void;
}

const TripsContext = createContext<TripsContextValue | null>(null);

export function TripsProvider({ children }: { children: React.ReactNode }) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [ready, setReady] = useState(false);
  const [synced, setSynced] = useState(false);
  const tripsRef = useRef(trips);
  tripsRef.current = trips;

  // Step 1: Load from cache immediately (offline-first)
  useEffect(() => {
    AsyncStorage.getItem(CACHE_KEY)
      .then(raw => {
        if (raw) {
          const cached = JSON.parse(raw) as Trip[];
          setTrips(cached);
        }
        setReady(true);
      })
      .catch(() => setReady(true));
  }, []);

  // Step 2: Subscribe to Supabase for live updates, cache on every change
  useEffect(() => {
    const unsub = subscribeToTrips((incoming) => {
      setTrips(incoming);
      setSynced(true);
      AsyncStorage.setItem(CACHE_KEY, JSON.stringify(incoming)).catch(() => {});
    });
    return unsub;
  }, []);

  const persistAndSync = useCallback((next: Trip[]) => {
    AsyncStorage.setItem(CACHE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const addTrip = useCallback((trip: Trip) => {
    setTrips(prev => {
      const next = [trip, ...prev];
      persistAndSync(next);
      return next;
    });
    upsertTrip(trip);
  }, [persistAndSync]);

  const deleteTrip = useCallback((id: string) => {
    setTrips(prev => {
      const next = prev.filter(t => t.id !== id);
      persistAndSync(next);
      return next;
    });
    removeTrip(id);
  }, [persistAndSync]);

  const updateTrip = useCallback((trip: Trip) => {
    setTrips(prev => {
      const next = prev.map(t => t.id === trip.id ? trip : t);
      persistAndSync(next);
      return next;
    });
    upsertTrip(trip);
  }, [persistAndSync]);

  return (
    <TripsContext.Provider value={{ trips, ready, synced, addTrip, deleteTrip, updateTrip }}>
      {children}
    </TripsContext.Provider>
  );
}

export function useTrips() {
  const ctx = useContext(TripsContext);
  if (!ctx) throw new Error("useTrips must be used within TripsProvider");
  return ctx;
}
