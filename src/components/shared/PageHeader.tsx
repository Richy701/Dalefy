import { Sun, Moon } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { NotificationPanel } from "@/components/shared/NotificationPanel";
import { MobileSidebar } from "@/components/sidebar/MobileSidebar";
import { SidebarTrigger } from "@/components/ui/sidebar";

interface PageHeaderProps {
  /** Content placed after MobileSidebar — page title, search, etc. */
  left?: React.ReactNode;
  /** Primary CTA button. A divider is automatically inserted before it. */
  cta?: React.ReactNode;
}

export function PageHeader({ left, cta }: PageHeaderProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <header className="h-16 shrink-0 border-b border-slate-200 dark:border-[#1f1f1f] px-4 lg:px-8 flex items-center gap-3 sticky top-0 z-40 bg-slate-50/80 dark:bg-[#050505]/80 backdrop-blur-md">
      <div className="lg:hidden">
        <MobileSidebar />
      </div>
      <SidebarTrigger className="hidden lg:flex" />
      <div className="flex-1 min-w-0 flex items-center">
        {left}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <button
          aria-label="Toggle theme"
          onClick={toggleTheme}
          className="h-11 w-11 rounded-full bg-white dark:bg-[#111111] hover:bg-slate-100 dark:hover:bg-[#1f1f1f] text-slate-500 dark:text-[#888888] hover:text-[#0bd2b5] transition-[background-color,color] border border-slate-200 dark:border-[#1f1f1f] flex items-center justify-center cursor-pointer shadow-sm shrink-0"
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
        <NotificationPanel />
        {cta && (
          <>
            <div className="h-7 w-px bg-slate-200 dark:bg-[#1f1f1f] hidden lg:block shrink-0" />
            {cta}
          </>
        )}
      </div>
    </header>
  );
}
