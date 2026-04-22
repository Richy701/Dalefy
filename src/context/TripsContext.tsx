import { createContext, useContext, useCallback, useMemo, useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Trip, TravelEvent } from "@/types";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { INITIAL_TRIPS } from "@/data/trips";
import { isFirebaseConfigured } from "@/services/firebase";
import { fetchTrips, upsertTrip, removeTrip, subscribeToTrips } from "@/services/firebaseTrips";
import { deriveAttendeesString } from "@/lib/travelerSync";
import { useOrg } from "@/context/OrgContext";
import { STORAGE } from "@/config/storageKeys";
import { logger } from "@/lib/logger";
import { useAuth } from "@/context/AuthContext";
import { useCloudSync } from "@/hooks/useCloudSync";
import { useTravelerMigration } from "@/hooks/useTravelerMigration";

// ── Context type ──────────────────────────────────────────────────────────────

interface TripsContextType {
  trips: Trip[];
  ready: boolean;
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
  ready: false,
  setTrips: () => {},
  addTrip: () => {},
  deleteTrip: () => {},
  updateTrip: () => {},
  addEvent: () => {},
  updateEvent: () => {},
  deleteEvent: () => {},
});

// ── Data source hooks ─────────────────────────────────────────────────────────

function useCloudTrips(uid: string | null) {
  const qc = useQueryClient();

  const { data: trips = [], isSuccess } = useQuery<Trip[]>({
    queryKey: ["trips", uid],
    queryFn: fetchTrips,
    staleTime: 1000 * 60 * 5,
    retry: 2,
    enabled: !!uid,
  });

  // Firestore realtime listener — re-subscribe when user changes
  useEffect(() => {
    if (!uid) return;
    const unsub = subscribeToTrips((updated) => {
      qc.setQueryData<Trip[]>(["trips", uid], updated);
    });
    return () => unsub();
  }, [qc, uid]);

  const setTrips: React.Dispatch<React.SetStateAction<Trip[]>> = useCallback((action) => {
    const prev = qc.getQueryData<Trip[]>(["trips", uid]) ?? [];
    const next = typeof action === "function" ? action(prev) : action;
    qc.setQueryData<Trip[]>(["trips", uid], next);
    syncToCloud(prev, next);
  }, [qc, uid]);

  return { trips, setTrips, ready: isSuccess };
}

/** Demo/seed trip IDs — never push to cloud */
const DEMO_IDS = new Set(INITIAL_TRIPS.map(t => t.id));

function syncToCloud(prev: Trip[], next: Trip[]) {
  const prevIds = new Set(prev.map(t => t.id));
  const nextIds = new Set(next.map(t => t.id));

  for (const trip of next) {
    if (DEMO_IDS.has(trip.id)) continue; // never push demo data
    const old = prev.find(t => t.id === trip.id);
    if (!old || JSON.stringify(old) !== JSON.stringify(trip)) {
      logger.log("syncToCloud", "upserting trip:", trip.id, trip.name, "events:", trip.events.length);
      upsertTrip(trip).then((cleaned) => {
        // Write download URLs back to localStorage so images survive refresh
        if (JSON.stringify(cleaned) !== JSON.stringify(trip)) {
          try {
            const stored: Trip[] = JSON.parse(localStorage.getItem(STORAGE.TRIPS) || "[]");
            const idx = stored.findIndex(t => t.id === cleaned.id);
            if (idx >= 0) { stored[idx] = { ...stored[idx], image: cleaned.image, events: cleaned.events }; }
            else { stored.push(cleaned); }
            localStorage.setItem(STORAGE.TRIPS, JSON.stringify(stored));
            logger.log("syncToCloud", "wrote download URLs back to localStorage for", cleaned.id);
          } catch { /* quota exceeded — cloud has the URLs, will load on next fetch */ }
        }
      }).catch(err => logger.error("syncToCloud", "upsert failed:", err));
    }
  }

  for (const id of prevIds) {
    if (DEMO_IDS.has(id)) continue; // never touch demo data in cloud
    if (!nextIds.has(id)) {
      logger.log("syncToCloud", "removing trip:", id);
      removeTrip(id).catch(err => logger.error("syncToCloud", "remove failed:", err));
    }
  }
}

