import { useEffect, useRef } from "react";
import type { Trip } from "@/types";
import { INITIAL_TRIPS } from "@/data/trips";
import { subscribeToTrips, upsertTrip, removeTrip } from "@/services/firebaseTrips";
import { logger } from "@/lib/logger";

/** IDs that belong to demo/seed data — never push these to cloud */
const DEMO_IDS = new Set(INITIAL_TRIPS.map(t => t.id));

/**
 * Seeds Firestore from localStorage when cloud is empty, or recovers trips
 * that have more events locally than in the cloud.
 * Demo/seed trips are always excluded from cloud sync.
 */
export function useCloudSync(
  useCloud: boolean,
  isLocalOnly: boolean,
  cloudReady: boolean,
  cloudTrips: Trip[],
  localTrips: Trip[],
  setCloudTrips: React.Dispatch<React.SetStateAction<Trip[]>>,
) {
  const seeded = useRef(false);
  const cleaned = useRef(false);

  // Clean demo trips from Firestore on real-user login
  useEffect(() => {
    if (!useCloud || !cloudReady || cleaned.current) return;
    cleaned.current = true;

    const demoInCloud = cloudTrips.filter(t => DEMO_IDS.has(t.id));
    if (demoInCloud.length > 0) {
      logger.log("CloudSync", "removing demo trips from cloud:", demoInCloud.map(t => t.id));
      Promise.all(demoInCloud.map(t => removeTrip(t.id)))
        .then(() => {
          // Update local state to remove them immediately
          setCloudTrips(prev => prev.filter(t => !DEMO_IDS.has(t.id)));
          logger.log("CloudSync", "demo cleanup complete");
        })
        .catch(err => logger.error("CloudSync", "demo cleanup failed:", err));
    }
  }, [useCloud, cloudReady, cloudTrips, setCloudTrips]);

  useEffect(() => {
    if (!useCloud || !cloudReady || seeded.current || !isLocalOnly) return;
    seeded.current = true;

    logger.log("CloudSync", "seed check — cloud:", cloudTrips.length, "local:", localTrips.length);

    // Full seed when cloud is empty — exclude demo trips
    const userTrips = localTrips.filter(t => !DEMO_IDS.has(t.id));
    if (cloudTrips.length === 0 && userTrips.length > 0) {
      logger.log("CloudSync", "seeding cloud from localStorage (excluding demo):", userTrips.map(t => t.name));
      Promise.all(userTrips.map(upsertTrip))
        .then(() => {
          logger.log("CloudSync", "seed complete");
          subscribeToTrips((incoming) => {
            if (incoming.length > 0) setCloudTrips(incoming);
          });
        })
        .catch(err => logger.error("CloudSync", "seed failed:", err));
      return;
    }

    // Recover: if localStorage has more events for a trip, push it back
    const toRecover: Trip[] = [];
    for (const lt of localTrips) {
      if (DEMO_IDS.has(lt.id)) continue; // skip demo trips
      const ct = cloudTrips.find(t => t.id === lt.id);
      if (ct && lt.events.length > ct.events.length) {
        logger.log("CloudSync", "recovering trip from localStorage:", lt.name, `(${lt.events.length} vs ${ct.events.length} events)`);
        toRecover.push(lt);
      }
    }
    if (toRecover.length > 0) {
      Promise.all(toRecover.map(upsertTrip)).then(() => {
        logger.log("CloudSync", "recovery complete, refreshing...");
        subscribeToTrips((incoming) => {
          if (incoming.length > 0) setCloudTrips(incoming);
        });
      });
    }
  }, [useCloud, cloudReady, cloudTrips.length, localTrips, isLocalOnly]);
}
