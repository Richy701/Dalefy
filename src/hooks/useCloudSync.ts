import { useEffect, useRef } from "react";
import type { Trip } from "@/types";
import { INITIAL_TRIPS } from "@/data/trips";
import { upsertTrip, removeTrip } from "@/services/firebaseTrips";
import { logger } from "@/lib/logger";

/** IDs that belong to demo/seed data — never push these to cloud */
const DEMO_IDS = new Set(INITIAL_TRIPS.map(t => t.id));

/**
 * Seeds Firestore from localStorage the first time a real user signs in with an
 * empty cloud account (e.g. they built trips in demo/local mode, then signed
 * up). Demo/seed trips are always excluded. Seeding only runs when the cloud is
 * genuinely empty after the authoritative fetch, so it cannot resurrect trips
 * deleted on another device. The live subscription in useCloudTrips reflects the
 * seeded trips back into view, so no extra subscription is created here.
 */
export function useCloudSync(
  useCloud: boolean,
  cloudReady: boolean,
  cloudTrips: Trip[],
  localTrips: Trip[],
  setCloudTrips: React.Dispatch<React.SetStateAction<Trip[]>>,
  orgId?: string | null,
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

  // Seed cloud from localStorage when a real user's cloud is empty
  useEffect(() => {
    if (!useCloud || !cloudReady || seeded.current) return;
    seeded.current = true;

    const userTrips = localTrips.filter(t => !DEMO_IDS.has(t.id));
    logger.log("CloudSync", "seed check — cloud:", cloudTrips.length, "local:", userTrips.length);

    if (cloudTrips.length === 0 && userTrips.length > 0) {
      logger.log("CloudSync", "seeding cloud from localStorage:", userTrips.map(t => t.name));
      Promise.all(userTrips.map(t => upsertTrip(t, orgId)))
        .then(() => logger.log("CloudSync", "seed complete"))
        .catch(err => logger.error("CloudSync", "seed failed:", err));
    }
  }, [useCloud, cloudReady, cloudTrips.length, localTrips, orgId]);
}
