import { useEffect, useState, useRef, useCallback } from "react";
import { doc, setDoc, deleteDoc, onSnapshot, query, collection, where } from "firebase/firestore";
import { firebaseDb, isFirebaseConfigured } from "@/services/firebase";
import { waitForAuth } from "@/services/firebaseTrips";
import { useAuth } from "@/context/AuthContext";

export interface PresenceUser {
  userId: string;
  name: string;
  initials: string;
  avatar: string;
  activeDay: string | null;
  activeEventId: string | null;
  lastSeen: number;
}

const HEARTBEAT_MS = 30_000;
const STALE_MS = 90_000;

export function usePresence(tripId: string | undefined) {
  const { user } = useAuth();
  const [others, setOthers] = useState<PresenceUser[]>([]);
  const docIdRef = useRef<string | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const writePresence = useCallback(
    async (extra?: { activeDay?: string; activeEventId?: string | null }) => {
      if (!tripId || !user || !isFirebaseConfigured()) return;
      const id = `${user.id}_${tripId}`;
      docIdRef.current = id;
      await setDoc(doc(firebaseDb(), "trip_presence", id), {
        user_id: user.id,
        trip_id: tripId,
        name: user.name || "",
        initials: user.initials || "",
        avatar: user.avatar || "",
        active_day: extra?.activeDay ?? null,
        active_event_id: extra?.activeEventId ?? null,
        last_seen: Date.now(),
      }).catch(() => {});
    },
    [tripId, user],
  );

  const clearPresence = useCallback(async () => {
    if (!docIdRef.current) return;
    await deleteDoc(doc(firebaseDb(), "trip_presence", docIdRef.current)).catch(() => {});
    docIdRef.current = null;
  }, []);

  useEffect(() => {
    if (!tripId || !user || !isFirebaseConfigured()) return;

    let cancelled = false;
    let unsub: (() => void) | null = null;

    const handleUnload = () => {
      if (docIdRef.current) {
        navigator.sendBeacon?.("/api/noop", "");
        deleteDoc(doc(firebaseDb(), "trip_presence", docIdRef.current)).catch(() => {});
      }
    };

    waitForAuth().then((uid) => {
      if (cancelled || !uid) return;

      writePresence();
      heartbeatRef.current = setInterval(() => writePresence(), HEARTBEAT_MS);
      window.addEventListener("beforeunload", handleUnload);

      const q = query(collection(firebaseDb(), "trip_presence"), where("trip_id", "==", tripId));
      unsub = onSnapshot(q, (snap) => {
        const now = Date.now();
        const peers: PresenceUser[] = [];
        snap.forEach((d) => {
          const data = d.data();
          if (data.user_id === user.id) return;
          if (now - (data.last_seen || 0) > STALE_MS) return;
          peers.push({
            userId: data.user_id,
            name: data.name || "",
            initials: data.initials || data.user_id.slice(0, 2).toUpperCase(),
            avatar: data.avatar || "",
            activeDay: data.active_day || null,
            activeEventId: data.active_event_id || null,
            lastSeen: data.last_seen || 0,
          });
        });
        setOthers(peers);
      });
    });

    return () => {
      cancelled = true;
      unsub?.();
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      window.removeEventListener("beforeunload", handleUnload);
      clearPresence();
    };
  }, [tripId, user?.id]);

  const updateActivity = useCallback(
    (activeDay: string, activeEventId?: string | null) => {
      writePresence({ activeDay, activeEventId });
    },
    [writePresence],
  );

  return { others, updateActivity };
}
