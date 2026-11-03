import { useEffect, useState } from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ErrorBoundary, type FallbackProps } from "react-error-boundary";
import { ThemeProvider, useTheme } from "@/context/ThemeContext";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { TripsProvider } from "@/context/TripsContext";
import { DirectoryProvider } from "@/context/DirectoryContext";
import { NotificationProvider } from "@/context/NotificationContext";
import { PreferencesProvider, usePreferences } from "@/context/PreferencesContext";
import { OrgProvider, useOrg } from "@/context/OrgContext";
import { BrandProvider } from "@/context/BrandContext";
import { isFirebaseConfigured } from "@/services/firebase";

import { Logo } from "@/components/shared/Logo";
import { BRAND } from "@/config/brand";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});
import { AppLayout } from "@/layouts/AppLayout";
import { LoginPage } from "@/pages/LoginPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { WorkspacePage } from "@/pages/WorkspacePage";
import { TravelersPage } from "@/pages/TravelersPage";
import { DestinationsPage } from "@/pages/DestinationsPage";
import { ReportsPage } from "@/pages/ReportsPage";
import { MediaPage } from "@/pages/MediaPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { SharedTripPage } from "@/pages/SharedTripPage";
import { CreateOrgPage } from "@/pages/CreateOrgPage";
import { AcceptInvitePage } from "@/pages/AcceptInvitePage";
import { getPendingInvite } from "@/lib/pendingInvite";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const { hasOrg, isLoading: orgLoading, tablesReady } = useOrg();
  const isRealUser = isFirebaseConfigured() && user?.id !== "demo" && (user?.id?.length ?? 0) > 20;

  // Only block on auth loading - org loading happens in the background
  if (authLoading) return <AuthLoadingScreen />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  // Wait briefly for org check, but don't block forever
  if (isRealUser && orgLoading) return <AuthLoadingScreen />;
  // A pending team invite takes priority over everything else
  const pendingInvite = isRealUser ? getPendingInvite() : null;
  if (pendingInvite) return <Navigate to={`/invite/${pendingInvite}`} replace />;
  // Real auth users without an org → create one first
  if (isRealUser && tablesReady && !hasOrg) return <Navigate to="/create-org" replace />;
  return <>{children}</>;
}

const LOADING_MESSAGES = [
  "Signing you in",
  "Fetching your trips",
  "Almost there",
];

function AuthLoadingScreen() {
  const [messageIdx, setMessageIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setMessageIdx(i => (i + 1) % LOADING_MESSAGES.length), 2200);
    return () => clearInterval(id);
  }, []);

  return (
    // 180ms delay on the fade-in: on cached-auth loads the screen never flashes.
    <div
      className="relative min-h-screen bg-background flex flex-col items-center justify-center overflow-hidden"
      style={{ animation: "fadeIn 400ms ease-out 180ms both" }}
    >
      {/* Soft brand glow — gives the screen a focal point instead of flat black. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 50% 42%, rgb(var(--brand-rgb) / 0.07), transparent 55%)",
        }}
      />

      <div className="relative flex flex-col items-center gap-5">
        <div className="flex items-center gap-3 motion-safe:animate-breathe will-change-transform">
          <Logo className="h-10 w-10 text-brand" />
          <span className="text-2xl font-bold tracking-tight text-foreground">
            {BRAND.name}
          </span>
        </div>

        <div className="relative h-5 w-56" aria-live="polite">
          {LOADING_MESSAGES.map((m, i) => (
            <p
              key={m}
              className={`absolute inset-0 text-center text-sm text-muted-foreground transition-opacity duration-500 ${i === messageIdx ? "opacity-100" : "opacity-0"}`}
            >
              {m}
            </p>
          ))}
        </div>
      </div>

      {/* Indeterminate progress line at the very bottom edge. */}
      <div
        aria-hidden="true"
        className="absolute bottom-0 left-0 right-0 h-[2px] overflow-hidden bg-border/40"
      >
        <div className="h-full w-1/4 bg-brand rounded-full motion-safe:animate-progressSlide" />
      </div>
    </div>
  );
}

function AppRoutes() {
  const { isAuthenticated, isLoading } = useAuth();

  return (
    <Routes>
      <Route path="/" element={isLoading ? <AuthLoadingScreen /> : <Navigate to={isAuthenticated ? "/dashboard" : "/login"} replace />} />
      <Route path="/login" element={isLoading ? <AuthLoadingScreen /> : isAuthenticated ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/trips" element={<DashboardPage />} />
        <Route path="/travelers" element={<TravelersPage />} />
        <Route path="/destinations" element={<DestinationsPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/media" element={<MediaPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route
        path="/trip/:tripId"
        element={
          <ProtectedRoute>
            <WorkspacePage />
          </ProtectedRoute>
        }
      />
      <Route path="/create-org" element={<CreateOrgPage />} />
      <Route path="/invite/:token" element={<AcceptInvitePage />} />
      <Route path="/shared/:tripId" element={<SharedTripPage />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

function AppToaster() {
  const { theme } = useTheme();
  const { toastsEnabled } = usePreferences();
  if (!toastsEnabled) return null;
  return (
    <Toaster
      position="bottom-right"
      theme={theme === "light" ? "light" : "dark"}
      toastOptions={{
        style: {
          background: "hsl(var(--card))",
          border: "1px solid hsl(var(--border))",
          color: "hsl(var(--foreground))",
          fontFamily: "inherit",
          fontSize: "13px",
          fontWeight: 500,
        },
      }}
    />
  );
}

function AppErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="text-center max-w-md space-y-6">
        <div className="h-16 w-16 rounded-xl bg-red-500/10 flex items-center justify-center mx-auto">
          <svg className="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight text-foreground">App Error</h1>
        <p className="text-sm text-muted-foreground">{error instanceof Error ? error.message : String(error)}</p>
        <button
          onClick={resetErrorBoundary}
          className="h-12 px-8 rounded-xl bg-primary text-primary-foreground text-xs font-bold uppercase tracking-wider hover:opacity-90 transition-opacity"
        >
          Reload App
        </button>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary FallbackComponent={AppErrorFallback}>
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <ThemeProvider>
          <AuthProvider>
            <OrgProvider>
            <BrandProvider>
            <NotificationProvider>
              <DirectoryProvider>
              <TripsProvider>
                <PreferencesProvider>
                  <AppRoutes />
                  <AppToaster />
                </PreferencesProvider>
              </TripsProvider>
              </DirectoryProvider>
            </NotificationProvider>
            </BrandProvider>
            </OrgProvider>
          </AuthProvider>
        </ThemeProvider>
      </HashRouter>
    </QueryClientProvider>
    </ErrorBoundary>
  );
}
