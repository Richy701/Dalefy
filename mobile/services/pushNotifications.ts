import { Platform } from "react-native";
import { supabase } from "./supabase";
import { readPreferencesFromStorage } from "@/context/PreferencesContext";

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
        (prefs.tripReminders || prefs.itineraryUpdates);

      return {
        shouldShowBanner: allowed,
        shouldShowList: allowed,
        shouldPlaySound: allowed,
        shouldSetBadge: allowed,
      };
    },
  });
} catch {
  /* native module not available in Expo Go */
}

export async function registerForPushNotifications(): Promise<string | null> {
  if (!Notifications || !Device || !Device.isDevice) return null;

  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;

    if (existing !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") return null;

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.MAX,
      });
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({
      projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID,
    });

    await saveTokenToSupabase(token);
    return token;
  } catch {
    return null;
  }
}

async function saveTokenToSupabase(token: string) {
  const deviceName = Device?.deviceName ?? `${Platform.OS} device`;
  await supabase
    .from("push_tokens")
    .upsert({ token, device_name: deviceName }, { onConflict: "token" });
}
