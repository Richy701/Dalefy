import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Trip } from "@/shared/types";
import { fetchTrips, upsertTrip as upsertTripRemote } from "@/services/supabaseTrips";
import { supabase } from "@/services/supabase";

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
  const [localCache, setLocalCache] = useState<Trip[] | null>(null);
  const mounted = useRef(true);
  const qc = useQueryClient();

  // Load local cache for instant display
  useEffect(() => {
    mounted.current = true;
    AsyncStorage.getItem(CACHE_KEY)
      .then(raw => {
        if (raw && mounted.current) setLocalCache(JSON.parse(raw) as Trip[]);
      })
      .catch(() => {});
    return () => { mounted.current = false; };
  }, []);

  // React Query handles fetching, caching, retries, deduplication
  const { data: remoteTrips, isSuccess } = useQuery<Trip[]>({
    queryKey: ["trips"],
    queryFn: fetchTrips,
    staleTime: 1000 * 60 * 5,
    retry: 2,
  });

  // Persist remote data to AsyncStorage when it arrives
  useEffect(() => {
    if (remoteTrips && remoteTrips.length > 0) {
      save(remoteTrips);
    }
  }, [remoteTrips]);

  // Realtime subscription — invalidates the query cache on changes
  useEffect(() => {
    const channel = supabase
      .channel("trips-realtime-mobile")
      .on("postgres_changes", { event: "*", schema: "public", table: "trips" }, () => {
        qc.invalidateQueries({ queryKey: ["trips"] });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  // Use remote data when available, fall back to local cache
  const trips = remoteTrips ?? localCache ?? [];
  const ready = isSuccess || localCache !== null;

  const addTrip = useCallback((trip: Trip) => {
    qc.setQueryData<Trip[]>(["trips"], (prev = []) => {
      if (prev.some(t => t.id === trip.id)) return prev;
      const next = [trip, ...prev];
      save(next);
      return next;
    });
  }, [qc]);

  const deleteTrip = useCallback((id: string) => {
    qc.setQueryData<Trip[]>(["trips"], (prev = []) => {
      const next = prev.filter(t => t.id !== id);
      save(next);
      return next;
    });
  }, [qc]);

  const updateTrip = useCallback((trip: Trip) => {
    qc.setQueryData<Trip[]>(["trips"], (prev = []) => {
      const next = prev.map(t => t.id === trip.id ? trip : t);
      save(next);
      return next;
    });
    // Persist to Supabase
    upsertTripRemote(trip).catch(err =>
      console.warn("[TripsContext] updateTrip upsert failed:", err)
    );
  }, [qc]);

  const clearTrips = useCallback(async () => {
    qc.setQueryData<Trip[]>(["trips"], []);
    await AsyncStorage.removeItem(CACHE_KEY);
  }, [qc]);

  const reload = useCallback(async () => {
    try {
      console.log("[TripsContext] reload: invalidating query...");
      await qc.invalidateQueries({ queryKey: ["trips"] });
      console.log("[TripsContext] reload: complete");
    } catch (err) {
      console.error("[TripsContext] reload failed:", err);
      // Fall back to local cache
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      if (raw) {
        const cached = JSON.parse(raw) as Trip[];
        qc.setQueryData<Trip[]>(["trips"], cached);
      }
    }
  }, [qc]);

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
