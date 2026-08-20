import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DotsSixVertical } from "@phosphor-icons/react";
import { EventCard } from "./EventCard";
import type { TravelEvent } from "@/types";

interface SortableEventCardProps {
  event: TravelEvent;
  onClick: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  assignedPeople?: Array<{ initials: string; name: string }>;
  tripTz?: string;
}

export function SortableEventCard({ event, onClick, onDuplicate, onDelete, assignedPeople, tripTz }: SortableEventCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: event.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: "relative",
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className="group/sortable relative">
      {/* Drag handle */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-8 z-10 h-8 w-6 flex items-center justify-center rounded-md text-slate-400 dark:text-muted-foreground opacity-0 group-hover/sortable:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100 hover:text-brand dark:hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand transition-opacity cursor-grab active:cursor-grabbing touch-none"
        title="Drag to reorder (or focus and use arrow keys)"
        aria-label={`Reorder ${event.title || "event"}`}
      >
        <DotsSixVertical className="h-4 w-4" />
      </button>
      <EventCard event={event} onClick={onClick} onDuplicate={onDuplicate} onDelete={onDelete} assignedPeople={assignedPeople} tripTz={tripTz} />
    </div>
  );
}
