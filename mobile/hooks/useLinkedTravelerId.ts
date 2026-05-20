import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { firebaseDb, firebaseAuth, isFirebaseConfigured } from "@/services/firebase";
import { getDeviceId } from "@/services/deviceId";

export function useLinkedTravelerId(tripId: string | undefined): string | null {
  const [linkedId, setLinkedId] = useState<string | null>(null);

  useEffect(() => {
    if (!tripId || !isFirebaseConfigured()) return;

    let unsub: (() => void) | undefined;

    const setup = async () => {
      const uid = firebaseAuth().currentUser?.uid;
      const deviceId = await getDeviceId();

      // Prefer UID-keyed doc, fall back to device-keyed
      const memberId = uid ? `${uid}_${tripId}` : `${deviceId}_${tripId}`;

      unsub = onSnapshot(
        doc(firebaseDb(), "trip_members", memberId),
        (snap) => {
          if (snap.exists()) {
            setLinkedId(snap.data().linked_traveler_id ?? null);
          } else if (uid) {
            // Try device-keyed fallback for pre-auth members
            const fallbackId = `${deviceId}_${tripId}`;
            const fallbackUnsub = onSnapshot(
              doc(firebaseDb(), "trip_members", fallbackId),
              (fallSnap) => {
                setLinkedId(fallSnap.exists() ? fallSnap.data().linked_traveler_id ?? null : null);
              },
              () => setLinkedId(null),
            );
            unsub = fallbackUnsub;
          } else {
            setLinkedId(null);
          }
        },
        () => setLinkedId(null),
      );
    };

    setup();
    return () => unsub?.();
  }, [tripId]);

  return linkedId;
}
