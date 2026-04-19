import { Outlet } from "react-router-dom";
import { ErrorBoundary } from "react-error-boundary";
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

function PageErrorFallback({ error, resetErrorBoundary }: { error: Error; resetErrorBoundary: () => void }) {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center max-w-md space-y-4">
        <div className="h-12 w-12 rounded-xl bg-red-500/10 flex items-center justify-center mx-auto">
          <svg className="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-lg font-bold uppercase tracking-wide text-slate-900 dark:text-white">Something went wrong</h2>
        <p className="text-sm text-slate-500 dark:text-[#888]">{error.message}</p>
        <button
          onClick={resetErrorBoundary}
          className="h-10 px-6 rounded-xl bg-brand text-black text-xs font-bold uppercase tracking-wider hover:opacity-90 transition-opacity"
        >
          Try Again
        </button>
      </div>
    </div>
  );
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
            <ErrorBoundary FallbackComponent={PageErrorFallback}>
              <Outlet />
            </ErrorBoundary>
          </div>
        </SidebarInset>
        <NotificationToast />
        <CommandPalette />
        <GlobalShortcuts />
      </SidebarProvider>
    </TooltipProvider>
  );
}
