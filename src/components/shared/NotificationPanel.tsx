import { useState } from "react";
import { Bell, Check, X, Trash } from "@phosphor-icons/react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNotifications } from "@/context/NotificationContext";
import type { Notification } from "@/types";

const TYPE_CONFIG: Record<Notification["type"], { bar: string }> = {
  info: { bar: "bg-blue-400" },
  success: { bar: "bg-brand" },
  warning: { bar: "bg-amber-400" },
};

function relativeTime(n: { time: string; createdAt?: number }): string {
  if (!n.createdAt) return n.time;
  const mins = Math.floor((Date.now() - n.createdAt) / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "Yesterday" : `${days}d ago`;
}

function NotificationList({ onClose }: { onClose?: () => void }) {
  const { notifications, unreadCount, markRead, markAllRead, clearAll } = useNotifications();

  return (
    <>
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center gap-3">
        <div className="h-7 w-7 rounded-lg bg-brand/10 flex items-center justify-center shrink-0">
          <Bell className="h-3.5 w-3.5 text-brand" />
        </div>
        <div className="flex-1 min-w-0 flex items-baseline gap-2">
          <p className="text-[11px] font-black uppercase tracking-[0.15em] text-foreground leading-none truncate">Notifications</p>
          {unreadCount > 0 && (
            <span className="shrink-0 inline-flex items-center h-4 px-1.5 rounded-md bg-brand/10 text-brand text-[9px] font-black tabular-nums leading-none">
              {unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              aria-label="Mark all as read"
              title="Mark all as read"
              className="h-8 w-8 rounded-lg flex items-center justify-center text-brand hover:bg-brand/10 transition-colors"
            >
              <Check className="h-4 w-4" weight="bold" />
            </button>
          )}
          {notifications.length > 0 && (
            <button
              onClick={clearAll}
              aria-label="Clear all notifications"
              title="Clear all"
              className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <Trash className="h-4 w-4" />
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              aria-label="Close"
              className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:hover:text-foreground hover:bg-secondary transition-colors sm:hidden"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <ScrollArea className="sm:max-h-80 max-sm:flex-1 max-sm:overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4">
            <div className="h-10 w-10 rounded-xl bg-secondary flex items-center justify-center mb-3">
              <Bell className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground">All clear</p>
            <p className="text-[10px] font-bold text-muted-foreground mt-1">No notifications yet</p>
          </div>
        ) : (
          <div className="p-1.5 space-y-0.5">
            {notifications.map((n) => {
              const config = TYPE_CONFIG[n.type] || TYPE_CONFIG.info;
              return (
                <button
                  key={n.id}
                  onClick={() => markRead(n.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-all ${
                    n.read
                      ? "hover:bg-secondary opacity-50"
                      : "bg-brand/3 dark:bg-brand/4 hover:bg-brand/6 dark:hover:bg-brand/8"
                  }`}
                >
                  <div className="flex items-stretch gap-3">
                    <span className={`w-0.5 self-stretch rounded-full shrink-0 ${config.bar} ${n.read ? "opacity-40" : ""}`} aria-hidden="true" />
                    <div className="flex-1 min-w-0 self-center">
                      <div className="flex items-center gap-1.5">
                        <p className={`text-[11px] font-bold leading-tight truncate ${n.read ? "text-muted-foreground" : "text-foreground"}`}>
                          {n.message}
                        </p>
                        {!n.read && <span className="h-1.5 w-1.5 rounded-full bg-brand shrink-0" />}
                      </div>
                      <p className="text-[10px] text-muted-foreground truncate leading-tight">{n.detail}</p>
                    </div>
                    <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground shrink-0 self-center">{relativeTime(n)}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </>
  );
}

export function NotificationPanel() {
  const { unreadCount } = useNotifications();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Desktop: Popover */}
      <Popover>
        <PopoverTrigger className="hidden sm:flex h-10 w-10 rounded-xl bg-card hover:bg-secondary text-muted-foreground hover:text-brand relative border border-border shadow-sm items-center justify-center transition-colors">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 bg-brand text-black text-[9px] font-black rounded-full flex items-center justify-center ring-2 ring-white dark:ring-[#111111]">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </PopoverTrigger>
        <PopoverContent className="w-88 p-0 bg-card border border-border rounded-xl shadow-2xl" align="end">
          <NotificationList />
        </PopoverContent>
      </Popover>

      {/* Mobile: trigger button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="sm:hidden h-10 w-10 rounded-xl bg-card hover:bg-secondary text-muted-foreground hover:text-brand relative border border-border shadow-sm flex items-center justify-center transition-colors"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 bg-brand text-black text-[9px] font-black rounded-full flex items-center justify-center ring-2 ring-white dark:ring-[#111111]">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Mobile: full-screen overlay */}
      {mobileOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Notifications"
          tabIndex={-1}
          ref={el => { if (el && !el.contains(document.activeElement)) el.focus(); }}
          onKeyDown={e => { if (e.key === "Escape") setMobileOpen(false); }}
          className="fixed inset-0 z-50 sm:hidden flex flex-col bg-card focus:outline-none"
        >
          <NotificationList onClose={() => setMobileOpen(false)} />
        </div>
      )}
    </>
  );
}
