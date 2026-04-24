import { memo } from "react";
import { Plane, Hotel, Compass, Utensils, Car, MapPin, Clock, EllipsisVertical, Settings, Trash2, ArrowRight, Image as ImageIcon, Video, Paperclip } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { TravelEvent } from "@/types";

interface AssignedPerson { initials: string; name: string }

function AssignedDots({ people }: { people?: AssignedPerson[] }) {
  if (!people || people.length === 0) return null;
  return (
    <div className="flex items-center -space-x-1.5">
      {people.slice(0, 4).map((p, i) => (
        <div
          key={i}
          title={p.name}
          className="h-5 w-5 rounded-full bg-brand/15 border-2 border-white dark:border-[#111111] flex items-center justify-center text-[7px] font-black text-brand uppercase"
        >
          {p.initials}
        </div>
      ))}
      {people.length > 4 && (
        <div className="h-5 w-5 rounded-full bg-slate-100 dark:bg-[#1a1a1a] border-2 border-white dark:border-[#111111] flex items-center justify-center text-[7px] font-black text-slate-500 dark:text-[#888]">
          +{people.length - 4}
        </div>
      )}
    </div>
  );
}

function StatusChip({ status }: { status?: string }) {
  if (!status) return null;
  const cls =
    status === "On Time" || status === "Confirmed"
      ? "bg-emerald-500/10 text-emerald-400"
      : status === "Proposed"
      ? "bg-brand/10 text-brand"
      : "bg-slate-100 dark:bg-[#1a1a1a] text-slate-500 dark:text-[#888]";
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0 ${cls}`}>
      {status}
    </span>
  );
}

function MediaBadge({ media, documents }: { media?: TravelEvent["media"]; documents?: TravelEvent["documents"] }) {
  const images = media?.filter(m => m.type === "image").length ?? 0;
  const videos = media?.filter(m => m.type === "video").length ?? 0;
  const docs   = documents?.length ?? 0;
  if (!images && !videos && !docs) return null;
  return (
    <div className="flex items-center gap-1.5">
      {images > 0 && (
        <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-[#888888] bg-slate-100 dark:bg-[#1a1a1a] px-2 py-0.5 rounded-full">
          <ImageIcon className="h-2.5 w-2.5" />{images}
        </span>
      )}
      {videos > 0 && (
        <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-[#888888] bg-slate-100 dark:bg-[#1a1a1a] px-2 py-0.5 rounded-full">
          <Video className="h-2.5 w-2.5" />{videos}
        </span>
      )}
      {docs > 0 && (
        <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-[#888888] bg-slate-100 dark:bg-[#1a1a1a] px-2 py-0.5 rounded-full">
          <Paperclip className="h-2.5 w-2.5" />{docs}
        </span>
      )}
    </div>
  );
}

function CardMenu({ onClick, onDelete }: { onClick: () => void; onDelete: () => void }) {
  return (
    <div onClick={e => e.stopPropagation()} className="shrink-0">
      <DropdownMenu>
        <DropdownMenuTrigger aria-label="Event options" className="h-8 w-8 rounded-lg bg-slate-50 dark:bg-[#0a0a0a] text-slate-500 dark:text-[#888888] flex items-center justify-center border border-transparent hover:border-slate-200 dark:hover:border-[#2a2a2a] hover:text-slate-600 dark:hover:text-[#aaa] transition-[border-color,color] duration-150">
          <EllipsisVertical className="h-3.5 w-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] text-slate-900 dark:text-white rounded-xl shadow-2xl p-1 min-w-[160px]">
          <DropdownMenuItem onClick={onClick} className="gap-2 p-2 rounded-lg font-bold text-[11px] uppercase tracking-wider text-slate-900 dark:text-white hover:bg-slate-50 dark:hover:bg-[#050505]">
            <Settings className="h-3.5 w-3.5 text-brand" /> Edit Event
          </DropdownMenuItem>
          <div className="my-1 h-px bg-slate-100 dark:bg-[#1f1f1f]" />
          <DropdownMenuItem onClick={onDelete} className="gap-2 p-2 rounded-lg font-bold text-[11px] uppercase tracking-wider text-red-500 hover:bg-red-500/5">
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ─── Compact Row — used when event data is sparse ─────────────────────────────
function CompactCard({
  event, onClick, onDelete, Icon, label, assignedPeople,
}: {
  event: TravelEvent;
  onClick: () => void;
  onDelete: () => void;
  Icon: React.ComponentType<{ className?: string }>;
  label: string;
  originCode?: string;
  assignedPeople?: AssignedPerson[];
}) {
  return (
    <div
      onClick={onClick}
      className="group bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] hover:border-brand/30 rounded-2xl pl-3 pr-4 sm:pr-5 py-3 flex items-center gap-3 cursor-pointer transition-[border-color] duration-200 overflow-hidden"
    >
      {event.image ? (
        <img src={event.image} alt="" className="h-12 w-16 rounded-lg object-cover shrink-0" />
      ) : (
        <div className="h-12 w-12 rounded-lg bg-brand/10 flex items-center justify-center shrink-0">
          <Icon className="h-4 w-4 text-brand" />
        </div>
      )}
      {event.time && (
        <div className="shrink-0 flex flex-col leading-none">
          <span className="text-sm font-black tracking-tight text-slate-900 dark:text-white tabular-nums">{event.time.split(" ")[0]}</span>
          {event.time.split(" ")[1] && <span className="text-[9px] font-bold text-slate-500 dark:text-[#888] uppercase tracking-wider mt-0.5">{event.time.split(" ")[1]}</span>}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-brand">{label}</span>
        </div>
        <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate leading-tight">{event.title}</h4>
      </div>
      <StatusChip status={event.status} />
      <MediaBadge media={event.media} documents={event.documents} />
      <AssignedDots people={assignedPeople} />
      <CardMenu onClick={onClick} onDelete={onDelete} />
    </div>
  );
}

// ─── Flight Card ──────────────────────────────────────────────────────────────
function FlightCard({ event, onClick, onDelete, assignedPeople }: { event: TravelEvent; onClick: () => void; onDelete: () => void; assignedPeople?: AssignedPerson[] }) {
  const parts = event.location?.match(/^(.+?)\s+to\s+(.+)$/i);
  const from = parts?.[1]?.trim() ?? event.location ?? "";
  const to = parts?.[2]?.trim() ?? "";

  // Sparse: no destination means the route viz looks broken — collapse to compact row.
  if (!to) {
    return (
      <CompactCard
        event={event} onClick={onClick} onDelete={onDelete}
        Icon={Plane} label="Flight"
        assignedPeople={assignedPeople}
      />
    );
  }

  const fromCode = from.length <= 4 ? from.toUpperCase() : from.slice(0, 3).toUpperCase();
  const toCode = to.length <= 4 ? to.toUpperCase() : to.slice(0, 3).toUpperCase();
  const fromLabel = from.length > 4 ? from.slice(0, 14) : "Departure";
  const toLabel = to.length > 4 ? to.slice(0, 14) : "Arrival";

  return (
    <div
      onClick={onClick}
      className="group relative bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] rounded-2xl overflow-hidden hover:border-brand/30 hover:shadow-lg transition-[border-color,box-shadow] duration-200 cursor-pointer"
    >
      <div className="h-px w-full bg-gradient-to-r from-transparent via-slate-200 dark:via-[#2a2a2a] to-transparent" />
      <div className="px-4 sm:px-6 py-4 sm:py-5 flex items-center gap-4 sm:gap-6">
        {/* Departure time */}
        <div className="flex flex-col items-center shrink-0 w-12 sm:w-14 text-center">
          <div className="h-8 w-8 rounded-lg bg-brand/10 text-brand flex items-center justify-center mb-2">
            <Plane className="h-3.5 w-3.5" />
          </div>
          <span className="text-lg sm:text-xl font-black tracking-tighter text-slate-900 dark:text-white leading-none">{event.time.split(" ")[0]}</span>
          <span className="text-[10px] font-bold text-slate-500 dark:text-[#888888] uppercase tracking-wider mt-0.5">{event.time.split(" ")[1]}</span>
        </div>

        {/* Route visualization */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 sm:gap-3 mb-3">
            <div className="text-center shrink-0">
              <p className="text-xl sm:text-2xl font-black tracking-tighter text-slate-900 dark:text-white leading-none">{fromCode}</p>
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-[#888888] mt-0.5 leading-none max-w-[60px] truncate">{fromLabel}</p>
            </div>
            <div className="flex-1 flex items-center gap-1.5 min-w-0">
              <div className="h-px flex-1 border-t border-dashed border-slate-300 dark:border-[#2a2a2a]" />
              <Plane className="h-3 w-3 text-brand shrink-0" />
              <div className="h-px flex-1 border-t border-dashed border-slate-300 dark:border-[#2a2a2a]" />
            </div>
            {to && (
              <div className="text-center shrink-0">
                <p className="text-xl sm:text-2xl font-black tracking-tighter text-slate-900 dark:text-white leading-none">{toCode}</p>
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-[#888888] mt-0.5 leading-none max-w-[60px] truncate">{toLabel}</p>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate">{event.title}</p>
            <StatusChip status={event.status} />
            <MediaBadge media={event.media} documents={event.documents} />
            <AssignedDots people={assignedPeople} />
          </div>
          <div className="flex items-center gap-3 mt-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-[#888888]">
            {event.airline && <span>{event.airline}{event.flightNum ? ` · ${event.flightNum}` : ""}</span>}
            {event.terminal && <span>Terminal {event.terminal.replace("T", "")}</span>}
            {event.duration && (
              <span className="flex items-center gap-1 ml-auto shrink-0">
                <Clock className="h-3 w-3" />{event.duration}
              </span>
            )}
          </div>
        </div>

        <CardMenu onClick={onClick} onDelete={onDelete} />
      </div>
    </div>
  );
}

// ─── Hotel Card ───────────────────────────────────────────────────────────────
function HotelCard({ event, onClick, onDelete, assignedPeople }: { event: TravelEvent; onClick: () => void; onDelete: () => void; assignedPeople?: AssignedPerson[] }) {
  // Sparse: no checkin/out, no roomType, no location → collapse to compact row.
  const isSparse = !event.checkin && !event.checkout && !event.roomType && !event.location;
  if (isSparse) {
    return (
      <CompactCard
        event={event} onClick={onClick} onDelete={onDelete} assignedPeople={assignedPeople}
        Icon={Hotel} label="Accommodation"
      />
    );
  }
  return (
    <div
      onClick={onClick}
      className="group relative bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] rounded-2xl overflow-hidden hover:border-brand/30 hover:shadow-lg transition-[border-color,box-shadow] duration-200 cursor-pointer"
    >
      <div className="flex flex-col sm:flex-row">
        {event.image ? (
          <div className="w-full h-40 sm:w-36 lg:w-44 sm:h-auto shrink-0 relative overflow-hidden sm:self-stretch">
            <img src={event.image} alt={event.title} className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
            <div className="absolute inset-0 bg-gradient-to-b sm:bg-gradient-to-r from-transparent to-black/10" />
          </div>
        ) : (
          <div className="w-full h-24 sm:w-36 lg:w-44 sm:h-auto shrink-0 bg-brand/5 flex items-center justify-center border-b sm:border-b-0 sm:border-r border-slate-100 dark:border-[#1a1a1a] sm:self-stretch">
            <Hotel className="h-7 w-7 text-brand/30" />
          </div>
        )}

        <div className="flex-1 min-w-0 p-4 sm:p-5 lg:p-6">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Hotel className="h-3 w-3 text-brand shrink-0" />
                <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-brand">Accommodation</span>
              </div>
              <h4 className="text-base font-bold text-slate-900 dark:text-white leading-tight group-hover:text-brand transition-colors">{event.title}</h4>
              {event.location && (
                <p className="text-xs text-slate-500 dark:text-[#888888] flex items-center gap-1.5 mt-1">
                  <MapPin className="h-3 w-3 shrink-0" />{event.location}
                </p>
              )}
            </div>
            <CardMenu onClick={onClick} onDelete={onDelete} />
          </div>

          <div className="flex items-center gap-3 sm:gap-4 pt-3 border-t border-slate-100 dark:border-[#1a1a1a] flex-wrap">
            {event.checkin ? (
              <>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-[#888] mb-0.5">Check In</p>
                  <p className="text-sm font-black tracking-tighter text-slate-900 dark:text-white leading-none">{event.checkin}</p>
                </div>
                {event.checkout && <ArrowRight className="h-3.5 w-3.5 text-brand shrink-0" />}
                {event.checkout && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-[#888] mb-0.5">Check Out</p>
                    <p className="text-sm font-black tracking-tighter text-slate-900 dark:text-white leading-none">{event.checkout}</p>
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-sm font-black tracking-tighter text-slate-900 dark:text-white">{event.time}</span>
                <StatusChip status={event.status} />
              </div>
            )}
            {event.roomType && (
              <span className="ml-auto text-[11px] font-bold text-brand bg-brand/10 px-2.5 py-1 rounded-full shrink-0">{event.roomType}</span>
            )}
            <MediaBadge media={event.media} documents={event.documents} />
            <AssignedDots people={assignedPeople} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Activity / Dining Card ───────────────────────────────────────────────────
function ActivityCard({ event, onClick, onDelete, assignedPeople }: { event: TravelEvent; onClick: () => void; onDelete: () => void; assignedPeople?: AssignedPerson[] }) {
  const isDining = event.type === "dining";
  const isTransfer = event.type === "transfer";
  const Icon = isTransfer ? Car : isDining ? Utensils : Compass;

  // Sparse: no notes, no endTime, no location → collapse to compact row.
  const isSparse = !event.notes && !event.endTime && !event.location;
  if (isSparse) {
    return (
      <CompactCard
        event={event} onClick={onClick} onDelete={onDelete} assignedPeople={assignedPeople}
        Icon={Icon} label={isTransfer ? "Transfer" : isDining ? "Dining" : "Activity"}
      />
    );
  }

  return (
    <div
      onClick={onClick}
      className="group relative bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] rounded-2xl overflow-hidden transition-[border-color,box-shadow] duration-200 cursor-pointer hover:shadow-lg hover:border-brand/30"
    >
      <div className="flex flex-col sm:flex-row">
        {event.image ? (
          <div className="w-full h-40 sm:w-36 lg:w-44 sm:h-auto shrink-0 relative overflow-hidden sm:self-stretch">
            <img src={event.image} alt={event.title} className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
          </div>
        ) : (
          <div className="w-full h-24 sm:w-36 lg:w-44 sm:h-auto shrink-0 flex items-center justify-center border-b sm:border-b-0 sm:border-r border-slate-100 dark:border-[#1a1a1a] sm:self-stretch bg-brand/5">
            <Icon className="h-7 w-7 opacity-20 text-brand" />
          </div>
        )}

        <div className="flex-1 min-w-0 p-4 sm:p-5 lg:p-6 flex flex-col justify-between">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Icon className="h-3 w-3 shrink-0 text-brand" />
                <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-brand">
                  {isTransfer ? "Transfer" : isDining ? "Dining" : "Activity"}
                </span>
              </div>
              <h4 className="text-base font-bold text-slate-900 dark:text-white leading-tight transition-colors group-hover:text-brand">{event.title}</h4>
              {event.location && (
                <p className="text-xs text-slate-500 dark:text-[#888888] flex items-center gap-1.5 mt-1">
                  <MapPin className="h-3 w-3 shrink-0" />{event.location}
                </p>
              )}
              {event.notes && (
                <p className="text-xs text-slate-500 dark:text-[#888] mt-2 line-clamp-2 leading-relaxed">{event.notes}</p>
              )}
            </div>
            <CardMenu onClick={onClick} onDelete={onDelete} />
          </div>

          <div className="flex items-center gap-2 sm:gap-3 mt-3 pt-3 border-t border-slate-100 dark:border-[#1a1a1a] flex-wrap">
            <span className="text-sm font-black tracking-tighter text-slate-900 dark:text-white">{event.time}</span>
            {event.endTime && (
              <span className="text-[11px] font-bold text-slate-500 dark:text-[#888888]">→ {event.endTime}</span>
            )}
            <StatusChip status={event.status} />
            <MediaBadge media={event.media} documents={event.documents} />
            <AssignedDots people={assignedPeople} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Public export ────────────────────────────────────────────────────────────
export const EventCard = memo(function EventCard({ event, onClick, onDelete, assignedPeople }: { event: TravelEvent; onClick: () => void; onDelete: () => void; assignedPeople?: AssignedPerson[] }) {
  if (event.type === "flight") return <FlightCard event={event} onClick={onClick} onDelete={onDelete} assignedPeople={assignedPeople} />;
  if (event.type === "hotel") return <HotelCard event={event} onClick={onClick} onDelete={onDelete} assignedPeople={assignedPeople} />;
  return <ActivityCard event={event} onClick={onClick} onDelete={onDelete} assignedPeople={assignedPeople} />;
});
