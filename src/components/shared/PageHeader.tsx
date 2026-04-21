import { Sun, Moon } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { NotificationPanel } from "@/components/shared/NotificationPanel";
import { MobileSidebar } from "@/components/sidebar/MobileSidebar";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";

interface PageHeaderProps {
  /** Content placed after the separator — page title, search, etc. */
  left?: React.ReactNode;
  /** Primary CTA button placed on the right side. */
  cta?: React.ReactNode;
}

export function PageHeader({ left, cta }: PageHeaderProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <header className="h-16 shrink-0 px-4 lg:px-6 flex items-center gap-2 sticky top-0 z-40 bg-slate-50/80 dark:bg-[#050505]/80 backdrop-blur-md">
      <div className="lg:hidden">
        <MobileSidebar />
      </div>
      <SidebarTrigger className="hidden lg:flex" />
      <Separator orientation="vertical" className="mx-1 !h-4 hidden lg:block" />
      <div className="flex-1 min-w-0 flex items-center">
        {left}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          aria-label="Toggle theme"
          onClick={toggleTheme}
          className="h-9 w-9 rounded-lg text-slate-500 dark:text-[#888888] hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-[#1f1f1f] transition-colors flex items-center justify-center cursor-pointer shrink-0"
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
        <NotificationPanel />
        {cta}
      </div>
    </header>
  );
}
