import AsyncStorage from "@react-native-async-storage/async-storage";

export const HIDDEN_PHOTOS_KEY = "daf-media-hidden";

/** Photos this person reported. They stay hidden on this device, whatever the organiser decides. */
export async function loadHiddenPhotos(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(HIDDEN_PHOTOS_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}
