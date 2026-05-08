import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Trip } from "@/shared/types";
import { fetchTrips, upsertTrip as upsertTripRemote, subscribeToTrips } from "@/services/firebaseTrips";

const CACHE_KEY = "daf-trips-cache";

// Eager module-level cache read — fires at import time, well before React mounts.
// If AsyncStorage resolves before first render, trips are available immediately.
let _eagerCache: Trip[] | null = null;
let _eagerReady = false;
AsyncStorage.getItem(CACHE_KEY).then(raw => {
  console.log("[TripsCache] eager load:", raw ? `${JSON.parse(raw).length} trips` : "empty");
  if (raw) {
    try { _eagerCache = JSON.parse(raw) as Trip[]; } catch {}
  }
  _eagerReady = true;
}).catch(() => { _eagerReady = true; });

interface TripsContextValue {
  trips: Trip[];
  ready: boolean;
  offline: boolean;
  addTrip: (trip: Trip) => void;
  deleteTrip: (id: string) => void;
  updateTrip: (trip: Trip) => void;
  /** Optimistic-only update — no Firestore write */
  updateTripLocal: (trip: Trip) => void;
  clearTrips: () => Promise<void>;
  reload: () => Promise<void>;
  /** Block subscription/reload overwrites while a long-running operation is in progress */
  holdWrites: () => void;
  releaseWrites: () => void;
}

const TripsContext = createContext<TripsContextValue | null>(null);

function save(trips: Trip[]) {
  AsyncStorage.setItem(CACHE_KEY, JSON.stringify(trips)).catch(() => {});
}

