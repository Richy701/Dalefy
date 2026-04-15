import { PanelLeft } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";

export function MobileSidebar() {
  const { toggleSidebar } = useSidebar();

  return (
    <button
      onClick={toggleSidebar}
      aria-label="Toggle sidebar"
      className="h-10 w-10 rounded-xl bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] text-slate-500 dark:text-[#888888] hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors shadow-sm flex items-center justify-center shrink-0"
    >
      <PanelLeft className="h-4 w-4" />
    </button>
  );
}
