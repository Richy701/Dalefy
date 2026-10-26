import { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef, type ReactNode } from "react";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Notification } from "@/shared/types";
import { fetchInbox } from "@/services/firebaseTrips";

const STORAGE_KEY = "daf-notifications";
// Inbox messages the person deleted, so the next sync doesn't bring them back
const DISMISSED_KEY = "daf-notifications-dismissed";

/** Newest first; ids start with the time they were made */
const byNewest = (a: Notification, b: Notification) => (parseInt(b.id, 10) || 0) - (parseInt(a.id, 10) || 0);

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  /** Pass the push's log id so the same message from the inbox isn't added twice */
  addNotification: (n: Omit<Notification, "id" | "read"> & { id?: string }) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  removeNotification: (id: string) => void;
  /** keepInbox: the daily reset, which only clears what the app made itself */
  clearAll: (opts?: { keepInbox?: boolean }) => void;
  /** Pulls in anything sent while the app was closed */
  syncInbox: () => void;
}

const NotificationContext = createContext<NotificationContextType>({
  notifications: [],
  unreadCount: 0,
  addNotification: () => {},
  markRead: () => {},
  markAllRead: () => {},
  removeNotification: () => {},
  clearAll: () => {},
  syncInbox: () => {},
});

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loaded, setLoaded] = useState(false);
  const dismissed = useRef<Set<string>>(new Set());

  const forget = (ids: string[]) => {
    for (const id of ids) dismissed.current.add(id);
    AsyncStorage.setItem(DISMISSED_KEY, JSON.stringify([...dismissed.current].slice(-200))).catch(() => {});
  };

  useEffect(() => {
    AsyncStorage.getItem(DISMISSED_KEY).then(raw => {
      if (raw) dismissed.current = new Set(JSON.parse(raw));
    }).catch(() => {});
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      if (raw) {
        const parsed: Notification[] = JSON.parse(raw);
        // Deduplicate by id (legacy data may have timestamp-only collisions)
        const seen = new Set<string>();
        const deduped = parsed.filter(n => {
          if (seen.has(n.id)) return false;
          seen.add(n.id);
          return true;
        });
        setNotifications(deduped);
        if (deduped.length !== parsed.length) {
          AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(deduped)).catch(() => {});
        }
      }
    }).catch(() => {}).finally(() => setLoaded(true));
  }, []);

  const syncInbox = useCallback(() => {
    fetchInbox().then(inbox => {
      if (!inbox.length) return;
      setNotifications(prev => {
        const have = new Set(prev.map(n => n.id));
        const fresh = inbox.filter(n => !have.has(n.id) && !dismissed.current.has(n.id));
        if (!fresh.length) return prev;
        const next = [...fresh, ...prev].sort(byNewest).slice(0, 50);
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
    });
  }, []);

  // Once the saved list is in, and whenever the app comes back
  useEffect(() => {
    if (!loaded) return;
    syncInbox();
    const sub = AppState.addEventListener("change", state => { if (state === "active") syncInbox(); });
    return () => sub.remove();
  }, [loaded, syncInbox]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const addNotification = useCallback((n: Omit<Notification, "id" | "read"> & { id?: string }) => {
    setNotifications(prev => {
      if (n.id && prev.some(p => p.id === n.id)) return prev;
      const next = [{ ...n, id: n.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, read: false }, ...prev].slice(0, 50);
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const markRead = useCallback((id: string) => {
    setNotifications(prev => {
      const next = prev.map(n => n.id === id ? { ...n, read: true } : n);
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications(prev => {
      const next = prev.map(n => ({ ...n, read: true }));
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const removeNotification = useCallback((id: string) => {
    forget([id]);
    setNotifications(prev => {
      const next = prev.filter(n => n.id !== id);
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const clearAll = useCallback((opts?: { keepInbox?: boolean }) => {
    setNotifications(prev => {
      const next = opts?.keepInbox ? prev.filter(n => n.logged) : [];
      if (!opts?.keepInbox) forget(prev.map(n => n.id));
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ notifications, unreadCount, addNotification, markRead, markAllRead, removeNotification, clearAll, syncInbox }),
    [notifications, unreadCount, addNotification, markRead, markAllRead, removeNotification, clearAll, syncInbox]
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationContext);
}
