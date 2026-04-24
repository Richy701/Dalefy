import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Trip } from "@/shared/types";
import { fetchTrips, upsertTrip as upsertTripRemote, subscribeToTrips } from "@/services/firebaseTrips";

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
        else if (mounted.current) setLocalCache([]);          // no cache → empty
      })
      .catch(() => { if (mounted.current) setLocalCache([]); });
    return () => { mounted.current = false; };
  }, []);

  // React Query handles fetching, caching, retries, deduplication
  const { data: remoteTrips, isSuccess, isError } = useQuery<Trip[]>({
    queryKey: ["trips"],
    queryFn: fetchTrips,
    staleTime: 1000 * 60 * 2,
    retry: 2,
  });

  // Sync remote data → local cache when it arrives
  useEffect(() => {
    if (remoteTrips) {
      setLocalCache(remoteTrips);
      if (remoteTrips.length > 0) save(remoteTrips);
    }
  }, [remoteTrips]);

  // Firestore realtime subscription — push fresh data straight into the query cache
  useEffect(() => {
    const unsub = subscribeToTrips((freshTrips) => {
      qc.setQueryData<Trip[]>(["trips"], freshTrips);
      setLocalCache(freshTrips);
      if (freshTrips.length > 0) save(freshTrips);
    });
    return () => unsub();
  }, [qc]);

  // Use remote data when available, fall back to local cache
  const trips = remoteTrips ?? localCache ?? [];
  const ready = isSuccess || isError || localCache !== null;

  const addTrip = useCallback((trip: Trip) => {
    const update = (prev: Trip[]) => {
      if (prev.some(t => t.id === trip.id)) return prev;
      const next = [trip, ...prev];
      save(next);
      return next;
    };
    qc.setQueryData<Trip[]>(["trips"], (prev = []) => update(prev));
    setLocalCache(prev => update(prev ?? []));
  }, [qc]);

  const deleteTrip = useCallback((id: string) => {
    const update = (prev: Trip[]) => {
      const next = prev.filter(t => t.id !== id);
      save(next);
      return next;
    };
    qc.setQueryData<Trip[]>(["trips"], (prev = []) => update(prev));
    setLocalCache(prev => update(prev ?? []));
  }, [qc]);

  const updateTrip = useCallback((trip: Trip) => {
    const update = (prev: Trip[]) => {
      const next = prev.map(t => t.id === trip.id ? trip : t);
      save(next);
      return next;
    };
    qc.setQueryData<Trip[]>(["trips"], (prev = []) => update(prev));
    setLocalCache(prev => update(prev ?? []));
    // Persist to Firestore
    upsertTripRemote(trip).catch(err =>
      console.warn("[TripsContext] updateTrip upsert failed:", err)
    );
  }, [qc]);

  const clearTrips = useCallback(async () => {
    qc.setQueryData<Trip[]>(["trips"], []);
    setLocalCache([]);
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
