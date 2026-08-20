import { SidebarSimple } from "@phosphor-icons/react";
import { useSidebar } from "@/components/ui/sidebar";

/** Sidebar toggle button (named MobileSidebar for history; it works at every width). */
export function MobileSidebar({ className }: { className?: string }) {
  const { toggleSidebar, open, openMobile, isMobile } = useSidebar();
  const expanded = isMobile ? openMobile : open;

  return (
    <button
      type="button"
      onClick={toggleSidebar}
      aria-label={expanded ? "Hide navigation" : "Show navigation"}
      aria-expanded={expanded}
      aria-controls="app-sidebar"
      className={`h-10 w-10 rounded-xl bg-white dark:bg-card border border-slate-200 dark:border-border text-slate-500 dark:text-muted-foreground hover:text-brand hover:bg-slate-100 dark:hover:bg-secondary transition-colors shadow-sm flex items-center justify-center shrink-0 ${className ?? ""}`}
    >
      <SidebarSimple className="h-4 w-4" />
    </button>
  );
}
