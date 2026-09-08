import { memo } from "react";
import { AirplaneTakeoff, AirplaneLanding, DotsThreeVertical, Gear, Trash, Copy, Image as ImageIcon, Video, Paperclip } from "@phosphor-icons/react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CategoryDot, CATEGORY_CLASS } from "@/components/ui/category-dot";
import type { TravelEvent } from "@/types";
import { tzAbbr, eventTz } from "@/lib/timezone";

interface AssignedPerson { initials: string; name: string }

function AssignedDots({ people }: { people?: AssignedPerson[] }) {
  if (!people || people.length === 0) return null;
  return (
    <div className="flex items-center -space-x-1.5 shrink-0">
      {people.slice(0, 4).map((p, i) => (
        <div
          key={i}
          title={p.name}
          className="h-5 w-5 rounded-full bg-secondary border-2 border-card flex items-center justify-center text-[8px] font-bold text-foreground uppercase"
        >
          {p.initials}
        </div>
      ))}
      {people.length > 4 && (
        <div className="h-5 w-5 rounded-full bg-secondary border-2 border-card flex items-center justify-center text-[8px] font-bold text-muted-foreground">
          +{people.length - 4}
        </div>
      )}
    </div>
  );
}

/** Keyboard + screen-reader access for rows that open the editor on click. */
function cardA11y(title: string, onClick: (() => void) | undefined) {
  return {
    role: "button" as const,
    tabIndex: 0,
    "aria-label": `Edit ${title || "event"}`,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.target !== e.currentTarget || !onClick) return;
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); }
    },
  };
}

