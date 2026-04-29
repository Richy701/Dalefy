import AsyncStorage from "@react-native-async-storage/async-storage";

let SecureStore: typeof import("expo-secure-store") | null = null;
try {
  SecureStore = require("expo-secure-store");
} catch {
  // Native module not available (Expo Go) — fall back to AsyncStorage
}

const MIGRATED_KEY = "daf-secure-migrated";

async function hasMigrated(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(MIGRATED_KEY)) === "1";
  } catch {
    return false;
  }
}

async function migrateIfNeeded(key: string): Promise<string | null> {
  if (!SecureStore) return null;
  const migrated = await hasMigrated();
  if (migrated) return null;

  try {
    const value = await AsyncStorage.getItem(key);
    if (value) {
      await SecureStore.setItemAsync(key, value);
      await AsyncStorage.removeItem(key);
      return value;
    }
  } catch {
    // Migration failed - value will be re-created on next auth
  }
  return null;
}

export const SecureStorageAdapter = {
  async getItem(key: string): Promise<string | null> {
    if (SecureStore) {
      try {
        const value = await SecureStore.getItemAsync(key);
        if (value) return value;
      } catch {
        // SecureStore failed - fall through to migration/fallback
      }
      return migrateIfNeeded(key);
    }

    // No SecureStore available - use AsyncStorage directly
    return AsyncStorage.getItem(key);
  },

  async setItem(key: string, value: string): Promise<void> {
    if (SecureStore) {
      try {
        await SecureStore.setItemAsync(key, value);
        AsyncStorage.setItem(MIGRATED_KEY, "1").catch(() => {});
        return;
      } catch {
        // Fall through to AsyncStorage
      }
    }
    await AsyncStorage.setItem(key, value);
  },

  async removeItem(key: string): Promise<void> {
    if (SecureStore) {
      try { await SecureStore.deleteItemAsync(key); } catch { /* ignore */ }
    }
    try { await AsyncStorage.removeItem(key); } catch { /* ignore */ }
  },
};
