import { createContext, useContext, useCallback, useMemo, useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Trip, TravelEvent } from "@/types";
import { useLocalStorage, notifyLocalStorage } from "@/hooks/useLocalStorage";
import { INITIAL_TRIPS } from "@/data/trips";
import { isFirebaseConfigured } from "@/services/firebase";
import { fetchTrips, upsertTrip, removeTrip, subscribeToTrips, backfillOrgId, repairTripOwnership } from "@/services/firebaseTrips";
import { notifyTripUpdate } from "@/services/pushNotify";
import { deriveAttendeesString } from "@/lib/travelerSync";
import { useOrg } from "@/context/OrgContext";
import { STORAGE } from "@/config/storageKeys";
import { logger } from "@/lib/logger";
import { useAuth } from "@/context/AuthContext";
import { useCloudSync } from "@/hooks/useCloudSync";
import { useTravelerMigration } from "@/hooks/useTravelerMigration";
import { toast } from "sonner";

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

function useCloudTrips(uid: string | null, orgId?: string | null) {
  const qc = useQueryClient();
  const recentLocalEdits = useRef<Set<string>>(new Set());
  const pendingDeletes = useRef<Set<string>>(new Set());
  const queryKey = ["trips", orgId || uid];

  const { data: trips = [], isSuccess } = useQuery<Trip[]>({
    queryKey,
    queryFn: () => fetchTrips(orgId),
    staleTime: 1000 * 60 * 5,
    retry: 2,
    enabled: !!uid,
  });

  useEffect(() => {
    if (!uid) return;
    const unsub = subscribeToTrips((updated) => {
      // Filter out trips that are pending deletion to prevent snapshot revert
      let incoming = pendingDeletes.current.size > 0
        ? updated.filter(t => !pendingDeletes.current.has(t.id))
        : updated;

      // For trips we just edited locally, keep our version to avoid bounce;
      // accept cloud version for everything else (e.g. other users' changes)
      if (recentLocalEdits.current.size > 0) {
        const local = qc.getQueryData<Trip[]>(queryKey) ?? [];
        const localMap = new Map(local.map(t => [t.id, t]));
        incoming = incoming.map(t => {
          if (recentLocalEdits.current.has(t.id)) {
            return localMap.get(t.id) ?? t;
          }
          return t;
        });
        recentLocalEdits.current.clear();
      }

      qc.setQueryData<Trip[]>(queryKey, incoming);
    }, orgId);
    return () => unsub();
  }, [qc, uid, orgId]);

  const setTrips: React.Dispatch<React.SetStateAction<Trip[]>> = useCallback((action) => {
    const prev = qc.getQueryData<Trip[]>(queryKey) ?? [];
    const next = typeof action === "function" ? action(prev) : action;

    // Track deleted IDs so snapshots don't re-add them
    const nextIds = new Set(next.map(t => t.id));
    for (const t of prev) {
      if (!nextIds.has(t.id)) {
        pendingDeletes.current.add(t.id);
        setTimeout(() => pendingDeletes.current.delete(t.id), 10_000);
      }
    }

    // Track which trips we just modified so the next snapshot keeps our version
    for (const trip of next) {
      const old = prev.find(t => t.id === trip.id);
      if (!old || JSON.stringify(old) !== JSON.stringify(trip)) {
        recentLocalEdits.current.add(trip.id);
      }
    }
    setTimeout(() => recentLocalEdits.current.clear(), 5000);

    qc.setQueryData<Trip[]>(queryKey, next);
    syncToCloud(prev, next, orgId);
  }, [qc, uid, orgId]);

  return { trips, setTrips, ready: isSuccess };
}

/** Demo/seed trip IDs — never push to cloud */
const DEMO_IDS = new Set(INITIAL_TRIPS.map(t => t.id));

