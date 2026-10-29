import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, X, PencilSimple, DeviceMobile, Flag, AirplaneTilt, UserPlus, type Icon } from "@phosphor-icons/react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useActivityFeed, type ActivityItem, type ActivityKind } from "@/hooks/useActivityFeed";
import { objectPosition } from "@/lib/imagePosition";

const KIND_ICON: Record<ActivityKind, Icon> = { edit: PencilSimple, joined: DeviceMobile, reported: Flag, flight: AirplaneTilt, team: UserPlus };
const KIND_TONE: Record<ActivityKind, string> = {
  edit: "text-muted-foreground",
  joined: "text-emerald-700 dark:text-emerald-400",
  reported: "text-amber-700 dark:text-amber-400",
  flight: "text-red-600 dark:text-red-400",
  team: "text-muted-foreground",
};

/** "10:42" today, "Yesterday", the weekday this week, then the date */
function when(at: number): string {
  const d = new Date(at), now = new Date();
  const days = Math.floor((new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86400000);
  if (days <= 0) return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (days === 1) return "Yesterday";
  if (days < 7) return d.toLocaleDateString("en-GB", { weekday: "short" });
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function Row({ item, onOpen }: { item: ActivityItem; onOpen: (item: ActivityItem) => void }) {
  const KindIcon = KIND_ICON[item.kind];
  const photo = item.trip?.image && (item.kind === "edit" || item.kind === "joined");
  return (
    <button onClick={() => onOpen(item)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-secondary transition-colors">
      <div className="relative h-9 w-9 shrink-0">
        {photo ? (
          <img src={item.trip!.image} alt="" loading="lazy" className="h-9 w-9 rounded-lg object-cover" style={{ objectPosition: objectPosition(item.trip!.imagePosition) }} />
        ) : (
          <div className="h-9 w-9 rounded-lg bg-secondary flex items-center justify-center"><KindIcon className={`h-4 w-4 ${KIND_TONE[item.kind]}`} /></div>
        )}
        {photo && (
          <span className="absolute -bottom-1 -right-1 h-5 w-5 rounded-md bg-card ring-2 ring-card flex items-center justify-center">
            <KindIcon className={`h-3 w-3 ${KIND_TONE[item.kind]}`} weight="bold" />
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className={`text-sm leading-snug line-clamp-2 ${item.unread ? "font-semibold text-foreground" : "text-foreground/80"}`}>{item.title}</p>
        <p className="text-xs text-muted-foreground truncate mt-0.5">{item.detail}</p>
      </div>
      <span className={`text-xs shrink-0 self-start mt-0.5 tabular-nums ${item.unread ? "text-foreground font-medium" : "text-muted-foreground"}`}>{when(item.at)}</span>
    </button>
  );
}

type Feed = ReturnType<typeof useActivityFeed>;

function NotificationList({ feed, onClose }: { feed: Feed; onClose?: () => void }) {
  const { items, unreadCount, markAllRead, clearAll } = feed;
  const navigate = useNavigate();
  const startOfToday = new Date(new Date().toDateString()).getTime();
  const groups = [
    { label: "Today", list: items.filter(i => i.at >= startOfToday) },
    { label: "Earlier", list: items.filter(i => i.at < startOfToday) },
  ].filter(g => g.list.length);
  const open = (item: ActivityItem) => { onClose?.(); navigate(item.href); };

  return (
    <>
      <div className="px-4 py-3 border-b border-border flex items-center gap-3">
        <p className="flex-1 text-sm font-semibold text-foreground">Notifications</p>
        {unreadCount > 0 ? (
          <button onClick={markAllRead} className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors rounded-md outline-none focus-visible:ring-2 focus-visible:ring-brand/40">Mark all read</button>
        ) : items.length > 0 && (
          <button onClick={clearAll} className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors rounded-md outline-none focus-visible:ring-2 focus-visible:ring-brand/40">Clear</button>
        )}
        {onClose && (
          <button onClick={onClose} aria-label="Close" className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors sm:hidden">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="sm:max-h-[min(28rem,calc(100dvh-8rem))] max-sm:flex-1 overflow-y-auto overscroll-contain">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-12 px-6">
            <div className="h-10 w-10 rounded-xl bg-secondary flex items-center justify-center mb-3">
              <Bell className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">Nothing new on your trips</p>
            <p className="text-xs text-muted-foreground mt-1">Teammates' changes, travellers joining the app, reported photos and flight problems show up here.</p>
          </div>
        ) : (
          <div className="p-1.5">
            {groups.map(g => (
              <div key={g.label}>
                <p className="px-3 pt-2.5 pb-1 text-xs font-medium text-muted-foreground">{g.label}</p>
                {g.list.map(item => <Row key={item.id} item={item} onOpen={open} />)}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

export function NotificationPanel() {
  // One feed for the badge and the list, so marking read clears both
  const feed = useActivityFeed();
  const { unreadCount } = feed;
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Desktop: Popover */}
      <Popover>
        <PopoverTrigger className="hidden sm:flex h-10 w-10 rounded-xl bg-card hover:bg-secondary text-muted-foreground hover:text-brand relative border border-border shadow-sm items-center justify-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand/40">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 bg-primary text-primary-foreground text-[9px] font-black rounded-full flex items-center justify-center ring-2 ring-card">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </PopoverTrigger>
        <PopoverContent initialFocus={type => type === "keyboard"} className="w-96 p-0 gap-0 overflow-hidden bg-card border border-border rounded-xl shadow-2xl" align="end">
          <NotificationList feed={feed} />
        </PopoverContent>
      </Popover>

      {/* Mobile: trigger button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="sm:hidden h-10 w-10 rounded-xl bg-card hover:bg-secondary text-muted-foreground hover:text-brand relative border border-border shadow-sm flex items-center justify-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 bg-primary text-primary-foreground text-[9px] font-black rounded-full flex items-center justify-center ring-2 ring-card">
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
          <NotificationList feed={feed} onClose={() => setMobileOpen(false)} />
        </div>
      )}
    </>
  );
}
