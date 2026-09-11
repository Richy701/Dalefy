import { useEffect } from "react";
import { Platform, AppState } from "react-native";
import { File, Directory, Paths } from "expo-file-system";
import * as ImageManipulator from "expo-image-manipulator";
import type { useSurfaceTrips } from "./useSurfaceTrips";
import { widgetTimeline } from "@/shared/widgetSchedule";
import { useTheme } from "@/context/ThemeContext";


let TripCountdown: any = null;
try {
  TripCountdown = require("@/widgets/TripCountdown").default;
} catch {
  /* widget module not available in Expo Go or Android */
}

// Widget image preparation — download + resize in main app, save to app group container

const _imageCache = new Map<string, string>();

function hashUrl(url: string): string {
  let h = 0;
  for (let i = 0; i < url.length; i++) {
    h = ((h << 5) - h + url.charCodeAt(i)) | 0;
  }
  return "w" + Math.abs(h).toString(36);
}

function getAppGroupImagesDir(): Directory | null {
  if (Platform.OS !== "ios") return null;
  try {
    const containers = Paths.appleSharedContainers;
    const appGroup = containers["group.com.dafadventures.app"];
    if (!appGroup) return null;
    const dir = new Directory(appGroup, "widget-images");
    if (!dir.exists) dir.create({ intermediates: true });
    return dir;
  } catch {
    return null;
  }
}

async function prepareWidgetImage(remoteUrl: string): Promise<string> {
  if (!remoteUrl || Platform.OS !== "ios") return "";

  const cached = _imageCache.get(remoteUrl);
  if (cached) {
    const f = new File(cached);
    if (f.exists) return cached;
  }

  const imagesDir = getAppGroupImagesDir();
  if (!imagesDir) return "";

  const filename = `${hashUrl(remoteUrl)}.jpg`;
  const destFile = new File(imagesDir, filename);

  if (destFile.exists) {
    const localPath = destFile.uri.replace("file://", "");
    _imageCache.set(remoteUrl, localPath);
    return localPath;
  }

  try {
    const tmpFile = new File(Paths.cache, `widget_dl_${Date.now()}.tmp`);
    const downloaded = await File.downloadFileAsync(remoteUrl, tmpFile, { idempotent: true });

    const resized = await ImageManipulator.manipulateAsync(
      downloaded.uri,
      [{ resize: { width: 600 } }],
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
    );

    const resizedFile = new File(resized.uri);
    resizedFile.copy(destFile);

    try { downloaded.delete(); } catch {}
    try { resizedFile.delete(); } catch {}

    const localPath = destFile.uri.replace("file://", "");
    _imageCache.set(remoteUrl, localPath);
    return localPath;
  } catch (e) {
    console.warn("[WidgetSync] image prep failed:", e);
    return "";
  }
}

/**
 * Syncs the next upcoming trip to the iOS home screen widget.
 * Call once in the root layout — it auto-updates when trips change.
 */
export function useWidgetSync(surface: ReturnType<typeof useSurfaceTrips>) {
  const { trips, ready } = surface;
  const { C } = useTheme();
  useEffect(() => {
    if (!ready || !TripCountdown || Platform.OS !== "ios") return;
    let cancelled = false;
    let generation = 0;
    async function sync() {
      const current = ++generation;
      const images: Record<string, string> = {};
      for (const trip of trips) images[trip.id] = await prepareWidgetImage(trip.image || "");
      if (cancelled || current !== generation) return;
      const timeline = widgetTimeline(trips, Date.now(), C.teal, images);
      TripCountdown.updateSnapshot(timeline[0].props);
      TripCountdown.updateTimeline(timeline);
    }
    void sync();
    const sub = AppState.addEventListener("change", state => { if (state === "active") void sync(); });
    return () => { cancelled = true; sub.remove(); };
  }, [trips, ready, C.teal]);
}
