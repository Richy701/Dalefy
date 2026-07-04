import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";

const KEY = "daf-device-id";

let cached: string | null = null;
let inFlight: Promise<string> | null = null;

export async function getDeviceId(): Promise<string> {
  if (cached) return cached;
  // Share a single in-flight resolution so concurrent first-launch callers
  // don't each mint a different UUID and race the write (the device id is the
  // key trip membership is stored under).
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const stored = await AsyncStorage.getItem(KEY);
    if (stored) {
      cached = stored;
      return stored;
    }
    const id = Crypto.randomUUID();
    await AsyncStorage.setItem(KEY, id);
    cached = id;
    return id;
  })();
  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}
