import { createContext, useContext, useCallback, useMemo, useEffect, useState, useRef, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Trip, TravelEvent } from "@/types";
import { useLocalStorage, notifyLocalStorage } from "@/hooks/useLocalStorage";
import { INITIAL_TRIPS } from "@/data/trips";
import { isSupabaseConfigured, supabase } from "@/services/supabase";
import { fetchTrips, subscribeToTrips, upsertTrip, removeTrip } from "@/services/supabaseTrips";
import { deriveAttendeesString, matchOrCreateTravelers, extractNamesFromAttendeesString } from "@/lib/travelerSync";
import type { User } from "@/types";
import { useOrg } from "@/context/OrgContext";
import { useAuth } from "@/context/AuthContext";

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

function useSupabaseTrips() {
  const qc = useQueryClient();

  // Initial fetch via React Query — cached, retried, deduplicated
  const { data: trips = [], isSuccess } = useQuery<Trip[]>({
    queryKey: ["trips"],
    queryFn: fetchTrips,
    staleTime: 1000 * 60 * 5,
    retry: 2,
  });

  // Realtime subscription updates the query cache
  useEffect(() => {
    const channel = supabase
      .channel("trips-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "trips" }, () => {
        qc.invalidateQueries({ queryKey: ["trips"] });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  const setTrips: React.Dispatch<React.SetStateAction<Trip[]>> = useCallback((action) => {
    const prev = qc.getQueryData<Trip[]>(["trips"]) ?? [];
    const next = typeof action === "function" ? action(prev) : action;
    // Optimistic update
    qc.setQueryData<Trip[]>(["trips"], next);
    syncToSupabase(prev, next);
  }, [qc]);

  return { trips, setTrips, ready: isSuccess };
}

function syncToSupabase(prev: Trip[], next: Trip[]) {
  const prevIds = new Set(prev.map((t) => t.id));
  const nextIds = new Set(next.map((t) => t.id));

  for (const trip of next) {
    const old = prev.find((t) => t.id === trip.id);
    if (!old || JSON.stringify(old) !== JSON.stringify(trip)) {
      console.log("[syncToSupabase] upserting trip:", trip.id, trip.name, "events:", trip.events.length);
      upsertTrip(trip).catch(err => console.error("[syncToSupabase] upsert failed:", err));
    }
  }

  for (const id of prevIds) {
    if (!nextIds.has(id)) {
      console.log("[syncToSupabase] removing trip:", id);
      removeTrip(id).catch(err => console.error("[syncToSupabase] remove failed:", err));
    }
  }
}

function useLocalTrips() {
  const [trips, setTrips] = useLocalStorage<Trip[]>("daf-adventures-v4", INITIAL_TRIPS);
  return { trips, setTrips, ready: true };
}

export function TripsProvider({ children }: { children: ReactNode }) {
  const useCloud = isSupabaseConfigured();
  const local = useLocalTrips();
  const cloud = useSupabaseTrips();
  const { currentOrg } = useOrg();
  const { user } = useAuth();
  // Only merge localStorage trips for demo/local users — real auth users get clean cloud data
  const isDemoUser = !user || user.id === "demo" || (user.id?.length ?? 0) <= 20;

  const { setTrips } = useCloud ? cloud : local;
  const ready = useCloud ? cloud.ready : local.ready;

  // Merge: when cloud trips are missing traveler data, fill from localStorage copy
  // Merge cloud + local: Supabase may lack columns for travelerIds, travelers, info,
  // organizer. We use localStorage as the source of truth for those fields, and also
  // include local-only trips that haven't been synced to cloud yet.
  const trips = useMemo(() => {
    if (!useCloud) return local.trips;

    // Real auth users: only show cloud trips — no localStorage merge
    if (!isDemoUser) return cloud.trips;

    // Demo/local users: merge localStorage with cloud
    let localTrips: Trip[] = local.trips;
    try {
      const stored = localStorage.getItem("daf-adventures-v4");
      if (stored) localTrips = JSON.parse(stored);
    } catch { /* use React state fallback */ }

    const localMap = new Map(localTrips.map(t => [t.id, t]));
    const cloudIds = new Set(cloud.trips.map(t => t.id));

    // Patch cloud trips with local-only fields
    const merged = cloud.trips.map(t => {
      const lt = localMap.get(t.id);
      if (!lt) return t;
      const patch: Partial<Trip> = {};
      if (!t.travelerIds?.length && lt.travelerIds?.length) patch.travelerIds = lt.travelerIds;
      if (!t.travelers?.length && lt.travelers?.length) patch.travelers = lt.travelers;
      if ((!t.attendees || t.attendees === "Imported Group") && lt.attendees) patch.attendees = lt.attendees;
      if (!t.info?.length && lt.info?.length) patch.info = lt.info;
      if (!t.organizer && lt.organizer) patch.organizer = lt.organizer;
      return Object.keys(patch).length > 0 ? { ...t, ...patch } : t;
    });

    // Include local-only trips not yet in cloud
    for (const lt of localTrips) {
      if (!cloudIds.has(lt.id)) merged.push(lt);
    }

    return merged;
  }, [useCloud, cloud.trips, local.trips, isDemoUser]);

  // Seed / recover Supabase from localStorage (demo users only — real auth users start clean)
  const seeded = useRef(false);
  useEffect(() => {
    if (!useCloud || !cloud.ready || seeded.current || !isDemoUser) return;
    seeded.current = true;

    console.log("[TripsContext] seed check — cloud:", cloud.trips.length, "local:", local.trips.length);

    // Full seed when Supabase is empty
    if (cloud.trips.length === 0 && local.trips.length > 0) {
      console.log("[TripsContext] seeding Supabase from localStorage:", local.trips.map(t => t.name));
      Promise.all(local.trips.map(upsertTrip))
        .then(() => {
          console.log("[TripsContext] seed complete");
          subscribeToTrips((incoming) => {
            if (incoming.length > 0) cloud.setTrips(incoming);
          });
        })
        .catch(err => console.error("[TripsContext] seed failed:", err));
      return;
    }

    // Recover: if localStorage has more events for a trip, push it back
    const toRecover: Trip[] = [];
    for (const lt of local.trips) {
      const ct = cloud.trips.find((t) => t.id === lt.id);
      if (ct && lt.events.length > ct.events.length) {
        console.log("[TripsContext] recovering trip from localStorage:", lt.name, `(${lt.events.length} vs ${ct.events.length} events)`);
        toRecover.push(lt);
      }
    }
    if (toRecover.length > 0) {
      Promise.all(toRecover.map(upsertTrip)).then(() => {
        console.log("[TripsContext] recovery complete, refreshing...");
        subscribeToTrips((incoming) => {
          if (incoming.length > 0) cloud.setTrips(incoming);
        });
      });
    }
  }, [useCloud, cloud.ready, cloud.trips.length, local.trips, isDemoUser]);

  // Cleanup: dedup daf-custom-travelers by ID
  useEffect(() => {
    const raw = localStorage.getItem("daf-custom-travelers");
    if (!raw) return;
    try {
      const arr: User[] = JSON.parse(raw);
      const seen = new Set<string>();
      const deduped = arr.filter(u => {
        if (seen.has(u.id)) return false;
        seen.add(u.id);
        return true;
      });
      if (deduped.length < arr.length) {
        localStorage.setItem("daf-custom-travelers", JSON.stringify(deduped));
        notifyLocalStorage("daf-custom-travelers");
      }
    } catch { /* ignore */ }
  }, []);

  // One-time migration: backfill travelerIds for existing trips that only have attendees string
  const migrated = useRef(false);
  useEffect(() => {
    if (!ready || migrated.current) return;
    if (trips.length === 0) return;
    migrated.current = true;

    // v2: nuke corrupted data from previous migration runs, then migrate cleanly once
    if (localStorage.getItem("daf-travelers-migrated") === "2") return;
    // Wipe any stale/duplicate travelers from broken earlier migrations
    localStorage.removeItem("daf-custom-travelers");
    notifyLocalStorage("daf-custom-travelers");

    const needsMigration = trips.filter(t => !t.travelerIds?.length && t.attendees && t.attendees !== "Imported Group");
    if (needsMigration.length === 0) {
      localStorage.setItem("daf-travelers-migrated", "2");
      console.log("[TripsContext] no trips need traveler migration");
      return;
    }

    const stored: User[] = [];
    let allExisting: User[] = [];
    const allNewTravelers: User[] = [];
    const migrationMap = new Map<string, { travelerIds: string[]; travelers: NonNullable<Trip["travelers"]>; attendees: string; paxCount: string }>();

    for (const t of needsMigration) {
      const names = extractNamesFromAttendeesString(t.attendees);
      if (names.length === 0) continue;
      const result = matchOrCreateTravelers(names, allExisting);
      allExisting = [...allExisting, ...result.newTravelers];
      allNewTravelers.push(...result.newTravelers);
      migrationMap.set(t.id, {
        travelerIds: result.travelerIds,
        travelers: result.travelers,
        attendees: result.attendees,
        paxCount: String(result.travelerIds.length),
      });
    }

    if (migrationMap.size === 0) {
      localStorage.setItem("daf-travelers-migrated", "2");
      return;
    }

    // Persist new travelers first so TravelersPage can read them
    if (allNewTravelers.length > 0) {
      localStorage.setItem("daf-custom-travelers", JSON.stringify([...stored, ...allNewTravelers]));
      notifyLocalStorage("daf-custom-travelers");
      console.log(`[TripsContext] created ${allNewTravelers.length} new traveler(s)`);
    }

    // Update trips
    const updater = (prev: Trip[]) => prev.map(t => {
      const patch = migrationMap.get(t.id);
      return patch ? { ...t, ...patch } : t;
    });
    setTrips(updater);
    if (useCloud) local.setTrips(updater);

    localStorage.setItem("daf-travelers-migrated", "2");
    console.log(`[TripsContext] migrated ${migrationMap.size} trip(s) — linked travelers`);
  }, [ready, trips]);

  // Flush updater to localStorage synchronously so the merge useMemo always
  // sees the latest local data, even if useEffect hasn't run yet.
  const flushLocal = useCallback((updater: (prev: Trip[]) => Trip[]) => {
    local.setTrips(updater);
    try {
      const prev: Trip[] = JSON.parse(localStorage.getItem("daf-adventures-v4") || "[]");
      localStorage.setItem("daf-adventures-v4", JSON.stringify(updater(prev)));
    } catch { /* ignore */ }
  }, [local]);

  const addTrip = useCallback((trip: Trip) => {
    const tripWithOrg = currentOrg ? { ...trip, organizationId: trip.organizationId ?? currentOrg.id } : trip;
    setTrips(prev => [tripWithOrg, ...prev]);
    if (useCloud) flushLocal(prev => [tripWithOrg, ...prev]);
  }, [setTrips, useCloud, flushLocal, currentOrg]);

  const deleteTrip = useCallback((id: string) => {
    setTrips(prev => prev.filter(t => t.id !== id));
    if (useCloud) {
      flushLocal(prev => prev.filter(t => t.id !== id));
    }
  }, [setTrips, useCloud, flushLocal]);

  const updateTrip = useCallback((id: string, updates: Partial<Trip>) => {
    console.log("[updateTrip] id:", id, "info in updates:", updates.info?.length ?? "undefined", "keys:", Object.keys(updates).join(","));
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
    [trips, ready, setTrips, addTrip, deleteTrip, updateTrip, addEvent, updateEvent, deleteEvent]
  );

  // Don't render children until trips are hydrated — prevents empty-state flash
  if (!ready) return null;

  return (
    <TripsContext.Provider value={value}>
      {children}
    </TripsContext.Provider>
  );
}

export function useTrips() {
  return useContext(TripsContext);
}