function useLocalTrips(shouldSeed: boolean) {
  // Only use demo data as default for demo users — real users start with []
  const defaultTrips = shouldSeed ? INITIAL_TRIPS : [];
  const [trips, setTrips] = useLocalStorage<Trip[]>(STORAGE.TRIPS, defaultTrips);
  if (shouldSeed && trips.length === 0 && INITIAL_TRIPS.length > 0) {
    const stored = localStorage.getItem(STORAGE.TRIPS);
    if (!stored || stored === "[]") {
      setTrips(INITIAL_TRIPS);
    }
  }
  return { trips, setTrips, ready: true };
}

// ── Merge cloud + local trips ─────────────────────────────────────────────────

/** Merge local media/images into a cloud trip (Firestore can't store base64). */
function mergeLocalMedia(cloud: Trip, local: Trip): Trip {
  let patched = false;
  const result = { ...cloud };

  // Trip cover image
  if (!result.image && local.image) { result.image = local.image; patched = true; }

  // Trip-level media
  if (local.media?.length && (!result.media?.length || result.media.length < local.media.length)) {
    result.media = local.media; patched = true;
  }

  // Event-level images, media, documents
  if (local.events?.length && result.events?.length) {
    const localMap = new Map(local.events.map(e => [e.id, e]));
    result.events = result.events.map(ev => {
      const le = localMap.get(ev.id);
      if (!le) return ev;
      let changed = false;
      const e = { ...ev };
      if (!e.image && le.image) { e.image = le.image; changed = true; }
      if (le.media?.length && (!e.media?.length || e.media.length < le.media.length)) { e.media = le.media; changed = true; }
      if (le.documents?.length && (!e.documents?.length || e.documents.length < le.documents.length)) { e.documents = le.documents; changed = true; }
      return changed ? e : ev;
    });
    patched = true;
  }

  // Other fields that may be missing from cloud
  if (!result.travelerIds?.length && local.travelerIds?.length) { result.travelerIds = local.travelerIds; patched = true; }
  if (!result.travelers?.length && local.travelers?.length) { result.travelers = local.travelers; patched = true; }
  if ((!result.attendees || result.attendees === "Imported Group") && local.attendees) { result.attendees = local.attendees; patched = true; }
  if (!result.info?.length && local.info?.length) { result.info = local.info; patched = true; }
  if (!result.organizer && local.organizer) { result.organizer = local.organizer; patched = true; }

  return patched ? result : cloud;
}

