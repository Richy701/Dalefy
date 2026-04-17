import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Trip } from "@/shared/types";
import { fetchTrips } from "@/services/supabaseTrips";

const CACHE_KEY = "daf-trips-cache";

interface TripsContextValue {
  trips: Trip[];
  ready: boolean;
  addTrip: (trip: Trip) => void;
  deleteTrip: (id: string) => void;
  updateTrip: (trip: Trip) => void;
  clearTrips: () => Promise<void>;
  reload: () => Promise<void>;
}

const TripsContext = createContext<TripsContextValue | null>(null);

function save(trips: Trip[]) {
  AsyncStorage.setItem(CACHE_KEY, JSON.stringify(trips)).catch(() => {});
}

export function TripsProvider({ children }: { children: React.ReactNode }) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [ready, setReady] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    // 1. Load local cache instantly
    AsyncStorage.getItem(CACHE_KEY)
      .then(raw => {
        if (raw && mounted.current) setTrips(JSON.parse(raw) as Trip[]);
      })
      .catch(() => {})
      .finally(() => {
        if (mounted.current) setReady(true);
      });

    // 2. Fetch latest from Supabase in background
    fetchTrips()
      .then(remote => {
        console.log("[TripsContext] Supabase returned", remote.length, "trips");
        if (mounted.current) {
          setTrips(remote);
          save(remote);
        }
      })
      .catch(err => {
        console.error("[TripsContext] Supabase fetch failed:", err);
      });

    return () => { mounted.current = false; };
  }, []);

  const addTrip = useCallback((trip: Trip) => {
    setTrips(prev => {
      if (prev.some(t => t.id === trip.id)) return prev;
      const next = [trip, ...prev];
      save(next);
      return next;
    });
  }, []);

  const deleteTrip = useCallback((id: string) => {
    setTrips(prev => {
      const next = prev.filter(t => t.id !== id);
      save(next);
      return next;
    });
  }, []);

  const updateTrip = useCallback((trip: Trip) => {
    setTrips(prev => {
      const next = prev.map(t => t.id === trip.id ? trip : t);
      save(next);
      return next;
    });
  }, []);

  const clearTrips = useCallback(async () => {
    setTrips([]);
    await AsyncStorage.removeItem(CACHE_KEY);
  }, []);

  const reload = useCallback(async () => {
    try {
      console.log("[TripsContext] reload: fetching from Supabase...");
      const remote = await fetchTrips();
      console.log("[TripsContext] reload: got", remote.length, "trips");
      setTrips(remote);
      save(remote);
    } catch (err) {
      console.error("[TripsContext] reload failed:", err);
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      if (raw) setTrips(JSON.parse(raw) as Trip[]);
    }
  }, []);

  return (
    <TripsContext.Provider value={{ trips, ready, addTrip, deleteTrip, updateTrip, clearTrips, reload }}>
      {children}
    </TripsContext.Provider>
  );
}

export function useTrips() {
  const ctx = useContext(TripsContext);
  if (!ctx) throw new Error("useTrips must be used within TripsProvider");
  return ctx;
}
