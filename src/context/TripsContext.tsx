import { createContext, useContext, useCallback, useMemo, useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Trip, TravelEvent, User } from "@/types";
import { useLocalStorage, notifyLocalStorage } from "@/hooks/useLocalStorage";
import { INITIAL_TRIPS } from "@/data/trips";
import { isFirebaseConfigured } from "@/services/firebase";
import { fetchTrips, upsertTrip, removeTrip, subscribeToTrips, backfillOrgId } from "@/services/firebaseTrips";
import { deriveAttendeesString } from "@/lib/travelerSync";
import { describeTripChange, withHistory } from "@/lib/tripHistory";
import { useOrg } from "@/context/OrgContext";
import { useDirectoryTravelers } from "@/context/directory";
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
  saveTrip: (id: string, updates: Partial<Trip>, before?: Trip, opts?: { allowClearInfo?: boolean }) => Promise<void>;
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
  saveTrip: async () => {},
  addEvent: () => {},
  updateEvent: () => {},
  deleteEvent: () => {},
});

// ── Data source hooks ─────────────────────────────────────────────────────────

function useCloudTrips(uid: string | null, orgId?: string | null, seeAll = true) {
  const qc = useQueryClient();
  const recentLocalEdits = useRef<Set<string>>(new Set());
  const pendingDeletes = useRef<Set<string>>(new Set());
  const queryKey = ["trips", orgId || uid];

  // The live listener below fills this query; a separate fetch would download every trip twice
  const { data: trips = [], isSuccess } = useQuery<Trip[]>({
    queryKey,
    queryFn: () => fetchTrips(orgId, { seeAll }),
    staleTime: Infinity,
    enabled: false,
  });

  useEffect(() => {
    if (!uid) return;
    const unsub = subscribeToTrips((updated, fromCache) => {
      // An empty offline copy only means nothing is cached yet; wait for the server unless we're offline
      if (fromCache && updated.length === 0 && navigator.onLine) return;
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
    }, orgId, () => {
      fetchTrips(orgId, { seeAll })
        .then(list => qc.setQueryData<Trip[]>(queryKey, list))
        .catch(err => logger.error("TripsProvider", "trips fallback fetch failed:", err));
    }, { seeAll });
    return () => unsub();
  }, [qc, uid, orgId, seeAll]);

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
    syncToCloud(prev, next, orgId, () => {
      recentLocalEdits.current.clear();
      fetchTrips(orgId, { seeAll }).then(list => qc.setQueryData<Trip[]>(queryKey, list)).catch(() => {});
    },
      // The stored trip carries uploaded photo addresses; keep it unless the trip was edited again meanwhile
      (saved, sent) => qc.setQueryData<Trip[]>(queryKey, list => list?.map(t => (t.id === saved.id && JSON.stringify(t) === JSON.stringify(sent) ? saved : t))));
  }, [qc, uid, orgId, seeAll]);

  return { trips, setTrips, ready: isSuccess };
}

/** Demo/seed trip IDs - never push to cloud */
const DEMO_IDS = new Set(INITIAL_TRIPS.map(t => t.id));