/** Detect meaningful itinerary changes between old and new trip state */
function detectTripChanges(old: Trip, next: Trip): string[] {
  const changes: string[] = [];
  const oldEvents = new Map(old.events.map(e => [e.id, e]));
  const nextEvents = new Map(next.events.map(e => [e.id, e]));

  // New events
  for (const [id, ev] of nextEvents) {
    if (!oldEvents.has(id)) {
      changes.push(`New ${ev.type}: ${ev.title}`);
    }
  }

  // Removed events
  for (const [id, ev] of oldEvents) {
    if (!nextEvents.has(id)) {
      changes.push(`Removed: ${ev.title}`);
    }
  }

  // Modified events (time, date, location changes)
  for (const [id, ev] of nextEvents) {
    const prev = oldEvents.get(id);
    if (!prev) continue;
    if (prev.time !== ev.time || prev.date !== ev.date) {
      changes.push(`${ev.title} rescheduled`);
    } else if (prev.location !== ev.location) {
      changes.push(`${ev.title} location updated`);
    } else if (prev.status !== ev.status && ev.type === "flight") {
      changes.push(`${ev.flightNum || ev.title}: ${ev.status}`);
    }
  }

  // Trip-level changes (skip media-only changes)
  if (old.start !== next.start || old.end !== next.end) {
    changes.push("Trip dates updated");
  }

  return changes;
}