function StatusChip({ status }: { status?: string }) {
  if (!status || status === "Confirmed" || status === "On Time") return null;
  const cls =
    status === "Cancelled"
      ? "bg-red-500/10 text-red-600 dark:text-red-400"
      : status === "Delayed"
      ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
      : status === "Proposed"
      ? "bg-brand/10 text-brand"
      : "bg-secondary text-muted-foreground";
  return (
    <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-semibold shrink-0 ${cls}`}>
      {status}
    </span>
  );
}

function MediaBadge({ media, documents }: { media?: TravelEvent["media"]; documents?: TravelEvent["documents"] }) {
  const images = media?.filter(m => m.type === "image").length ?? 0;
  const videos = media?.filter(m => m.type === "video").length ?? 0;
  const docs   = documents?.length ?? 0;
  if (!images && !videos && !docs) return null;
  const item = "flex items-center gap-0.5 text-[10px] font-medium text-muted-foreground";
  return (
    <div className="flex items-center gap-2 shrink-0">
      {images > 0 && <span className={item}><ImageIcon className="h-3 w-3" />{images}</span>}
      {videos > 0 && <span className={item}><Video className="h-3 w-3" />{videos}</span>}
      {docs > 0 && <span className={item}><Paperclip className="h-3 w-3" />{docs}</span>}
    </div>
  );
}

function CardMenu({ onClick, onDuplicate, onDelete }: { onClick: () => void; onDuplicate: () => void; onDelete: () => void }) {
  return (
    <div onClick={e => e.stopPropagation()} className="shrink-0">
      <DropdownMenu>
        <DropdownMenuTrigger aria-label="Event options" className="h-8 w-8 rounded-lg text-muted-foreground flex items-center justify-center hover:bg-secondary hover:text-foreground transition-colors duration-150">
          <DotsThreeVertical className="h-4 w-4" weight="bold" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="bg-card border border-border text-foreground rounded-xl shadow-xl p-1 min-w-[160px]">
          <DropdownMenuItem onClick={onClick} className="gap-2 p-2 rounded-lg text-sm hover:bg-secondary">
            <Gear className="h-4 w-4 text-muted-foreground" /> Edit event
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onDuplicate} className="gap-2 p-2 rounded-lg text-sm hover:bg-secondary">
            <Copy className="h-4 w-4 text-muted-foreground" /> Duplicate
          </DropdownMenuItem>
          <div className="my-1 h-px bg-border" />
          <DropdownMenuItem onClick={onDelete} className="gap-2 p-2 rounded-lg text-sm text-red-500 hover:bg-red-500/5">
            <Trash className="h-4 w-4" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

const isPlaceholderTime = (t?: string) => !t || /^tb[acd]$/i.test(t);

function subtitleFor(event: TravelEvent): string {
  if (event.type === "flight") {
    const parts = event.location?.match(/^(.+?)\s+to\s+(.+)$/i);
    const from = event.depAirport || parts?.[1]?.trim() || "";
    const to = event.arrAirport || parts?.[2]?.trim() || "";
    const route = from && to ? `${from} → ${to}` : event.location || "";
    return [[event.airline, event.flightNum].filter(Boolean).join(" "), route].filter(Boolean).join(" · ");
  }
  if (event.type === "hotel") {
    const stay = event.isOvernight
      ? "Overnight"
      : [event.time ? `In ${event.time}` : null, event.endTime ? `Out ${event.endTime}` : null].filter(Boolean).join(" · ");
    return [event.location, event.roomType, stay].filter(Boolean).join(" · ");
  }
  return [event.location, event.endTime && !isPlaceholderTime(event.endTime) ? `until ${event.endTime}` : null].filter(Boolean).join(" · ");
}

/**
 * One itinerary row: category circle, title, one line of context, time on the
 * right. Flights add departure and arrival legs underneath. Same shape the
 * traveller sees on their phone, so what is built here is what they get.
 */
export const EventCard = memo(function EventCard({ event, onClick, onDuplicate, onDelete, assignedPeople, tripTz }: {
  event: TravelEvent;
  onClick: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  assignedPeople?: AssignedPerson[];
  tripTz?: string;
}) {
  const isFlight = event.type === "flight";
  const depTz = isFlight ? tzAbbr(eventTz(event, tripTz, "dep") ?? "", event.date) : "";
  const arrTz = isFlight ? tzAbbr(eventTz(event, tripTz, "arr") ?? "", event.date) : "";
  const time = event.type === "hotel" && event.isOvernight ? "" : event.time;
  const placeholder = isPlaceholderTime(time);
  const cat = CATEGORY_CLASS[event.type] ?? CATEGORY_CLASS.activity;

  return (
    <div className="bg-card">
      <div
        onClick={onClick}
        {...cardA11y(event.title, onClick)}
        className="group flex items-center gap-3 px-4 py-3 min-h-[60px] cursor-pointer hover:bg-secondary/60 focus-visible:outline-none focus-visible:bg-secondary/60 transition-colors"
      >
        <CategoryDot type={event.type} transferType={event.transferType} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <h4 className="text-sm font-medium text-foreground truncate leading-tight">{event.title}</h4>
            <StatusChip status={event.status} />
          </div>
          {subtitleFor(event) && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">{subtitleFor(event)}</p>
          )}
        </div>
        {event.image && (
          <img src={event.image} alt="" className="h-9 w-12 rounded-md object-cover shrink-0 hidden sm:block" />
        )}
        <MediaBadge media={event.media} documents={event.documents} />
        <AssignedDots people={assignedPeople} />
        {time && (
          <span className={`text-xs font-medium tabular-nums shrink-0 w-14 text-right ${placeholder ? "text-muted-foreground" : "text-brand"}`}>
            {time.split(" ")[0]}
            {!placeholder && (depTz || time.split(" ")[1]) ? <span className="block text-[10px] font-normal text-muted-foreground">{depTz || time.split(" ")[1]}</span> : null}
          </span>
        )}
        <CardMenu onClick={onClick} onDuplicate={onDuplicate} onDelete={onDelete} />
      </div>

      {/* Legs keep the row's right gutter (menu + gap + padding), so their times sit under the time column */}
      {isFlight && (event.depAirport || event.arrAirport) && (
        <div className="pl-[64px] pr-[60px] pb-3 -mt-1 space-y-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <AirplaneTakeoff className={`h-3.5 w-3.5 shrink-0 ${cat.fg}`} />
            <span className="truncate flex-1">{[event.depAirport, event.terminal ? `Terminal ${event.terminal.replace(/^T/i, "")}` : null, depTz || null].filter(Boolean).join(" · ")}</span>
            {!placeholder && <span className="w-14 text-right tabular-nums shrink-0">{event.time.split(" ")[0]}</span>}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <AirplaneLanding className={`h-3.5 w-3.5 shrink-0 ${cat.fg}`} />
            <span className="truncate flex-1">{[event.arrAirport, event.arrTerminal ? `Terminal ${event.arrTerminal.replace(/^T/i, "")}` : null, arrTz || null].filter(Boolean).join(" · ")}</span>
            {event.endTime && !isPlaceholderTime(event.endTime) && <span className="w-14 text-right tabular-nums shrink-0">{event.endTime.split(" ")[0]}</span>}
          </div>
        </div>
      )}
    </div>
  );
});