function useMergedTrips(
  useCloud: boolean,
  isLocalOnly: boolean,
  cloudTrips: Trip[],
  localTrips: Trip[],
) {
  return useMemo(() => {
    logger.log("useMergedTrips", `useCloud=${useCloud} isLocalOnly=${isLocalOnly} cloud=${cloudTrips.length} local=${localTrips.length}`);
    if (!useCloud) return localTrips;

    // Read localStorage directly for the freshest local data
    let localSrc: Trip[] = localTrips;
    try {
      const stored = localStorage.getItem(STORAGE.TRIPS);
      if (stored) localSrc = JSON.parse(stored);
    } catch { /* use React state fallback */ }

    const localMap = new Map(localSrc.map(t => [t.id, t]));
    const cloudIds = new Set(cloudTrips.map(t => t.id));

    // Merge cloud trips with local media/metadata
    const merged = cloudTrips.map(t => {
      const lt = localMap.get(t.id);
      return lt ? mergeLocalMedia(t, lt) : t;
    });

    // Add local-only trips (not in cloud, not demo)
    const demoIds = new Set(INITIAL_TRIPS.map(t => t.id));
    for (const lt of localSrc) {
      if (!cloudIds.has(lt.id) && !demoIds.has(lt.id)) merged.push(lt);
    }

    return merged;
  }, [useCloud, cloudTrips, localTrips, isLocalOnly]);
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function TripsProvider({ children }: { children: ReactNode }) {
  const firebaseOn = isFirebaseConfigured();
  const { user, isLoading: authLoading } = useAuth();
  const isDemoUser = authLoading ? false : (!user || user.id === "demo" || (user.id?.length ?? 0) <= 20);
  const useCloud = firebaseOn && !isDemoUser;
  const local = useLocalTrips(isDemoUser && !authLoading);
  const cloud = useCloudTrips(useCloud ? (user?.id ?? null) : null);
  const { currentOrg } = useOrg();
  const isLocalOnly = !useCloud;

  const { setTrips } = useCloud ? cloud : local;
  const ready = useCloud ? cloud.ready : local.ready;

  const trips = useMergedTrips(useCloud, isLocalOnly, cloud.trips, local.trips);

  // Side-effect hooks (extracted)
  useCloudSync(useCloud, isLocalOnly, cloud.ready, cloud.trips, local.trips, cloud.setTrips);
  useTravelerMigration(trips, ready, setTrips, useCloud, local.setTrips);

  // Flush updater to localStorage synchronously
  const flushLocal = useCallback((updater: (prev: Trip[]) => Trip[]) => {
    local.setTrips(updater);
    try {
      const prev: Trip[] = JSON.parse(localStorage.getItem(STORAGE.TRIPS) || "[]");
      localStorage.setItem(STORAGE.TRIPS, JSON.stringify(updater(prev)));
    } catch { /* ignore */ }
  }, [local]);

  // ── CRUD operations ────────────────────────────────────────────────────────

  const addTrip = useCallback((trip: Trip) => {
    const tripWithOrg = currentOrg ? { ...trip, organizationId: trip.organizationId ?? currentOrg.id } : trip;
    setTrips(prev => [tripWithOrg, ...prev]);
    if (useCloud) flushLocal(prev => [tripWithOrg, ...prev]);
  }, [setTrips, useCloud, flushLocal, currentOrg]);

  const deleteTrip = useCallback((id: string) => {
    setTrips(prev => prev.filter(t => t.id !== id));
    if (useCloud) flushLocal(prev => prev.filter(t => t.id !== id));
  }, [setTrips, useCloud, flushLocal]);

  const updateTrip = useCallback((id: string, updates: Partial<Trip>) => {
    logger.log("updateTrip", "id:", id, "info in updates:", updates.info?.length ?? "undefined", "keys:", Object.keys(updates).join(","));
    const updater = (prev: Trip[]) => prev.map(t => {
      if (t.id !== id) return t;
      const merged = { ...t, ...updates };
      if (updates.travelers) {
        merged.attendees = deriveAttendeesString(merged.travelers ?? []);
        merged.paxCount = String((merged.travelers ?? []).length);
      }
      return merged;
    });
    setTrips(updater);
    if (useCloud) flushLocal(updater);
  }, [setTrips, useCloud, flushLocal]);

  const addEvent = useCallback((tripId: string, event: TravelEvent) => {
    const updater = (prev: Trip[]) => prev.map(t => {
      if (t.id !== tripId) return t;
      return { ...t, events: [...t.events, event] };
    });
    setTrips(updater);
    if (useCloud) flushLocal(updater);
  }, [setTrips, useCloud, flushLocal]);

  const updateEvent = useCallback((tripId: string, event: TravelEvent) => {
    const updater = (prev: Trip[]) => prev.map(t => {
      if (t.id !== tripId) return t;
      const exists = t.events.some(e => e.id === event.id);
      const newEvents = exists
        ? t.events.map(e => e.id === event.id ? event : e)
        : [...t.events, event];
      return { ...t, events: newEvents };
    });
    setTrips(updater);
    if (useCloud) flushLocal(updater);
  }, [setTrips, useCloud, flushLocal]);

  const deleteEvent = useCallback((tripId: string, eventId: string) => {
    const updater = (prev: Trip[]) => prev.map(t => {
      if (t.id !== tripId) return t;
      return { ...t, events: t.events.filter(e => e.id !== eventId) };
    });
    setTrips(updater);
    if (useCloud) flushLocal(updater);
  }, [setTrips, useCloud, flushLocal]);

  const value = useMemo(
    () => ({ trips, ready, setTrips, addTrip, deleteTrip, updateTrip, addEvent, updateEvent, deleteEvent }),
    [trips, ready, setTrips, addTrip, deleteTrip, updateTrip, addEvent, updateEvent, deleteEvent],
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
