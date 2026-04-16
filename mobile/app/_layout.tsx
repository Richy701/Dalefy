import { useEffect, useCallback } from "react";
import { View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import { useRouter } from "expo-router";
import { TripsProvider, useTrips } from "@/context/TripsContext";
import { ThemeProvider, useTheme } from "@/context/ThemeContext";
import { NotificationProvider, useNotifications } from "@/context/NotificationContext";
import { registerForPushNotifications } from "@/services/pushNotifications";

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
  const router = useRouter();
  const [fontsLoaded, fontError] = useFonts({
    BarlowCondensed_700Bold: require("@expo-google-fonts/barlow-condensed/700Bold/BarlowCondensed_700Bold.ttf"),
    BarlowCondensed_800ExtraBold: require("@expo-google-fonts/barlow-condensed/800ExtraBold/BarlowCondensed_800ExtraBold.ttf"),
    BarlowCondensed_900Black: require("@expo-google-fonts/barlow-condensed/900Black/BarlowCondensed_900Black.ttf"),
  });

  useEffect(() => {
    registerForPushNotifications();
  }, []);

  const { addNotification } = useNotifications();

  useEffect(() => {
    if (!Notifications) return;
    const recvSub = Notifications.addNotificationReceivedListener((notification) => {
      const { title, body } = notification.request.content;
      addNotification({
        message: title ?? "Trip Update",
        detail: body ?? "",
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        type: "info",
      });
    });
    const tapSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const tripId = response.notification.request.content.data?.tripId as string | undefined;
      if (tripId) router.push(`/trip/${tripId}`);
    });
    return () => { recvSub.remove(); tapSub.remove(); };
  }, [router, addNotification]);

  const ready = (fontsLoaded || fontError) && tripsReady;

  const onLayoutRootView = useCallback(() => {
    if (ready) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [ready]);

  if (!ready) {
    return <View style={{ flex: 1, backgroundColor: C.bg }} />;
  }

  return (
    <View style={{ flex: 1 }} onLayout={onLayoutRootView}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false, animation: "slide_from_right" }} />
    </View>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <NotificationProvider>
        <TripsProvider>
          <AppStack />
        </TripsProvider>
      </NotificationProvider>
    </ThemeProvider>
  );
}
