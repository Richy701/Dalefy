import { createContext, useContext, useState, useCallback, useEffect, useMemo, type ReactNode } from "react";
import type { Notification } from "@/types";

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  toast: { message: string; type: "success" | "error" } | null;
  addNotification: (n: Omit<Notification, "id" | "read">) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  showToast: (message: string, type?: "success" | "error") => void;
}

const NotificationContext = createContext<NotificationContextType>({
  notifications: [],
  unreadCount: 0,
  toast: null,
  addNotification: () => {},
  markRead: () => {},
  markAllRead: () => {},
  showToast: () => {},
});

const INITIAL_NOTIFICATIONS: Notification[] = [
  { id: "n1", message: "Trip created", detail: "Kenya Luxury Safari has been created", time: "2 hours ago", read: false, type: "success" },
  { id: "n2", message: "Itinerary published", detail: "Maldives Retreat is now live", time: "5 hours ago", read: false, type: "success" },
  { id: "n3", message: "Flight update", detail: "QR28 to Doha is on time", time: "1 day ago", read: true, type: "info" },
  { id: "n4", message: "Team invited", detail: "EU Sales Team added to Amalfi Coast Tour", time: "2 days ago", read: true, type: "info" },
  { id: "n5", message: "New trip draft", detail: "Japan Discovery saved as draft", time: "3 days ago", read: true, type: "info" },
];

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>(INITIAL_NOTIFICATIONS);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const unreadCount = notifications.filter(n => !n.read).length;

  const addNotification = useCallback((n: Omit<Notification, "id" | "read">) => {
    setNotifications(prev => [{ ...n, id: Date.now().toString(), read: false }, ...prev]);
  }, []);

  const markRead = useCallback((id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  const showToast = useCallback((message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const value = useMemo(
    () => ({ notifications, unreadCount, toast, addNotification, markRead, markAllRead, showToast }),
    [notifications, unreadCount, toast, addNotification, markRead, markAllRead, showToast]
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