function syncToCloud(prev: Trip[], next: Trip[], orgId?: string | null, onFailure?: () => void, onSaved?: (saved: Trip, sent: Trip) => void) {
  const prevIds = new Set(prev.map(t => t.id));
  const nextIds = new Set(next.map(t => t.id));

  for (const trip of next) {
    if (DEMO_IDS.has(trip.id)) continue; // never push demo data
    const old = prev.find(t => t.id === trip.id);
    if (!old || JSON.stringify(old) !== JSON.stringify(trip)) {
      logger.log("syncToCloud", "upserting trip:", trip.id, trip.name, "events:", trip.events.length);
      upsertTrip(trip, orgId, old).then((cleaned) => {
        onSaved?.(cleaned, trip);
        // Write download URLs back to localStorage so images survive refresh
        if (JSON.stringify(cleaned) !== JSON.stringify(trip)) {
          try {
            const stored: Trip[] = JSON.parse(localStorage.getItem(STORAGE.TRIPS) || "[]");
            const idx = stored.findIndex(t => t.id === cleaned.id);
            if (idx >= 0) { stored[idx] = { ...stored[idx], image: cleaned.image, events: cleaned.events, info: cleaned.info, documents: cleaned.documents, travelers: cleaned.travelers, travelerIds: cleaned.travelerIds, organizer: cleaned.organizer, attendees: cleaned.attendees }; }
            else { stored.push(cleaned); }
            localStorage.setItem(STORAGE.TRIPS, JSON.stringify(stored));
            notifyLocalStorage(STORAGE.TRIPS);
            logger.log("syncToCloud", "wrote download URLs back to localStorage for", cleaned.id);
          } catch { /* quota exceeded - cloud has the URLs, will load on next fetch */ }
        }
      }).catch(err => {
        console.error("[syncToCloud] upsert failed:", err);
        toast.error(`Sync failed: ${err?.message || err}`);
        onFailure?.();
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
  // Only use demo data as default for demo users - real users start with []
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

  // Structured fields (info, travelers, organizer) live in Firestore - never
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

    // Merge cloud trips with local media/metadata
    const merged = cloudTrips.map(t => {
      const lt = localMap.get(t.id);
      return lt ? mergeLocalMedia(t, lt) : t;
    });

    // Cloud is the source of truth - don't recover local-only trips as they
    // are either stale leftovers or ghost trips from incomplete deletions.

    return merged;
  }, [useCloud, cloudTrips, localTrips, isLocalOnly, deletedIds]);
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function TripsProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const firebaseOn = isFirebaseConfigured();
  const { user, isLoading: authLoading, impersonation } = useAuth();
  const isDemoUser = authLoading ? false : (!user || user.id === "demo" || (user.id?.length ?? 0) <= 20);
  const useCloud = firebaseOn && !isDemoUser;
  const local = useLocalTrips(isDemoUser && !authLoading);
  const { currentOrg, orgRole, isLoading: orgLoading } = useOrg();
  const orgId = currentOrg?.id ?? null;
  // Private trips are seen only by their creator, so in a team everyone asks for shared trips plus their own
  const seeAllTrips = !orgId;
  // Don't fire cloud queries while org is still loading - avoids a user_id-only
  // query that returns incomplete results, then a second org-scoped query that
  // briefly flashes empty while it resolves.
  const cloudUid = useCloud && !orgLoading ? (user?.id ?? null) : null;
  const cloud = useCloudTrips(cloudUid, orgId, seeAllTrips);
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
  }, [useCloud, orgId, cloud.ready, orgRole]);

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
  useCloudSync(useCloud, cloud.ready, cloud.trips, local.trips, cloud.setTrips, orgId);
  const [, setDirectoryTravelers] = useDirectoryTravelers();
  const addDirectoryTravelers = useCallback(
    (added: User[]) => setDirectoryTravelers(prev => [...prev, ...added.filter(a => !prev.some(p => p.id === a.id))]),
    [setDirectoryTravelers],
  );
  useTravelerMigration(trips, ready, setTrips, useCloud, local.setTrips, addDirectoryTravelers);

  // Flush updater to localStorage synchronously
  const flushLocal = useCallback((updater: (prev: Trip[]) => Trip[]) => {
    local.setTrips(updater);
    try {
      const prev: Trip[] = JSON.parse(localStorage.getItem(STORAGE.TRIPS) || "[]");
      localStorage.setItem(STORAGE.TRIPS, JSON.stringify(updater(prev)));
    } catch { /* ignore */ }
  }, [local]);

  // ── CRUD operations ────────────────────────────────────────────────────────

  // Every change is signed with the editor's name on the trip's history, and who was signed in as them
  const editor = impersonation ? `${impersonation.byName || "Someone"} as ${user?.name || "a teammate"}` : user?.name || "Someone";

  const addTrip = useCallback((trip: Trip) => {
    const withOrg = currentOrg ? { ...trip, organizationId: trip.organizationId ?? currentOrg.id } : trip;
    const tripWithOrg = withHistory(withOrg, "Created the trip", editor);
    setTrips(prev => [tripWithOrg, ...prev]);
    if (useCloud) flushLocal(prev => [tripWithOrg, ...prev]);
  }, [setTrips, useCloud, flushLocal, currentOrg, editor]);

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
      return withHistory(merged, describeTripChange(t, updates), editor);
    });
    setTrips(updater);
    if (useCloud) flushLocal(updater);
  }, [setTrips, useCloud, flushLocal, editor]);

  const saveTrip = useCallback(async (id: string, updates: Partial<Trip>, before?: Trip, opts?: { allowClearInfo?: boolean }) => {
    const original = before || trips.find(t => t.id === id);
    if (!original) throw new Error('Trip no longer available');
    if (!useCloud) { updateTrip(id, updates); return; }
    const next = withHistory({ ...original, ...updates }, describeTripChange(original, updates), editor);
    const saved = await upsertTrip(next, orgId, original, opts);
    qc.setQueryData<Trip[]>(['trips', orgId || user?.id], prev => prev?.map(trip => trip.id === id ? saved : trip));
    flushLocal(prev => prev.map(trip => trip.id === id ? saved : trip));
  }, [trips, useCloud, updateTrip, editor, orgId, qc, user?.id, flushLocal]);

  const addEvent = useCallback((tripId: string, event: TravelEvent) => {
    const updater = (prev: Trip[]) => prev.map(t => {
      if (t.id !== tripId) return t;
      return withHistory({ ...t, events: [...t.events, event] }, `Added ${event.title}`, editor);
    });
    setTrips(updater);
    if (useCloud) flushLocal(updater);
  }, [setTrips, useCloud, flushLocal, editor]);

  const updateEvent = useCallback((tripId: string, event: TravelEvent) => {
    const updater = (prev: Trip[]) => prev.map(t => {
      if (t.id !== tripId) return t;
      const exists = t.events.some(e => e.id === event.id);
      const newEvents = exists
        ? t.events.map(e => e.id === event.id ? event : e)
        : [...t.events, event];
      return withHistory({ ...t, events: newEvents }, describeTripChange(t, { events: newEvents }), editor);
    });
    setTrips(updater);
    if (useCloud) flushLocal(updater);
  }, [setTrips, useCloud, flushLocal, editor]);

  const deleteEvent = useCallback((tripId: string, eventId: string) => {
    const updater = (prev: Trip[]) => prev.map(t => {
      if (t.id !== tripId) return t;
      const gone = t.events.find(e => e.id === eventId);
      return withHistory({ ...t, events: t.events.filter(e => e.id !== eventId) }, gone ? `Removed ${gone.title}` : null, editor);
    });
    setTrips(updater);
    if (useCloud) flushLocal(updater);
  }, [setTrips, useCloud, flushLocal, editor]);

  const value = useMemo(
    () => ({ trips, ready, setTrips, addTrip, deleteTrip, updateTrip, saveTrip, addEvent, updateEvent, deleteEvent }),
    [trips, ready, setTrips, addTrip, deleteTrip, updateTrip, saveTrip, addEvent, updateEvent, deleteEvent],
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
