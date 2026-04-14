import { Outlet, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { NotificationToast } from "@/components/shared/NotificationToast";
import { CommandPalette } from "@/components/shared/CommandPalette";

export function AppLayout() {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#050505] text-slate-900 dark:text-white font-sans antialiased selection:bg-[#0bd2b5]/30 overflow-hidden">
      <div className="relative z-10 flex min-h-screen">
        <Sidebar />
        <div className="flex-1 flex flex-col h-screen overflow-hidden">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.pathname}
              className="flex-1 flex flex-col h-full overflow-hidden"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
      <NotificationToast />
      <CommandPalette />
    </div>
  );
}
