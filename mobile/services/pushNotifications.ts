import { Platform } from "react-native";
import { doc, setDoc } from "firebase/firestore";
import { firebaseDb, firebaseAuth, waitForAuth, isFirebaseConfigured } from "./firebase";
import { readPreferencesFromStorage } from "@/context/PreferencesContext";
import { getDeviceId } from "./deviceId";

let Notifications: typeof import("expo-notifications") | null = null;
let Device: typeof import("expo-device") | null = null;

try {
  Notifications = require("expo-notifications");
  Device = require("expo-device");
  Notifications!.setNotificationHandler({
    handleNotification: async (notification) => {
      const category = (notification.request.content.data?.category as string | undefined) ?? "update";
      const prefs = await readPreferencesFromStorage();
      const allowed =
        category === "reminder" ? prefs.tripReminders :
        category === "update"   ? prefs.itineraryUpdates :
        category === "flight_status" ? prefs.itineraryUpdates :
        (prefs.tripReminders || prefs.itineraryUpdates);

      return {
        shouldShowBanner: allowed,
        shouldShowList: allowed,
        shouldPlaySound: allowed,
        shouldSetBadge: allowed,
      };
    },
  });
  // Buttons under an expanded notification; app/_layout.tsx handles the identifiers
  const open = { opensAppToForeground: true };
  Notifications!.setNotificationCategoryAsync("flight", [
    { identifier: "view-event", buttonTitle: "View flight", options: open },
  ]).catch(() => {});
  Notifications!.setNotificationCategoryAsync("event", [
    { identifier: "view-event", buttonTitle: "View details", options: open },
    { identifier: "directions", buttonTitle: "Directions", options: open },
  ]).catch(() => {});
  Notifications!.setNotificationCategoryAsync("trip", [
    { identifier: "view-trip", buttonTitle: "Open itinerary", options: open },
  ]).catch(() => {});
} catch {
  /* native module not available in Expo Go */
}

export async function registerForPushNotifications(
  { prompt = true }: { prompt?: boolean } = {},
): Promise<string | null> {
  if (!Notifications || !Device || !Device.isDevice) return null;

  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;

    if (existing !== "granted" && !prompt) return null;

    if (existing !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") return null;

    if (Platform.OS === "android") {
      // The name shows in Android's notification settings for the app
      await Notifications.setNotificationChannelAsync("default", {
        name: "Trip reminders and updates",
        importance: Notifications.AndroidImportance.MAX,
        lightColor: "#0bd2b5",
      });
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({
      projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID,
    });

    await saveTokenToFirestore(token);
    return token;
  } catch {
    return null;
  }
}

async function saveTokenToFirestore(token: string) {
  if (!isFirebaseConfigured()) return;

  await waitForAuth();
  const deviceId = await getDeviceId();
  const uid = firebaseAuth().currentUser?.uid ?? null;
  const deviceName = Device?.deviceName ?? `${Platform.OS} device`;
  // Use token as document ID for natural upsert behavior
  const tokenId = token.replace(/[/\\]/g, "_");
  await setDoc(doc(firebaseDb(), "push_tokens", tokenId), {
    token,
    device_id: deviceId,
    user_id: uid,
    device_name: deviceName,
    platform: Platform.OS,
    updated_at: new Date().toISOString(),
  }, { merge: true });
}
