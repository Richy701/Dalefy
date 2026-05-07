import { useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { ErrorBoundary } from "react-error-boundary";
import { Flask } from "@phosphor-icons/react";
import { AppSidebar } from "@/components/app-sidebar";
import { NotificationToast } from "@/components/shared/NotificationToast";
import { CommandPalette } from "@/components/shared/CommandPalette";
import { InviteTeamDialog } from "@/components/shared/InviteTeamDialog";
import { EmailVerificationBanner } from "@/components/shared/EmailVerificationBanner";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useGlobalShortcuts } from "@/hooks/useGlobalShortcuts";
import { useAuth } from "@/context/AuthContext";

function GlobalShortcuts() {
  useGlobalShortcuts();
  return null;
}

function PageErrorFallback({ error, resetErrorBoundary }: { error: Error; resetErrorBoundary: () => void }) {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center max-w-md space-y-4">
        <div className="h-12 w-12 rounded-xl bg-red-500/10 flex items-center justify-center mx-auto">
          <svg className="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" weight="regular">
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

function DemoBadge() {
  const { user } = useAuth();
  const navigate = useNavigate();
  if (user?.id !== "demo") return null;

  return (
    <button
      onClick={() => navigate("/login")}
      className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3.5 py-2 rounded-full bg-amber-500 text-black text-[10px] font-black uppercase tracking-wider shadow-lg shadow-amber-500/30 hover:bg-amber-400 transition-colors cursor-pointer"
    >
      <Flask className="h-3.5 w-3.5" weight="bold" />
      Demo Mode
    </button>
  );
}

export function AppLayout() {
  const [inviteOpen, setInviteOpen] = useState(false);

  return (
    <TooltipProvider>
      <SidebarProvider
        defaultOpen={true}
        className="font-sans antialiased text-slate-900 dark:text-white selection:bg-brand/30"
      >
        <AppSidebar />
        <SidebarInset className="bg-slate-50 dark:bg-[#050505] h-dvh overflow-hidden flex flex-col">
          <EmailVerificationBanner />
          <div className="flex-1 flex flex-col overflow-hidden">
            <ErrorBoundary FallbackComponent={PageErrorFallback}>
              <Outlet />
            </ErrorBoundary>
          </div>
        </SidebarInset>
        <NotificationToast />
        <CommandPalette onInvite={() => setInviteOpen(true)} />
        <InviteTeamDialog open={inviteOpen} onOpenChange={setInviteOpen} />
        <GlobalShortcuts />
        <DemoBadge />
      </SidebarProvider>
    </TooltipProvider>
  );
}
