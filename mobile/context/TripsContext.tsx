import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Trip } from "@/shared/types";

const CACHE_KEY = "daf-trips-cache";

interface TripsContextValue {
  trips: Trip[];
  ready: boolean;
  addTrip: (trip: Trip) => void;
  deleteTrip: (id: string) => void;
  updateTrip: (trip: Trip) => void;
  clearTrips: () => Promise<void>;
}

const TripsContext = createContext<TripsContextValue | null>(null);

export function TripsProvider({ children }: { children: React.ReactNode }) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(CACHE_KEY)
      .then(raw => {
        if (raw) setTrips(JSON.parse(raw) as Trip[]);
        setReady(true);
      })
      .catch(() => setReady(true));
  }, []);

  const persist = useCallback((next: Trip[]) => {
    AsyncStorage.setItem(CACHE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const addTrip = useCallback((trip: Trip) => {
    setTrips(prev => {
      if (prev.some(t => t.id === trip.id)) return prev;
      const next = [trip, ...prev];
      persist(next);
      return next;
    });
  }, [persist]);

  const deleteTrip = useCallback((id: string) => {
    setTrips(prev => {
      const next = prev.filter(t => t.id !== id);
      persist(next);
      return next;
    });
  }, [persist]);

  const updateTrip = useCallback((trip: Trip) => {
    setTrips(prev => {
      const next = prev.map(t => t.id === trip.id ? trip : t);
      persist(next);
      return next;
    });
  }, [persist]);

  const clearTrips = useCallback(async () => {
    setTrips([]);
    await AsyncStorage.removeItem(CACHE_KEY);
  }, []);

  return (
    <TripsContext.Provider value={{ trips, ready, addTrip, deleteTrip, updateTrip, clearTrips }}>
      {children}
    </TripsContext.Provider>
  );
}

export function useTrips() {
  const ctx = useContext(TripsContext);
  if (!ctx) throw new Error("useTrips must be used within TripsProvider");
  return ctx;
}
