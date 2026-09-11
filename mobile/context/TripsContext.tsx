import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Trip } from "@/shared/types";
import { fetchTrips, changeTripMedia, subscribeToTrips } from "@/services/firebaseTrips";
import { onAuthStateChanged } from "firebase/auth";
import { firebaseAuth } from "@/services/firebase";

const CACHE_KEY = "daf-published-trips-cache-v2";
// Preserve the original cache for recovery. Never delete it during module loading.
async function readCache(): Promise<Trip[] | null> {
  for (const key of [CACHE_KEY, "daf-trips-cache"]) {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed as Trip[];
    } catch { /* Try the older copy if the current cache is damaged. */ }
  }
  return null;
}

export const TRIPS_CTX_VERSION = "v9";
console.log(`[TripsContext] ${TRIPS_CTX_VERSION} loaded`);
// Eager module-level cache read — fires at import time, well before React mounts.
// If AsyncStorage resolves before first render, trips are available immediately.
let _eagerCache: Trip[] | null = null;
let _eagerReady = false;
readCache().then(trips => {
  _eagerCache = trips;
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
  updateTrip: (trip: Trip) => Promise<void>;
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
  const publicTrips = trips.map(trip => ({
    ...trip,
    info: trip.info?.filter(page => !page.leaderOnly),
    events: trip.events.map(event => {
      const safe = { ...event };
      delete safe.notes;
      delete safe.price;
      delete safe.supplier;
      delete safe.confNumber;
      delete safe.seatDetails;
      return safe;
    }),
  }));
  AsyncStorage.setItem(CACHE_KEY, JSON.stringify(publicTrips)).catch(() => {});
}

export function TripsProvider({ children }: { children: React.ReactNode }) {
  const [localCache, setLocalCache] = useState<Trip[] | null>(_eagerCache);
  const [networkDown, setNetworkDown] = useState(false);
  const mounted = useRef(true);
  const qc = useQueryClient();
  useEffect(() => {
    let previousUid = firebaseAuth().currentUser?.uid;
    let initialized = false;
    return onAuthStateChanged(firebaseAuth(), user => {
      // Restoring persisted auth on launch is not an account switch.
      if (!initialized) {
        initialized = true;
        previousUid = user?.uid;
        return;
      }
      if (previousUid !== user?.uid) {
        previousUid = user?.uid;
        _eagerCache = [];
        void qc.cancelQueries({ queryKey: ["trips"] }).then(() => {
          qc.setQueryData<Trip[]>(["trips"], []);
          setLocalCache([]);
          save([]);
          void qc.invalidateQueries({ queryKey: ["trips"] });
        });
      }
    });
  }, [qc]);
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
    readCache()
      .then(cached => {
        if (mounted.current) setLocalCache(cached ?? []);
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

  // Cache authoritative responses, including membership removals.
  useEffect(() => {
    if (remoteTrips && pendingWrites.current === 0) {
      setLocalCache(remoteTrips);
      save(remoteTrips);
    }
  }, [remoteTrips]);

  // Membership-driven API refreshes report successful empties, not network errors.
  useEffect(() => {
    const unsub = subscribeToTrips((freshTrips) => {
      if (pendingWrites.current > 0) return;
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
          setLocalCache(trips);
          save(trips);
        })
        .catch(() => {});
    }, 10000);
    return () => clearInterval(id);
  }, [networkDown, qc]);

  // Prefer remote when it has data; fall back to cache when remote is empty.
  // Only show truly empty when remote confirmed empty AND cache is also empty.
  const trips = useMemo(() => {
    if (isSuccess) return remoteTrips ?? [];
    return remoteTrips ?? localCache ?? [];
  }, [remoteTrips, localCache, isSuccess]);
  const hasCachedTrips = localCache !== null && localCache.length > 0;
  const ready = hasCachedTrips || isSuccess || isError || networkDown;
  const offline = networkDown && !isSuccess;
  const _debug = useMemo(() => ({ lc: localCache ? localCache.length : null, ok: isSuccess, err: isError }), [localCache, isSuccess, isError]);

  // Ensure displayed trips are always persisted for offline cold start
  const lastSaved = useRef("");
  useEffect(() => {
    // Initial empty rendering must not overwrite storage before hydration finishes.
    if (trips.length === 0) return;
    const json = JSON.stringify(trips);
    if (json !== lastSaved.current) {
      lastSaved.current = json;
      save(trips);
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

  const updateTrip = useCallback(async (trip: Trip) => {
    const previous = (qc.getQueryData<Trip[]>(["trips"]) ?? []).find(t => t.id === trip.id);
    const keep = new Set((trip.media ?? []).map(m => m.id));
    const removed = (previous?.media ?? []).filter(m => !keep.has(m.id)).map(m => m.id);
    const update = (prev: Trip[]) => {
      const next = prev.map(t => t.id === trip.id ? trip : t);
      save(next);
      return next;
    };
    pendingWrites.current++;
    try {
      await changeTripMedia(trip.id, [], removed);
      qc.setQueryData<Trip[]>(["trips"], (prev = []) => update(prev));
      setLocalCache(prev => update(prev ?? []));
    } finally { pendingWrites.current--; }
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
      setLocalCache(fresh);
      save(fresh);
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
