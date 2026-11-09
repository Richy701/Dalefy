import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
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

/** For tabs that stay mounted: reads the list again on each return, so a report made in the gallery applies at once */
export function useHiddenPhotos(): Set<string> {
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  useFocusEffect(useCallback(() => {
    void loadHiddenPhotos().then(setHidden);
  }, []));
  return hidden;
}