function syncToCloud(prev: Trip[], next: Trip[], orgId?: string | null) {
  const prevIds = new Set(prev.map(t => t.id));
  const nextIds = new Set(next.map(t => t.id));

  for (const trip of next) {
    if (DEMO_IDS.has(trip.id)) continue; // never push demo data
    const old = prev.find(t => t.id === trip.id);
    if (!old || JSON.stringify(old) !== JSON.stringify(trip)) {
      logger.log("syncToCloud", "upserting trip:", trip.id, trip.name, "events:", trip.events.length);
      upsertTrip(trip, orgId).then((cleaned) => {
        // Write download URLs back to localStorage so images survive refresh
        if (JSON.stringify(cleaned) !== JSON.stringify(trip)) {
          try {
            const stored: Trip[] = JSON.parse(localStorage.getItem(STORAGE.TRIPS) || "[]");
            const idx = stored.findIndex(t => t.id === cleaned.id);
            if (idx >= 0) { stored[idx] = { ...stored[idx], image: cleaned.image, events: cleaned.events, info: cleaned.info, documents: cleaned.documents, travelers: cleaned.travelers, travelerIds: cleaned.travelerIds, organizer: cleaned.organizer, attendees: cleaned.attendees }; }
            else { stored.push(cleaned); }
            localStorage.setItem(STORAGE.TRIPS, JSON.stringify(stored));
            logger.log("syncToCloud", "wrote download URLs back to localStorage for", cleaned.id);
          } catch { /* quota exceeded — cloud has the URLs, will load on next fetch */ }
        }

        // Notify trip members of itinerary changes
        if (old && trip.status !== "Draft") {
          const changes = detectTripChanges(old, trip);
          if (changes.length > 0) {
            notifyTripUpdate(trip.id, trip.name, changes).catch(err =>
              logger.error("syncToCloud", "push notify failed:", err)
            );
          }
        }
      }).catch(err => {
        logger.error("syncToCloud", "upsert failed:", err);
        toast.error("Failed to sync changes to cloud");
      });
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

  // Structured fields (info, travelers, organizer) live in Firestore — never
  // restore them from localStorage, which can be stale or quota-capped.

  return patched ? result : cloud;
}

function useMergedTrips(
  useCloud: boolean,
  isLocalOnly: boolean,
  cloudTrips: Trip[],
  localTrips: Trip[],
  deletedIds: Set<string>,
) {
  return useMemo(() => {
    logger.log("useMergedTrips", `useCloud=${useCloud} isLocalOnly=${isLocalOnly} cloud=${cloudTrips.length} local=${localTrips.length} deleted=${deletedIds.size}`);
    if (!useCloud) return localTrips.filter(t => !deletedIds.has(t.id));

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

    // Cloud is the source of truth — don't recover local-only trips as they
    // are either stale leftovers or ghost trips from incomplete deletions.

    return merged;
  }, [useCloud, cloudTrips, localTrips, isLocalOnly, deletedIds]);
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function TripsProvider({ children }: { children: ReactNode }) {
  const firebaseOn = isFirebaseConfigured();
  const { user, isLoading: authLoading } = useAuth();
  const isDemoUser = authLoading ? false : (!user || user.id === "demo" || (user.id?.length ?? 0) <= 20);
  const useCloud = firebaseOn && !isDemoUser;
  const local = useLocalTrips(isDemoUser && !authLoading);
  const { currentOrg, isLoading: orgLoading } = useOrg();
  const orgId = currentOrg?.id ?? null;
  // Don't fire cloud queries while org is still loading — avoids a user_id-only
  // query that returns incomplete results, then a second org-scoped query that
  // briefly flashes empty while it resolves.
  const cloudUid = useCloud && !orgLoading ? (user?.id ?? null) : null;
  const cloud = useCloudTrips(cloudUid, orgId);
  const isLocalOnly = !useCloud;

  const { setTrips } = useCloud ? cloud : local;
  const ready = useCloud ? cloud.ready : local.ready;

  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const trips = useMergedTrips(useCloud, isLocalOnly, cloud.trips, local.trips, deletedIds);

  // One-time backfill: stamp existing user trips with org ID + repair ownership
  const backfillRan = useRef(false);
  useEffect(() => {
    if (!useCloud || !orgId || !cloud.ready || backfillRan.current) return;
    backfillRan.current = true;
    backfillOrgId(orgId).catch(err => logger.error("TripsProvider", "org backfill failed:", err));
    repairTripOwnership(orgId).catch(err => logger.error("TripsProvider", "ownership repair failed:", err));
  }, [useCloud, orgId, cloud.ready]);

  // One-time cleanup: strip structured fields from localStorage that belong in
  // Firestore. Prevents stale localStorage from resurrecting deleted data.
  const localCleanupRan = useRef(false);
  useEffect(() => {
    if (!useCloud || !cloud.ready || localCleanupRan.current) return;
    localCleanupRan.current = true;
    try {
      const raw = localStorage.getItem(STORAGE.TRIPS);
      if (!raw) return;
      const stored: Trip[] = JSON.parse(raw);
      let changed = false;
      const cleaned = stored.map(t => {
        if (t.info || t.documents || t.organizer) {
          changed = true;
          const c = { ...t };
          delete (c as Record<string, unknown>).info;
          delete (c as Record<string, unknown>).documents;
          delete (c as Record<string, unknown>).organizer;
          return c;
        }
        return t;
      });
      if (changed) {
        localStorage.setItem(STORAGE.TRIPS, JSON.stringify(cleaned));
        logger.log("TripsProvider", "cleaned stale structured data from localStorage");
      }
    } catch { /* ignore */ }
  }, [useCloud, cloud.ready]);

  // Side-effect hooks (extracted)
  useCloudSync(useCloud, isLocalOnly, cloud.ready, cloud.trips, local.trips, cloud.setTrips, orgId);
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
    // Track deletion so useMergedTrips never re-adds from stale localStorage
    setDeletedIds(prev => new Set(prev).add(id));
    setTrips(prev => prev.filter(t => t.id !== id));
    if (useCloud) {
      flushLocal(prev => prev.filter(t => t.id !== id));
      if (!DEMO_IDS.has(id)) {
        removeTrip(id).catch(err => {
          logger.error("deleteTrip", "cloud removal failed:", err);
        });
      }
    }
    // Scrub from localStorage directly and notify useLocalStorage to re-sync
    try {
      const raw = localStorage.getItem(STORAGE.TRIPS);
      if (raw) {
        const stored: Trip[] = JSON.parse(raw);
        const cleaned = stored.filter(t => t.id !== id);
        if (cleaned.length !== stored.length) {
          localStorage.setItem(STORAGE.TRIPS, JSON.stringify(cleaned));
          notifyLocalStorage(STORAGE.TRIPS);
        }
      }
    } catch { /* ignore */ }
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
