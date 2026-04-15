import { Outlet, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { AppSidebar } from "@/components/app-sidebar";
import { NotificationToast } from "@/components/shared/NotificationToast";
import { CommandPalette } from "@/components/shared/CommandPalette";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

export function AppLayout() {
  const location = useLocation();

  return (
    <TooltipProvider>
      <SidebarProvider
        defaultOpen={true}
        className="font-sans antialiased text-slate-900 dark:text-white selection:bg-[#0bd2b5]/30"
      >
        <AppSidebar />
        <SidebarInset className="bg-slate-50 dark:bg-[#050505] h-dvh overflow-hidden flex flex-col">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.pathname}
              className="flex-1 flex flex-col overflow-hidden"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </SidebarInset>
        <NotificationToast />
        <CommandPalette />
      </SidebarProvider>
    </TooltipProvider>
  );
}
