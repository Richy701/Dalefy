import React, { useEffect, useCallback, useRef, useState, useMemo } from "react";
import { Appearance, Platform, View, AppState, InteractionManager, Text, TextInput, Linking } from "react-native";
import { Stack, ThemeProvider as NavThemeProvider, DefaultTheme, DarkTheme } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import * as SplashScreen from "expo-splash-screen";
import * as SystemUI from "expo-system-ui";
let NavigationBar: any = null;
try { NavigationBar = require("expo-navigation-bar"); } catch { /* not available */ }

// Read saved theme preference and set native root background BEFORE React mounts.
// This prevents the flash when the user's saved theme differs from the system theme.
const systemIsDark = Appearance.getColorScheme() === "dark";
SystemUI.setBackgroundColorAsync(systemIsDark ? "#09090b" : "#f5f6fa").catch(() => {});

// Eagerly apply saved preference — runs async but resolves before splash hides
import AsyncStorage from "@react-native-async-storage/async-storage";

// Text follows the iOS text-size setting up to 1.3x; past that, fixed rows and headers clip
for (const C of [Text, TextInput] as any[]) {
  C.defaultProps = { ...(C.defaultProps ?? {}), maxFontSizeMultiplier: 1.3 };
}
AsyncStorage.getItem("daf-prefs").then((raw) => {
  if (!raw) return;
  try {
    const { themeMode } = JSON.parse(raw);
    if (themeMode === "light" || themeMode === "dark") {
      if (Platform.OS !== "android") {
        try { Appearance.setColorScheme(themeMode); } catch { /* older RN */ }
      }
      SystemUI.setBackgroundColorAsync(themeMode === "dark" ? "#09090b" : "#f5f6fa").catch(() => {});
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
import { parseTripDate } from "@/shared/dates";
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
import { useSurfaceTrips } from "@/hooks/useSurfaceTrips";
import { useWidgetSync } from "@/hooks/useWidgetSync";
import { useFlightAlerts } from "@/hooks/useFlightAlerts";
import { useTripReminders } from "@/hooks/useTripReminders";
import { useTripNotifications } from "@/hooks/useTripNotifications";
import { LaunchHandoff } from "@/components/LaunchHandoff";
import { useFlightLiveActivity } from "@/hooks/useFlightLiveActivity";
import { useUpcomingEventLiveActivity } from "@/hooks/useUpcomingEventLiveActivity";

// Deep links (widget, Live Activity, shared links) always land on top of the tabs, so the trip page keeps its back button
// eslint-disable-next-line react-refresh/only-export-components
export const unstable_settings = { anchor: "(tabs)" };

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
   
  const Mapbox = require("@rnmapbox/maps").default;
  const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? "";
  if (token) Mapbox.setAccessToken(token);
  Mapbox.setTelemetryEnabled(false);
} catch { /* native module not available in Expo Go */ }

function AppStack() {
  const { isDark, C } = useTheme();
  const { ready: tripsReady, trips } = useTrips();
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
    SystemUI.setBackgroundColorAsync(isDark ? "#09090b" : "#f5f6fa");
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
        { id: "join", title: "Join a Trip", icon: Platform.select({ ios: "symbol:qrcode" }) ?? undefined, params: { href: "/" } },
        { id: "gallery", title: "Gallery", icon: Platform.select({ ios: "symbol:camera.fill" }) ?? undefined, params: { href: "/media" } },
        { id: "profile", title: "My Profile", icon: Platform.select({ ios: "symbol:person.crop.circle" }) ?? undefined, params: { href: "/profile" } },
      ]);
    } catch { /* not available */ }
  }, []);

  const { addNotification } = useNotifications();
  const { prefs, setPref } = usePreferences();
  const auth = useAuth();
  const ready = (fontsLoaded || fontError) && tripsReady && prefsReady && !auth.isLoading;

  // Defer background services until UI is visible
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (!ready) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const task = InteractionManager.runAfterInteractions(() => {
      t = setTimeout(() => setSettled(true), 1500);
    });
    return () => { task.cancel(); if (t) clearTimeout(t); };
  }, [ready]);
  const pendingTripNav = useRef<string | null>(null);
  const tourShown = useRef(false);

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
      const data = response.notification.request.content.data ?? {};
      const tripId = data.tripId as string | undefined;
      const eventId = data.eventId as string | undefined;
      const location = data.location as string | undefined;
      // "Directions" goes straight to Maps; everything else opens the event, or the trip
      if (response.actionIdentifier === "directions" && location) {
        Linking.openURL(`maps://?q=${encodeURIComponent(location)}`).catch(() => {});
        return;
      }
      if (!tripId) return;
      const path = eventId && response.actionIdentifier !== "view-trip"
        ? `/trip/event?tripId=${encodeURIComponent(tripId)}&eventId=${encodeURIComponent(eventId)}`
        : `/trip/${tripId}`;
      if (ready) {
        router.push(path as any);
      } else {
        pendingTripNav.current = path;
      }
    });
    return () => { recvSub.remove(); tapSub.remove(); };
  }, [router, addNotification, prefs.tripReminders, prefs.itineraryUpdates, ready]);

  useEffect(() => {
    if (ready && pendingTripNav.current) {
      const path = pendingTripNav.current;
      pendingTripNav.current = null;
      router.push(path as any);
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
    // The first time a trip shows up on this phone (joined by code, invite link, or added by the organiser) it
    // gets an intro: the full tour if they've never seen it, otherwise just its welcome page. One per launch.
    // Not over a trip page either: it may be mid-join, picking which traveller they are
    if (!prefs.name || !tripsReady || tourShown.current || onAuthScreen || pathname === "/welcome" || pathname === "/tour" || pathname.startsWith("/shared/")) return;
    // Anyone who finished the tour before trips were tracked (no "*" marker): count their current trips as
    // introduced quietly, so they don't get a welcome for a trip they already know
    if (prefs.seenTour && !prefs.introducedTrips.includes("*")) {
      setPref("introducedTrips", ["*", ...prefs.introducedTrips, ...trips.map(t => t.id)]);
      return;
    }
    const introduced = new Set(prefs.introducedTrips);
    const now = new Date();
    const fresh = trips
      .filter(t => !introduced.has(t.id) && t.status !== "Draft" && parseTripDate(t.end) >= now)
      .sort((a, b) => parseTripDate(a.start).getTime() - parseTripDate(b.start).getTime());
    if (!prefs.seenTour) {
      tourShown.current = true;
      router.push(fresh[0] ? `/tour?tripId=${encodeURIComponent(fresh[0].id)}` : "/tour");
    } else if (fresh[0]) {
      tourShown.current = true;
      router.push(`/tour?tripId=${encodeURIComponent(fresh[0].id)}`);
    }
  }, [ready, auth.isAuthenticated, prefs.name, prefs.seenTour, prefs.introducedTrips, tripsReady, trips, pathname, router, setPref]);

  // Navigator containers (behind tabs, pushed screens, overscroll) paint the page colour
  // instead of React Navigation's default grey/white.
  const navTheme = useMemo(() => {
    const base = isDark ? DarkTheme : DefaultTheme;
    return { ...base, colors: { ...base.colors, background: C.bg, card: C.bg } };
  }, [isDark, C.bg]);

  // Native sheets with the system grabber, full height, still swipe-down to dismiss
  const sheetOptions = {
    presentation: "formSheet" as const,
    headerShown: true,
    sheetGrabberVisible: true,
    sheetAllowedDetents: [1.0],
  };
  // Frosted sheets (Join, Notifications): no dimming, the system glass shows through. Light glass is thin and
  // picks up whatever is behind it, so light mode adds a pale veil to keep text readable.
  const glassSheetOptions = {
    ...sheetOptions,
    sheetAllowedDetents: [0.94],
    sheetLargestUndimmedDetentIndex: 0,
    contentStyle: { backgroundColor: isDark ? "transparent" : "rgba(247,247,249,0.78)" },
  };

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
        <NavThemeProvider value={navTheme}>
          <Stack
            screenOptions={{
              headerShown: false,
              headerBackTitle: " ",
              headerBackButtonDisplayMode: "minimal",
              // The native iOS push (parallax, shadow, edge swipe back). Replace slides like a push too, so
              // stepping to the previous or next event isn't an instant cut.
              animation: "default",
              animationTypeForReplace: "push",
              contentStyle: { backgroundColor: C.bg },
            }}
          >
            <Stack.Screen name="join" options={glassSheetOptions} />
            <Stack.Screen name="notifications" options={glassSheetOptions} />
            <Stack.Screen name="edit-profile" options={glassSheetOptions} />
            {/* Joining: each step lands on the same photo in the same place, so they fade rather than slide */}
            <Stack.Screen name="shared/[tripId]" options={({ route }) => ((route.params as { join?: string } | undefined)?.join === "1" ? { animation: "fade" } : {})} />
            <Stack.Screen name="trip/[id]" options={({ route }) => ((route.params as { arrived?: string } | undefined)?.arrived ? { animation: "fade" } : {})} />
            <Stack.Screen
              name="tour"
              options={({ route }) => ({
                presentation: "fullScreenModal",
                gestureEnabled: false,
                // Straight after joining a trip it dissolves in over the trip page instead of sliding up
                ...((route.params as { tripId?: string } | undefined)?.tripId ? { animation: "fade" as const } : {}),
              })}
            />
          </Stack>
        </NavThemeProvider>
      </ErrorBoundary>
      <LaunchHandoff />
    </View>
  );
}

function DeferredServices() {
  const surfaceTrips = useSurfaceTrips();
  useWidgetSync(surfaceTrips);
  useFlightAlerts();
  useTripReminders();
  useTripNotifications();
  useFlightLiveActivity(surfaceTrips);
  useUpcomingEventLiveActivity(surfaceTrips);

  const hasTrips = surfaceTrips.trips.length > 0;
  // Until the tour has asked (it explains why first), only re-register an existing permission.
  // Read at mount, so tapping "Not now" in the tour doesn't fire the system prompt straight after.
  const { prefs } = usePreferences();
  const [seenTourAtLaunch] = useState(prefs.seenTour);
  useEffect(() => {
    registerForPushNotifications({ prompt: hasTrips && seenTourAtLaunch });
  }, [hasTrips, seenTourAtLaunch]);

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
