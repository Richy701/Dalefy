import { Outlet } from "react-router-dom";
import { AppSidebar } from "@/components/app-sidebar";
import { NotificationToast } from "@/components/shared/NotificationToast";
import { CommandPalette } from "@/components/shared/CommandPalette";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useGlobalShortcuts } from "@/hooks/useGlobalShortcuts";

function GlobalShortcuts() {
  useGlobalShortcuts();
  return null;
}

export function AppLayout() {
  return (
    <TooltipProvider>
      <SidebarProvider
        defaultOpen={true}
        className="font-sans antialiased text-slate-900 dark:text-white selection:bg-brand/30"
      >
        <AppSidebar />
        <SidebarInset className="bg-slate-50 dark:bg-[#050505] h-dvh overflow-hidden flex flex-col">
          <div className="flex-1 flex flex-col overflow-hidden">
            <Outlet />
          </div>
        </SidebarInset>
        <NotificationToast />
        <CommandPalette />
        <GlobalShortcuts />
      </SidebarProvider>
    </TooltipProvider>
  );
}
