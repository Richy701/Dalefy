import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Trip } from "@/shared/types";
import { fetchTrips, upsertTrip as upsertTripRemote, subscribeToTrips } from "@/services/firebaseTrips";

const CACHE_KEY = "daf-trips-cache";

export const TRIPS_CTX_VERSION = "v9";
console.log(`[TripsContext] ${TRIPS_CTX_VERSION} loaded`);
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
  /** Debug: raw localCache length, isSuccess, isError */
  _debug: { lc: number | null; ok: boolean; err: boolean };
  addTrip: (trip: Trip) => void;
  deleteTrip: (id: string) => void;
  updateTrip: (trip: Trip) => void;
  /** Optimistic-only update — no Firestore write */
  updateTripLocal: (trip: Trip) => void;
  clearTrips: () => Promise<void>;
  reload: () => Promise<boolean>;
  /** Block subscription/reload overwrites while a long-running operation is in progress */
  holdWrites: () => void;
  releaseWrites: () => void;
}

const TripsContext = createContext<TripsContextValue | null>(null);

function save(trips: Trip[]) {
  if (trips.length === 0) return;
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

  const hasCache = _eagerReady && _eagerCache !== null && _eagerCache.length > 0;
  // If Firestore hasn't responded, assume offline (shorter timeout on cold start with no cache)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!confirmedOnline.current) {
        console.log("[TripsContext] offline timeout");
        setNetworkDown(true);
      }
    }, hasCache ? 3000 : 1500);
    return () => clearTimeout(timer);
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
    if (isError) {
      setNetworkDown(true);
      confirmedOnline.current = false;
    }
  }, [isError]);

  // Sync remote data → local cache (only non-empty to prevent offline wipes)
  useEffect(() => {
    if (remoteTrips && pendingWrites.current === 0 && remoteTrips.length > 0) {
      setLocalCache(remoteTrips);
      save(remoteTrips);
    }
  }, [remoteTrips]);

  // Firestore realtime subscription (never accepts empty — prevents offline wipes)
  useEffect(() => {
    const unsub = subscribeToTrips((freshTrips) => {
      if (pendingWrites.current > 0) return;
      if (freshTrips.length === 0) return;
      confirmedOnline.current = true;
      setNetworkDown(false);
      qc.setQueryData<Trip[]>(["trips"], freshTrips);
      setLocalCache(freshTrips);
      save(freshTrips);
    });
    return () => unsub();
  }, [qc]);

  // Auto-recover from offline: poll fetchTrips every 10s until we get a response
  useEffect(() => {
    if (!networkDown) return;
    const id = setInterval(() => {
      fetchTrips()
        .then((trips) => {
          confirmedOnline.current = true;
          setNetworkDown(false);
          qc.setQueryData<Trip[]>(["trips"], trips);
          if (trips.length > 0) {
            setLocalCache(trips);
            save(trips);
          }
        })
        .catch(() => {});
    }, 10000);
    return () => clearInterval(id);
  }, [networkDown, qc]);

  // Prefer remote when it has data; fall back to cache when remote is empty.
  // Only show truly empty when remote confirmed empty AND cache is also empty.
  const rawTrips = useMemo(() => {
    if (remoteTrips && remoteTrips.length > 0) return remoteTrips;
    if (localCache && localCache.length > 0) return localCache;
    if (isSuccess) return remoteTrips ?? [];
    return remoteTrips ?? localCache ?? [];
  }, [remoteTrips, localCache, isSuccess]);

  const trips = useMemo(() => rawTrips.map(t => {
    const snap = t.publishedSnapshot;
    if (!snap) return t;
    return { ...t, events: snap.events, info: t.info ?? snap.info, organizer: t.organizer ?? snap.organizer, image: snap.image, name: snap.name, destination: snap.destination, start: snap.start, end: snap.end, paxCount: snap.paxCount };
  }), [rawTrips]);
  const hasCachedTrips = localCache !== null && localCache.length > 0;
  const ready = hasCachedTrips || isSuccess || isError || networkDown;
  const offline = networkDown && !isSuccess;
  const _debug = useMemo(() => ({ lc: localCache ? localCache.length : null, ok: isSuccess, err: isError }), [localCache, isSuccess, isError]);

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

  const reload = useCallback(async (): Promise<boolean> => {
    if (pendingWrites.current > 0) return false;
    try {
      const fresh = await fetchTrips();
      confirmedOnline.current = true;
      setNetworkDown(false);
      qc.setQueryData<Trip[]>(["trips"], fresh);
      if (fresh.length > 0) {
        setLocalCache(fresh);
        save(fresh);
      }
      return true;
    } catch {
      setNetworkDown(true);
      confirmedOnline.current = false;
      return false;
    }
  }, [qc]);

  return (
    <TripsContext.Provider value={{ trips, ready, offline, _debug, addTrip, deleteTrip, updateTrip, updateTripLocal, clearTrips, reload, holdWrites, releaseWrites }}>
      {children}
    </TripsContext.Provider>
  );
}

export function useTrips() {
  const ctx = useContext(TripsContext);
  if (!ctx) throw new Error("useTrips must be used within TripsProvider");
  return ctx;
}
