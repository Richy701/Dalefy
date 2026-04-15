import { Bell, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNotifications } from "@/context/NotificationContext";

export function NotificationPanel() {
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();

  return (
    <Popover>
      <PopoverTrigger className="h-11 w-11 rounded-full bg-white dark:bg-[#111111] hover:bg-slate-100 dark:hover:bg-[#1f1f1f] text-slate-500 dark:text-[#888888] hover:text-[#0bd2b5] relative border border-slate-200 dark:border-[#1f1f1f] shadow-sm flex items-center justify-center">
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <div className="absolute top-3 right-3 h-1.5 w-1.5 bg-[#0bd2b5] rounded-full ring-2 ring-white dark:ring-[#050505]" />
        )}
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0 bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] rounded-2xl shadow-2xl" align="end">
        <div className="p-4 border-b border-slate-200 dark:border-[#1f1f1f] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-extrabold uppercase tracking-tight text-slate-900 dark:text-white">Notifications</span>
            {unreadCount > 0 && (
              <span className="bg-[#0bd2b5] text-black text-[11px] font-bold px-2 py-0.5 rounded-full">{unreadCount}</span>
            )}
          </div>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={markAllRead} className="text-[11px] font-bold uppercase tracking-wider text-[#0bd2b5] hover:bg-[#0bd2b5]/10 h-7 px-2 rounded-lg">
              <Check className="h-3 w-3 mr-1" /> Mark all read
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-80">
          <div className="p-2">
            {notifications.map(n => (
              <button
                key={n.id}
                onClick={() => markRead(n.id)}
                className={`w-full text-left p-3 rounded-xl transition-colors ${n.read ? 'hover:bg-slate-50 dark:hover:bg-[#050505]' : 'bg-[#0bd2b5]/5 hover:bg-[#0bd2b5]/10'}`}
              >
                <div className="flex items-start gap-3">
                  {!n.read && <div className="h-2 w-2 rounded-full bg-[#0bd2b5] mt-1.5 shrink-0" />}
                  <div className={`flex-1 min-w-0 ${n.read ? 'ml-5' : ''}`}>
                    <p className="text-xs font-bold text-slate-900 dark:text-white">{n.message}</p>
                    <p className="text-xs text-slate-500 dark:text-[#888] truncate mt-0.5">{n.detail}</p>
                  </div>
                  <span className="text-[11px] text-slate-300 dark:text-[#888888] shrink-0 uppercase tracking-wider">{n.time}</span>
                </div>
              </button>
            ))}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
