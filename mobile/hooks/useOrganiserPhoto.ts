import { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { firebaseDb, firebaseAuth, isFirebaseConfigured, waitForAuth } from "@/services/firebase";
import { useTrips } from "@/context/TripsContext";

/**
 * The headshot an organiser attached to this traveller, from any trip their account is linked to.
 * When there is one it is their photo in the app and they can't change it; when there isn't, null.
 */
export function useOrganiserPhoto(): string | null {
  const { trips } = useTrips();
  const [links, setLinks] = useState<Array<{ tripId: string; travelerId: string }>>([]);

  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    let cancelled = false;
    // On a cold start sign-in may still be restoring, so wait for it before looking up the account's trips
    waitForAuth()
      .then(() => {
        const uid = firebaseAuth().currentUser?.uid;
        return uid ? getDocs(query(collection(firebaseDb(), "trip_members"), where("uid", "==", uid))) : null;
      })
      .then(snap => {
        if (!snap) return;
        if (cancelled) return;
        setLinks(snap.docs.flatMap(d => {
          const data = d.data();
          return typeof data.trip_id === "string" && typeof data.linked_traveler_id === "string" && data.linked_traveler_id
            ? [{ tripId: data.trip_id, travelerId: data.linked_traveler_id }] : [];
        }));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [trips.length]);

  for (const { tripId, travelerId } of links) {
    const avatar = trips.find(t => t.id === tripId)?.travelers?.find(t => t.id === travelerId)?.avatar;
    if (avatar && /^https:\/\//.test(avatar)) return avatar;
  }
  return null;
}