export function TripsProvider({ children }: { children: React.ReactNode }) {
  const [localCache, setLocalCache] = useState<Trip[] | null>(_eagerCache);
  const [networkDown, setNetworkDown] = useState(false);
  const mounted = useRef(true);
  const qc = useQueryClient();
  /** Track pending writes — block subscription updates until all writes settle */
  const pendingWrites = useRef(0);
  /** True once a remote fetch has succeeded — safe to trust empty results */
  const confirmedOnline = useRef(false);

  // Fast network check — resolves in <2s instead of waiting for Firestore timeouts
  useEffect(() => {
    fetch("https://firestore.googleapis.com", { method: "HEAD", mode: "no-cors" })
      .then(() => setNetworkDown(false))
      .catch(() => setNetworkDown(true));
  }, []);

  // Load local cache for instant display (fallback if eager read wasn't ready)
  useEffect(() => {
    mounted.current = true;
    if (_eagerReady && _eagerCache) {
      setLocalCache(_eagerCache);
      return () => { mounted.current = false; };
    }
    AsyncStorage.getItem(CACHE_KEY)
      .then(raw => {
        if (raw && mounted.current) setLocalCache(JSON.parse(raw) as Trip[]);
        else if (mounted.current) setLocalCache([]);
      })
      .catch(() => { if (mounted.current) setLocalCache([]); });
    return () => { mounted.current = false; };
  }, []);

  // React Query handles fetching, caching, retries, deduplication
  const { data: remoteTrips, isSuccess, isError } = useQuery<Trip[]>({
    queryKey: ["trips"],
    queryFn: fetchTrips,
    staleTime: 1000 * 60 * 2,
    retry: 1,
    retryDelay: 1000,
  });

  useEffect(() => {
    if (isSuccess) { confirmedOnline.current = true; setNetworkDown(false); }
  }, [isSuccess]);

  useEffect(() => {
    if (isError) setNetworkDown(true);
  }, [isError]);

  // Sync remote data → local cache when it arrives (skip during pending writes)
  useEffect(() => {
    if (remoteTrips && pendingWrites.current === 0) {
      setLocalCache(remoteTrips);
      save(remoteTrips);
    }
  }, [remoteTrips]);

  // Firestore realtime subscription — push fresh data straight into the query cache
  // Skip updates while local writes are pending to prevent overwriting optimistic state
  // Don't let empty snapshots wipe cache until we've confirmed we're actually online
  useEffect(() => {
    const unsub = subscribeToTrips((freshTrips) => {
      if (pendingWrites.current > 0) return;
      if (freshTrips.length === 0 && !confirmedOnline.current) return;
      qc.setQueryData<Trip[]>(["trips"], freshTrips);
      setLocalCache(freshTrips);
      save(freshTrips);
    });
    return () => unsub();
  }, [qc]);

  // Use remote data when available, fall back to local cache only before first fetch.
  const rawTrips = useMemo(() => {
    if (isSuccess) return remoteTrips ?? [];
    if (localCache && localCache.length > 0) return localCache;
    return remoteTrips ?? localCache ?? [];
  }, [remoteTrips, localCache, isSuccess]);

  const trips = useMemo(() => rawTrips.map(t => {
    const snap = t.publishedSnapshot;
    if (!snap) return t;
    return { ...t, events: snap.events, info: snap.info, organizer: snap.organizer, image: snap.image, name: snap.name, destination: snap.destination, start: snap.start, end: snap.end, paxCount: snap.paxCount };
  }), [rawTrips]);
  const ready = localCache !== null && (isSuccess || isError || networkDown || localCache.length > 0);
  const offline = networkDown && !isSuccess;

  // Ensure displayed trips are always persisted for offline cold start
  const lastSaved = useRef("");
  useEffect(() => {
    if (trips.length === 0) return;
    const json = JSON.stringify(trips);
    if (json !== lastSaved.current) {
      lastSaved.current = json;
      AsyncStorage.setItem(CACHE_KEY, json).catch(() => {});
    }
  }, [trips]);

  const addTrip = useCallback((trip: Trip) => {
    const update = (prev: Trip[]) => {
      if (prev.some(t => t.id === trip.id)) return prev;
      const next = [trip, ...prev];
      save(next);
      return next;
    };
    qc.setQueryData<Trip[]>(["trips"], (prev = []) => update(prev));
    setLocalCache(prev => update(prev ?? []));
    // Guard until membership write settles (logTripJoin is called separately)
    pendingWrites.current++;
    setTimeout(() => { pendingWrites.current--; }, 5000);
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

  /** Optimistic-only update — updates UI + local cache, NO Firestore write.
   *  Use for temporary states (e.g. showing local URIs before cloud upload). */
  const updateTripLocal = useCallback((trip: Trip) => {
    const update = (prev: Trip[]) => {
      const next = prev.map(t => t.id === trip.id ? trip : t);
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
    // Block subscription until write settles
    pendingWrites.current++;
    upsertTripRemote(trip)
      .catch(err => console.warn("[TripsContext] updateTrip upsert failed:", err))
      .finally(() => { pendingWrites.current--; });
  }, [qc]);

  const clearTrips = useCallback(async () => {
    qc.setQueryData<Trip[]>(["trips"], []);
    setLocalCache([]);
    await AsyncStorage.removeItem(CACHE_KEY);
  }, [qc]);

  const holdWrites = useCallback(() => { pendingWrites.current++; }, []);
  const releaseWrites = useCallback(() => { pendingWrites.current = Math.max(0, pendingWrites.current - 1); }, []);

  const reload = useCallback(async () => {
    // Don't refetch from Firestore while writes are pending — use local cache
    if (pendingWrites.current > 0) {
      console.log("[TripsContext] reload: skipped (writes pending)");
      return;
    }
    try {
      console.log("[TripsContext] reload: invalidating query...");
      await qc.invalidateQueries({ queryKey: ["trips"] });
      console.log("[TripsContext] reload: complete");
    } catch (err) {
      console.error("[TripsContext] reload failed:", err);
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      if (raw) {
        const cached = JSON.parse(raw) as Trip[];
        qc.setQueryData<Trip[]>(["trips"], cached);
      }
    }
  }, [qc]);

  return (
    <TripsContext.Provider value={{ trips, ready, offline, addTrip, deleteTrip, updateTrip, updateTripLocal, clearTrips, reload, holdWrites, releaseWrites }}>
      {children}
    </TripsContext.Provider>
  );
}

export function useTrips() {
  const ctx = useContext(TripsContext);
  if (!ctx) throw new Error("useTrips must be used within TripsProvider");
  return ctx;
}
