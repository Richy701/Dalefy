import React, { useEffect, useCallback, useRef } from "react";
import { Appearance, Platform, View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import * as SplashScreen from "expo-splash-screen";
import * as SystemUI from "expo-system-ui";
import * as NavigationBar from "expo-navigation-bar";

// Set native root background immediately based on system appearance — before React mounts
const systemIsDark = Appearance.getColorScheme() === "dark";
SystemUI.setBackgroundColorAsync(systemIsDark ? "#131316" : "#ffffff");

// Android: transparent nav bar so content extends edge-to-edge
if (Platform.OS === "android") {
  NavigationBar.setBackgroundColorAsync("#09090b");
  NavigationBar.setButtonStyleAsync("light");
}
import { useFonts } from "expo-font";
import { useRouter, usePathname } from "expo-router";
import { TripsProvider, useTrips } from "@/context/TripsContext";
import { ThemeProvider, useTheme } from "@/context/ThemeContext";
import { NotificationProvider, useNotifications } from "@/context/NotificationContext";
import { PreferencesProvider, usePreferences } from "@/context/PreferencesContext";
import { BrandProvider } from "@/context/BrandContext";
import { ToastProvider } from "@/context/ToastContext";
import { ComplianceProvider } from "@/context/ComplianceContext";
import { registerForPushNotifications } from "@/services/pushNotifications";
import * as QuickActions from "expo-quick-actions";
import { useQuickActionRouting } from "expo-quick-actions/router";
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

  useEffect(() => {
    registerForPushNotifications();
  }, []);

  // Sync native root background with theme (status bar area)
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(isDark ? "#131316" : "#ffffff");
  }, [isDark]);

  // Android: sync nav bar color with theme
  useEffect(() => {
    if (Platform.OS === "android") {
      NavigationBar.setBackgroundColorAsync(C.bg);
      NavigationBar.setButtonStyleAsync(isDark ? "light" : "dark");
    }
  }, [isDark, C.bg]);

  // Quick actions — long-press app icon shortcuts
  useQuickActionRouting();
  useEffect(() => {
    QuickActions.setItems([
      { id: "join", title: "Join a Trip", icon: Platform.select({ ios: "symbol:qrcode", android: "shortcut_join" }) ?? undefined, params: { href: "/" } },
      { id: "gallery", title: "Gallery", icon: Platform.select({ ios: "symbol:camera.fill", android: "shortcut_gallery" }) ?? undefined, params: { href: "/media" } },
      { id: "profile", title: "My Profile", icon: Platform.select({ ios: "symbol:person.crop.circle", android: "shortcut_profile" }) ?? undefined, params: { href: "/profile" } },
    ]);
  }, []);

  // Keep the iOS home screen widget in sync with trip data
  useWidgetSync();

  // Watch flight events for status changes (gate, delay, boarding, landed, cancelled)
  useFlightAlerts();

  // Schedule local reminders for upcoming trips, flights, hotels, activities
  useTripReminders();

  // Seed in-app notification list from current trip state (landed flights, today's events, etc.)
  useTripNotifications();

  // Start/update/end iOS Live Activities for today's flights
  useFlightLiveActivity();
  useUpcomingEventLiveActivity();

  const { addNotification } = useNotifications();
  const { prefs } = usePreferences();
  const ready = (fontsLoaded || fontError) && tripsReady && prefsReady;
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
    // Send to welcome if no name or no uid (must sign in)
    if (!prefs.name && pathname !== "/welcome") {
      router.replace("/welcome");
    }
  }, [ready, prefs.name, pathname, router]);

  const onLayoutRootView = useCallback(() => {
    if (ready) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [ready]);

  if (!ready) {
    return <View style={{ flex: 1, backgroundColor: C.card }} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.card }} onLayout={onLayoutRootView}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <ErrorBoundary>
        <Stack
          screenOptions={{
            headerShown: false,
            headerBackTitle: " ",
            headerBackButtonDisplayMode: "minimal",
            animation: "slide_from_right",
            contentStyle: { backgroundColor: C.card },
          }}
        />
      </ErrorBoundary>
    </View>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
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
      </SafeAreaProvider>
    </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
