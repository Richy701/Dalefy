import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Trip } from "@/shared/types";
import { withEventTimes24h } from "@/shared/dates";
import { fetchTripById, fetchTrips, setGalleryLike, subscribeToTrips } from "@/services/firebaseTrips";
import { onAuthStateChanged } from "firebase/auth";
import { firebaseAuth } from "@/services/firebase";

import { deleteGalleryPhoto, withoutGalleryPhoto } from "@/services/galleryDelete";

const CACHE_KEY = "daf-published-trips-cache-v3";
// Only hydrate data fetched through the filtered API after the security cutover.
async function readCache(): Promise<Trip[] | null> {
  const raw = await AsyncStorage.getItem(CACHE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Trip[]).map(t => ({ ...t, events: withEventTimes24h(t.events ?? []) })) : null;
  } catch { return null; }
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
  likePhoto: (tripId: string, mediaId: string, liked: boolean) => Promise<void>;
  deletePhoto: (tripId: string, mediaId: string) => Promise<void>;
  /** Optimistic-only update — no Firestore write */
  updateTripLocal: (trip: Trip) => void;
  clearTrips: () => Promise<void>;
  reload: () => Promise<boolean>;
  /** After a join is saved: the copy fetched before joining has no photos, because the server only sends those to members */
  refreshJoinedTrip: (id: string) => Promise<void>;
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
  AsyncStorage.setItem(CACHE_KEY, JSON.stringify(publicTrips))
    .then(() => AsyncStorage.multiRemove(["daf-published-trips-cache-v2", "daf-trips-cache"]))
    .catch(() => {});
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- a one-shot launch timer: hasCache is only meant to pick its length on cold start
  }, []);

  // Load local cache for instant display (fallback if eager read wasn't ready)
  useEffect(() => {
    mounted.current = true;
    if (_eagerReady && _eagerCache) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- copies the module-level eager cache into state on mount, in case the eager read finished after the first render
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mirrors the query result into networkDown, which the offline timer and the 10s poll also write, so it cannot be derived
    if (isSuccess) { confirmedOnline.current = true; setNetworkDown(false); }
  }, [isSuccess]);

  useEffect(() => {
    if (isError) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- mirrors the query error into networkDown, which the offline timer and the 10s poll also write, so it cannot be derived
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
    }, (id, trip) => {
      // One trip changed: swap it in, or drop it if it's no longer published to us
      if (pendingWrites.current > 0) return;
      const prev = qc.getQueryData<Trip[]>(["trips"]) ?? [];
      const next = trip
        ? (prev.some(t => t.id === id) ? prev.map(t => t.id === id ? trip : t) : [...prev, trip])
            .sort((a, b) => b.start.localeCompare(a.start))
        : prev.filter(t => t.id !== id);
      qc.setQueryData<Trip[]>(["trips"], next);
      setLocalCache(next);
      save(next);
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

  const deletePhoto = useCallback(async (tripId: string, mediaId: string) => {
    pendingWrites.current++;
    try {
      await deleteGalleryPhoto(tripId, mediaId);
      // Apply to the latest cache after confirmation, preserving concurrent uploads.
      const update = (prev: Trip[]) => {
        const next = withoutGalleryPhoto(prev, tripId, mediaId);
        save(next);
        return next;
      };
      qc.setQueryData<Trip[]>(["trips"], (prev = []) => update(prev));
      setLocalCache(prev => update(prev ?? []));
    } finally { pendingWrites.current--; }
  }, [qc]);

  const likePhoto = useCallback(async (tripId: string, mediaId: string, liked: boolean) => {
    pendingWrites.current++;
    try {
      const likes = await setGalleryLike(tripId, mediaId, liked);
      const update = (prev: Trip[]) => {
        const next = prev.map(trip => trip.id !== tripId ? trip : { ...trip, media: trip.media?.map(photo => photo.id === mediaId ? { ...photo, likes } : photo) });
        save(next);
        return next;
      };
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

  const refreshJoinedTrip = useCallback(async (id: string) => {
    const fresh = await fetchTripById(id).catch(() => null);
    if (!fresh) return;
    const next = (qc.getQueryData<Trip[]>(["trips"]) ?? []).map(t => (t.id === id ? fresh : t));
    qc.setQueryData<Trip[]>(["trips"], next);
    setLocalCache(next);
    save(next);
  }, [qc]);

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
    <TripsContext.Provider value={{ trips, ready, offline, _debug, addTrip, refreshJoinedTrip, deleteTrip, deletePhoto, likePhoto, updateTripLocal, clearTrips, reload, holdWrites, releaseWrites }}>
      {children}
    </TripsContext.Provider>
  );
}

export function useTrips() {
  const ctx = useContext(TripsContext);
  if (!ctx) throw new Error("useTrips must be used within TripsProvider");
  return ctx;
}
