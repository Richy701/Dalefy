import { Bell, Check, CheckCircle2, Info, AlertTriangle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNotifications } from "@/context/NotificationContext";
import type { Notification } from "@/types";

const TYPE_CONFIG: Record<Notification["type"], { icon: typeof Info; color: string; bg: string }> = {
  info: { icon: Info, color: "text-blue-400", bg: "bg-blue-500/10" },
  success: { icon: CheckCircle2, color: "text-brand", bg: "bg-brand/10" },
  warning: { icon: AlertTriangle, color: "text-amber-400", bg: "bg-amber-500/10" },
};

export function NotificationPanel() {
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();

  return (
    <Popover>
      <PopoverTrigger className="h-10 w-10 rounded-xl bg-white dark:bg-[#111111] hover:bg-slate-50 dark:hover:bg-[#050505] text-slate-500 dark:text-[#888888] hover:text-brand relative border border-slate-200 dark:border-[#1f1f1f] shadow-sm flex items-center justify-center transition-colors">
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 bg-brand text-black text-[9px] font-black rounded-full flex items-center justify-center ring-2 ring-white dark:ring-[#111111]">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-[22rem] p-0 bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] rounded-2xl shadow-2xl" align="end">
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-100 dark:border-[#1f1f1f] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-brand/10 flex items-center justify-center">
              <Bell className="h-3.5 w-3.5 text-brand" />
            </div>
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.15em] text-slate-900 dark:text-white leading-none">Notifications</p>
              {unreadCount > 0 && (
                <p className="text-[9px] font-bold text-brand uppercase tracking-[0.2em] mt-0.5">{unreadCount} unread</p>
              )}
            </div>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="flex items-center gap-1 text-[9px] font-black uppercase tracking-[0.15em] text-brand hover:bg-brand/10 px-2.5 py-1.5 rounded-lg transition-colors"
            >
              <Check className="h-3 w-3" />
              Read all
            </button>
          )}
        </div>

        {/* List */}
        <ScrollArea className="max-h-80">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4">
              <div className="h-10 w-10 rounded-xl bg-slate-100 dark:bg-[#1a1a1a] flex items-center justify-center mb-3">
                <Bell className="h-4 w-4 text-slate-300 dark:text-[#444]" />
              </div>
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400 dark:text-[#555]">All clear</p>
              <p className="text-[10px] font-bold text-slate-300 dark:text-[#444] mt-1">No notifications yet</p>
            </div>
          ) : (
            <div className="p-1.5">
              {notifications.map((n) => {
                const config = TYPE_CONFIG[n.type] || TYPE_CONFIG.info;
                const Icon = config.icon;
                return (
                  <button
                    key={n.id}
                    onClick={() => markRead(n.id)}
                    className={`w-full text-left p-3 rounded-xl transition-all group ${
                      n.read
                        ? "hover:bg-slate-50 dark:hover:bg-[#0a0a0a] opacity-60"
                        : "bg-brand/[0.03] dark:bg-brand/[0.04] hover:bg-brand/[0.06] dark:hover:bg-brand/[0.08]"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`h-7 w-7 rounded-lg ${config.bg} flex items-center justify-center shrink-0 mt-0.5`}>
                        <Icon className={`h-3.5 w-3.5 ${config.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className={`text-[11px] font-bold leading-tight ${n.read ? "text-slate-600 dark:text-[#999]" : "text-slate-900 dark:text-white"}`}>
                            {n.message}
                          </p>
                          {!n.read && <span className="h-1.5 w-1.5 rounded-full bg-brand shrink-0" />}
                        </div>
                        <p className="text-[10px] text-slate-400 dark:text-[#666] truncate mt-1 leading-tight">{n.detail}</p>
                        <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-300 dark:text-[#444] mt-1.5">{n.time}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
