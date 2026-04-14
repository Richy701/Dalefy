import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { EventCard } from "./EventCard";
import type { TravelEvent } from "@/types";

interface SortableEventCardProps {
  event: TravelEvent;
  onClick: () => void;
  onDelete: () => void;
}

export function SortableEventCard({ event, onClick, onDelete }: SortableEventCardProps) {
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
      <div
        {...attributes}
        {...listeners}
        className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-8 z-10 h-8 w-6 flex items-center justify-center text-slate-300 dark:text-[#333] opacity-0 group-hover/sortable:opacity-100 hover:text-[#0bd2b5] dark:hover:text-[#0bd2b5] transition-opacity cursor-grab active:cursor-grabbing"
        title="Drag to reorder"
        aria-label="Drag handle"
      >
        <GripVertical className="h-4 w-4" />
      </div>
      <EventCard event={event} onClick={onClick} onDelete={onDelete} />
    </div>
  );
}
