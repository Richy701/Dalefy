import { Plane, Hotel, Compass, Utensils } from "lucide-react";
import type { TravelEvent } from "@/types";

function DockButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label={`Add ${label}`} className="group flex flex-col items-center justify-center h-11 w-11 sm:h-10 sm:w-auto sm:px-4 rounded-xl hover:bg-brand/10 active:bg-brand/15 active:scale-95 transition-[background-color,transform] duration-200 relative shrink-0 focus-visible:ring-2 focus-visible:ring-brand/40">
      <div className="text-slate-500 dark:text-[#888888] group-hover:text-brand group-active:text-brand transition-[transform,color] duration-150 group-hover:scale-110">{icon}</div>
      <span className="absolute -top-10 bg-white dark:bg-[#111111] text-brand border border-slate-200 dark:border-[#1f1f1f] text-[11px] font-bold uppercase tracking-widest px-3 py-1 rounded-full opacity-0 group-hover:opacity-100 transition-[opacity,transform] duration-150 translate-y-2 group-hover:translate-y-0 whitespace-nowrap shadow-2xl pointer-events-none hidden sm:block">
        ADD {label}
      </span>
    </button>
  );
}

export function DockBar({ onAddEvent }: { onAddEvent: (type: TravelEvent["type"]) => void }) {
  return (
    <div className="fixed bottom-4 sm:bottom-8 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-10 duration-300 max-w-[calc(100vw-2rem)]">
      <div className="bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] p-1.5 sm:p-2 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] flex items-center gap-0.5 sm:gap-1 ring-1 ring-slate-900/5 dark:ring-white/5 shadow-xl overflow-x-auto">
        <DockButton icon={<Plane className="h-4 w-4" />} label="Flight" onClick={() => onAddEvent("flight")} />
        <DockButton icon={<Hotel className="h-4 w-4" />} label="Hotel" onClick={() => onAddEvent("hotel")} />
        <DockButton icon={<Compass className="h-4 w-4" />} label="Activity" onClick={() => onAddEvent("activity")} />
        <DockButton icon={<Utensils className="h-4 w-4" />} label="Dining" onClick={() => onAddEvent("dining")} />
      </div>
    </div>
  );
}
