import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { useAuth } from '@/context/AuthContext';
import { useTrips } from '@/context/TripsContext';
import { firebaseAuth, firebaseDb, isFirebaseConfigured } from '@/services/firebase';
import { surfaceEvents } from '@/shared/widgetSchedule';
import { getDeviceId } from '@/services/deviceId';

/** Only put shared or explicitly assigned itinerary entries on device surfaces. */
export function useSurfaceTrips() {
  const { trips, ready } = useTrips();
  const { user } = useAuth();
  const [linked, setLinked] = useState<Record<string, string | null>>({});
  const ids = trips.map(trip => trip.id).sort().join('|');
  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    let cancelled = false;
    const stops: Array<() => void> = [];
    setLinked({});
    void getDeviceId().then(deviceId => {
      if (cancelled) return;
      const uid = firebaseAuth().currentUser?.uid;
      for (const tripId of ids.split('|').filter(Boolean)) {
        let fallback: (() => void) | undefined;
        const save = (id: string | null) => { if (!cancelled) setLinked(prev => ({ ...prev, [tripId]: id })); };
        stops.push(onSnapshot(doc(firebaseDb(), 'trip_members', `${uid || deviceId}_${tripId}`), snap => {
          fallback?.(); fallback = undefined;
          if (snap.exists()) save(snap.data().linked_traveler_id ?? null);
          else if (uid) fallback = onSnapshot(doc(firebaseDb(), 'trip_members', `${deviceId}_${tripId}`), legacy => save(legacy.exists() ? legacy.data().linked_traveler_id ?? null : null), () => save(null));
          else save(null);
        }, () => save(null)));
        stops.push(() => fallback?.());
      }
    }).catch(() => {});
    return () => { cancelled = true; stops.forEach(stop => stop()); };
  }, [ids, user?.id]);
  const filtered = useMemo(() => trips.map(trip => ({ ...trip, events: surfaceEvents(trip.events, linked[trip.id]) })), [trips, linked]);
  return { trips: filtered, ready };
}
