import React, { useEffect, useCallback, useRef, useState } from "react";
import { Appearance, Platform, View, AppState } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import * as SplashScreen from "expo-splash-screen";
import * as Updates from "expo-updates";
import * as SystemUI from "expo-system-ui";
let NavigationBar: any = null;
try { NavigationBar = require("expo-navigation-bar"); } catch { /* not available */ }

// Read saved theme preference and set native root background BEFORE React mounts.
// This prevents the flash when the user's saved theme differs from the system theme.
const systemIsDark = Appearance.getColorScheme() === "dark";
SystemUI.setBackgroundColorAsync(systemIsDark ? "#09090b" : "#f7f8fb").catch(() => {});

// Eagerly apply saved preference — runs async but resolves before splash hides
import AsyncStorage from "@react-native-async-storage/async-storage";
AsyncStorage.getItem("daf-prefs").then((raw) => {
  if (!raw) return;
  try {
    const { themeMode } = JSON.parse(raw);
    if (themeMode === "light" || themeMode === "dark") {
      if (Platform.OS !== "android") {
        try { Appearance.setColorScheme(themeMode); } catch { /* older RN */ }
      }
      SystemUI.setBackgroundColorAsync(themeMode === "dark" ? "#09090b" : "#f7f8fb").catch(() => {});
    }
  } catch { /* ignore */ }
}).catch(() => {});

// Android: transparent nav bar so content extends edge-to-edge
if (Platform.OS === "android" && NavigationBar) {
  NavigationBar.setBackgroundColorAsync("#09090b").catch(() => {});
  NavigationBar.setButtonStyleAsync("light").catch(() => {});
}
import { useFonts } from "expo-font";
import { useRouter, usePathname } from "expo-router";
import { TripsProvider, useTrips } from "@/context/TripsContext";
import { ThemeProvider, useTheme } from "@/context/ThemeContext";
import { NotificationProvider, useNotifications } from "@/context/NotificationContext";
import { PreferencesProvider, usePreferences } from "@/context/PreferencesContext";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { BrandProvider } from "@/context/BrandContext";
import { ToastProvider } from "@/context/ToastContext";
import { ComplianceProvider } from "@/context/ComplianceContext";
import { registerForPushNotifications } from "@/services/pushNotifications";
let QuickActions: any = null;
let useQuickActionRouting: any = () => {};
try {
  QuickActions = require("expo-quick-actions");
  useQuickActionRouting = require("expo-quick-actions/router").useQuickActionRouting;
} catch { /* not available */ }
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useWidgetSync } from "@/hooks/useWidgetSync";
import { useFlightAlerts } from "@/hooks/useFlightAlerts";
import { useTripReminders } from "@/hooks/useTripReminders";
import { useTripNotifications } from "@/hooks/useTripNotifications";
import { useFlightLiveActivity } from "@/hooks/useFlightLiveActivity";
import { useUpcomingEventLiveActivity } from "@/hooks/useUpcomingEventLiveActivity";

/** Uses stored orgId from preferences (set during onboarding), falls back to trip org */
function BrandBridge({ children }: { children: React.ReactNode }) {
  const { prefs } = usePreferences();
  const { trips } = useTrips();

  // Primary: org set during onboarding (agency code)
  // Fallback: first trip's org
  const orgId = prefs.orgId
    || trips.find(t => t.organizationId)?.organizationId
    || null;

  return <BrandProvider orgId={orgId}>{children}</BrandProvider>;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

let Notifications: typeof import("expo-notifications") | null = null;
try { Notifications = require("expo-notifications"); } catch { /* Expo Go */ }

SplashScreen.preventAutoHideAsync().catch(() => {});

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Mapbox = require("@rnmapbox/maps").default;
  const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? "";
  if (token) Mapbox.setAccessToken(token);
} catch { /* native module not available in Expo Go */ }

