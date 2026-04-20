import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ErrorBoundary } from "react-error-boundary";
import { ThemeProvider, useTheme } from "@/context/ThemeContext";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { TripsProvider } from "@/context/TripsContext";
import { NotificationProvider } from "@/context/NotificationContext";
import { PreferencesProvider, usePreferences } from "@/context/PreferencesContext";
import { OrgProvider, useOrg } from "@/context/OrgContext";
import { BrandProvider } from "@/context/BrandContext";
import { isSupabaseConfigured } from "@/services/supabase";

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

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const { hasOrg, isLoading: orgLoading } = useOrg();
  const isRealUser = isSupabaseConfigured() && user?.id !== "demo" && (user?.id?.length ?? 0) > 20;

  if (authLoading || (isRealUser && orgLoading)) return <AuthLoadingScreen />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  // Real auth users without an org → create one first
  if (isRealUser && !hasOrg) return <Navigate to="/create-org" replace />;
  return <>{children}</>;
}

function AuthLoadingScreen() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#050505] flex items-center justify-center">
      <div className="h-10 w-10 rounded-full border-2 border-slate-200 dark:border-[#1f1f1f] border-t-brand animate-spin" />
    </div>
  );
}

function AppRoutes() {
  const { isAuthenticated, isLoading } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={isLoading ? <AuthLoadingScreen /> : isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<DashboardPage />} />
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
      <Route path="/shared/:tripId" element={<SharedTripPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
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
      theme={theme}
      toastOptions={{
        style: {
          background: "#111111",
          border: "1px solid #1f1f1f",
          color: "#ffffff",
          fontFamily: "inherit",
          fontSize: "12px",
          fontWeight: 700,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
        },
      }}
    />
  );
}

function AppErrorFallback({ error, resetErrorBoundary }: { error: Error; resetErrorBoundary: () => void }) {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#050505] flex items-center justify-center p-4">
      <div className="text-center max-w-md space-y-6">
        <div className="h-16 w-16 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto">
          <svg className="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="text-2xl font-extrabold uppercase tracking-tight text-slate-900 dark:text-white">App Error</h1>
        <p className="text-sm text-slate-500 dark:text-[#888]">{error.message}</p>
        <button
          onClick={resetErrorBoundary}
          className="h-12 px-8 rounded-xl bg-brand text-black text-xs font-bold uppercase tracking-wider hover:opacity-90 transition-opacity shadow-xl shadow-brand/20"
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
              <TripsProvider>
                <PreferencesProvider>
                  <AppRoutes />
                  <AppToaster />
                </PreferencesProvider>
              </TripsProvider>
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
