import { useEffect, useRef } from "react";
import type { Trip, User } from "@/types";
import { notifyLocalStorage } from "@/hooks/useLocalStorage";
import { STORAGE } from "@/config/storageKeys";
import { logger } from "@/lib/logger";
import {
  deriveAttendeesString,
  matchOrCreateTravelers,
  extractNamesFromAttendeesString,
} from "@/lib/travelerSync";

/**
 * Dedup custom travelers on mount, then backfill `travelerIds` for trips
 * that only have an `attendees` string (one-time migration).
 */
export function useTravelerMigration(
  trips: Trip[],
  ready: boolean,
  setTrips: React.Dispatch<React.SetStateAction<Trip[]>>,
  useCloud: boolean,
  localSetTrips?: React.Dispatch<React.SetStateAction<Trip[]>>,
) {
  // Cleanup: dedup custom-travelers by ID
  useEffect(() => {
    const raw = localStorage.getItem(STORAGE.CUSTOM_TRAVELERS);
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
        localStorage.setItem(STORAGE.CUSTOM_TRAVELERS, JSON.stringify(deduped));
        notifyLocalStorage(STORAGE.CUSTOM_TRAVELERS);
      }
    } catch { /* ignore */ }
  }, []);

  // One-time migration: backfill travelerIds for existing trips
  const migrated = useRef(false);
  useEffect(() => {
    if (!ready || migrated.current) return;
    if (trips.length === 0) return;
    migrated.current = true;

    if (localStorage.getItem(STORAGE.TRAVELERS_MIGRATED) === "2") return;
    localStorage.removeItem(STORAGE.CUSTOM_TRAVELERS);
    notifyLocalStorage(STORAGE.CUSTOM_TRAVELERS);

    const needsMigration = trips.filter(
      t => !t.travelerIds?.length && t.attendees && t.attendees !== "Imported Group",
    );
    if (needsMigration.length === 0) {
      localStorage.setItem(STORAGE.TRAVELERS_MIGRATED, "2");
      logger.log("TravelerMigration", "no trips need traveler migration");
      return;
    }

    const stored: User[] = [];
    let allExisting: User[] = [];
    const allNewTravelers: User[] = [];
    const migrationMap = new Map<
      string,
      { travelerIds: string[]; travelers: NonNullable<Trip["travelers"]>; attendees: string; paxCount: string }
    >();

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
      localStorage.setItem(STORAGE.TRAVELERS_MIGRATED, "2");
      return;
    }

    if (allNewTravelers.length > 0) {
      localStorage.setItem(STORAGE.CUSTOM_TRAVELERS, JSON.stringify([...stored, ...allNewTravelers]));
      notifyLocalStorage(STORAGE.CUSTOM_TRAVELERS);
      logger.log("TravelerMigration", `created ${allNewTravelers.length} new traveler(s)`);
    }

    const updater = (prev: Trip[]) =>
      prev.map(t => {
        const patch = migrationMap.get(t.id);
        return patch ? { ...t, ...patch } : t;
      });
    setTrips(updater);
    if (useCloud && localSetTrips) localSetTrips(updater);

    localStorage.setItem(STORAGE.TRAVELERS_MIGRATED, "2");
    logger.log("TravelerMigration", `migrated ${migrationMap.size} trip(s) — linked travelers`);
  }, [ready, trips]);
}