function AppStack() {
  const { isDark, C } = useTheme();
  const { ready: tripsReady } = useTrips();
  const { ready: prefsReady } = usePreferences();
  const router = useRouter();
  const pathname = usePathname();
  const [fontsLoaded, fontError] = useFonts({
    BarlowCondensed_700Bold: require("@expo-google-fonts/barlow-condensed/700Bold/BarlowCondensed_700Bold.ttf"),
    BarlowCondensed_800ExtraBold: require("@expo-google-fonts/barlow-condensed/800ExtraBold/BarlowCondensed_800ExtraBold.ttf"),
    BarlowCondensed_900Black: require("@expo-google-fonts/barlow-condensed/900Black/BarlowCondensed_900Black.ttf"),
  });

  // Sync native root background with theme (status bar area)
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(isDark ? "#09090b" : "#f7f8fb");
  }, [isDark]);

  // Android: sync nav bar color with theme
  useEffect(() => {
    if (Platform.OS === "android" && NavigationBar) {
      NavigationBar.setBackgroundColorAsync(C.bg).catch(() => {});
      NavigationBar.setButtonStyleAsync(isDark ? "light" : "dark").catch(() => {});
    }
  }, [isDark, C.bg]);

  // Quick actions — long-press app icon shortcuts
  useQuickActionRouting();
  useEffect(() => {
    try {
      QuickActions?.setItems([
        { id: "join", title: "Join a Trip", icon: Platform.select({ ios: "symbol:qrcode", android: "shortcut_join" }) ?? undefined, params: { href: "/" } },
        { id: "gallery", title: "Gallery", icon: Platform.select({ ios: "symbol:camera.fill", android: "shortcut_gallery" }) ?? undefined, params: { href: "/media" } },
        { id: "profile", title: "My Profile", icon: Platform.select({ ios: "symbol:person.crop.circle", android: "shortcut_profile" }) ?? undefined, params: { href: "/profile" } },
      ]);
    } catch { /* not available */ }
  }, []);

  const { addNotification } = useNotifications();
  const { prefs } = usePreferences();
  const auth = useAuth();
  const ready = (fontsLoaded || fontError) && tripsReady && prefsReady && !auth.isLoading;

  // Defer background services until UI is visible
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => setSettled(true), 500);
    return () => clearTimeout(t);
  }, [ready]);
  const pendingTripNav = useRef<string | null>(null);

  useEffect(() => {
    if (!Notifications) return;
    const recvSub = Notifications.addNotificationReceivedListener((notification) => {
      const { title, body, data } = notification.request.content;
      const category = (data?.category as string | undefined) ?? "update";
      const allowed =
        category === "reminder" ? prefs.tripReminders :
        category === "update"   ? prefs.itineraryUpdates :
        (prefs.tripReminders || prefs.itineraryUpdates);
      if (!allowed) return;

      addNotification({
        message: title ?? "Trip Update",
        detail: body ?? "",
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        type: "info",
      });
    });
    const tapSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const tripId = response.notification.request.content.data?.tripId as string | undefined;
      if (!tripId) return;
      if (ready) {
        router.push(`/trip/${tripId}`);
      } else {
        pendingTripNav.current = tripId;
      }
    });
    return () => { recvSub.remove(); tapSub.remove(); };
  }, [router, addNotification, prefs.tripReminders, prefs.itineraryUpdates, ready]);

  useEffect(() => {
    if (ready && pendingTripNav.current) {
      const tripId = pendingTripNav.current;
      pendingTripNav.current = null;
      router.push(`/trip/${tripId}`);
    }
  }, [ready, router]);

  useEffect(() => {
    if (!ready) return;
    const authScreens = ["/auth", "/auth-callback"];
    const onAuthScreen = authScreens.includes(pathname);

    // New users: no account AND no name → auth screen
    if (!auth.isAuthenticated && !prefs.name && !onAuthScreen && pathname !== "/welcome") {
      router.replace("/auth");
      return;
    }
    // Authenticated but hasn't set name yet → welcome/onboarding
    if (auth.isAuthenticated && !prefs.name && pathname !== "/welcome" && !onAuthScreen) {
      router.replace("/welcome");
      return;
    }
  }, [ready, auth.isAuthenticated, prefs.name, pathname, router]);

  const onLayoutRootView = useCallback(() => {
    if (ready) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [ready]);

  if (!ready) {
    return <View style={{ flex: 1, backgroundColor: C.bg }} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }} onLayout={onLayoutRootView}>
      <StatusBar style={isDark ? "light" : "dark"} />
      {settled && <DeferredServices />}
      <ErrorBoundary>
        <Stack
          screenOptions={{
            headerShown: false,
            headerBackTitle: " ",
            headerBackButtonDisplayMode: "minimal",
            animation: "slide_from_right",
            contentStyle: { backgroundColor: C.bg },
          }}
        />
      </ErrorBoundary>
    </View>
  );
}

function DeferredServices() {
  useWidgetSync();
  useFlightAlerts();
  useTripReminders();
  useTripNotifications();
  useFlightLiveActivity();
  useUpcomingEventLiveActivity();

  useEffect(() => {
    registerForPushNotifications();
  }, []);

  useEffect(() => {
    let Upd: typeof import("expo-updates") | null = null;
    try { Upd = require("expo-updates"); } catch { return; }
    if (!Upd || Upd.isEmbeddedLaunch === undefined) return;

    const check = async () => {
      try {
        const result = await Upd!.checkForUpdateAsync();
        if (result.isAvailable) {
          await Upd!.fetchUpdateAsync();
          Upd!.reloadAsync();
        }
      } catch { /* dev or no network */ }
    };
    check();
    const sub = AppState.addEventListener("change", (s) => { if (s === "active") check(); });
    return () => sub.remove();
  }, []);

  return null;
}

function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <AuthProvider>
          <PreferencesProvider>
            <TripsProvider>
              <BrandBridge>
                <ThemeProvider>
                  <NotificationProvider>
                    <ComplianceProvider>
                      <ToastProvider>
                        <AppStack />
                      </ToastProvider>
                    </ComplianceProvider>
                  </NotificationProvider>
                </ThemeProvider>
              </BrandBridge>
            </TripsProvider>
          </PreferencesProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

export default RootLayout;
