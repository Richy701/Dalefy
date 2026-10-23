import { useState, useEffect, useRef } from "react";
import { Image as RNImage, View, type ImageStyle as RNImageStyle } from "react-native";
import type { StyleProp } from "react-native";

let ExpoImage: any = null;
try {
  ExpoImage = require("expo-image").Image;
} catch {}

const DEFAULT_BLURHASH = "L6PZfS~q-;j[j[j[fQj[j[fQj[";

const APP_URL = (process.env.EXPO_PUBLIC_APP_URL ?? "https://dalefy.vercel.app").replace(/\/$/, "");
const TRIP_COVER = /^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/[^/]+\/o\/trips%2F[^/?]+%2Fcover/;

/**
 * Trip covers are stored at full camera size (often 2 MB and up), so they come through Vercel's image resizer
 * (vercel.json "images"). 2048 wide keeps the full-width hero sharp; blurred backdrops need far less.
 */
function sizedCover(uri: string, width: 640 | 2048): string {
  return TRIP_COVER.test(uri) ? `${APP_URL}/_vercel/image?url=${encodeURIComponent(uri)}&w=${width}&q=75` : uri;
}

interface Props {
  uri: string;
  style: StyleProp<RNImageStyle>;
  transition?: number;
  accessible?: boolean;
  accessibilityLabel?: string;
  blurhash?: string | null;
  contentPosition?: { top?: string; left?: string };
  blurRadius?: number;
  onLoad?: (event: any) => void;
  /** iOS: decode at the view's size instead of full resolution; use for small tiles of large photos */
  enforceEarlyResizing?: boolean;
  /** Reuse the native view across list cells without flashing the previous image */
  recyclingKey?: string;
}

export function CachedImage({
  uri,
  style,
  transition = 300,
  accessible,
  accessibilityLabel,
  blurhash,
  contentPosition,
  blurRadius,
  onLoad,
  enforceEarlyResizing,
  recyclingKey,
}: Props) {
  const [retries, setRetries] = useState(0);
  // The resized copy failed (resizer down or over quota): use the original instead
  const [original, setOriginal] = useState(false);
  const src = original ? uri : sizedCover(uri, blurRadius ? 640 : 2048);
  const maxRetries = 3;
  const failed = retries > maxRetries;
  const retryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => { if (retryTimer.current) clearTimeout(retryTimer.current); }, []);

  const handleError = () => {
    if (src !== uri) { setOriginal(true); return; }
    if (retries < maxRetries) {
      retryTimer.current = setTimeout(() => setRetries(r => r + 1), 800 * (retries + 1));
    } else {
      setRetries(r => r + 1);
    }
  };

  // Retry the plain URL first so a copy already on disk still shows offline;
  // only bust the expo-image disk cache on the final attempt.
  const resolvedUri = retries >= maxRetries ? `${src}${src.includes("?") ? "&" : "?"}_r=${retries}` : src;

  if (!uri || failed) {
    if (ExpoImage) {
      return (
        <ExpoImage
          source={undefined}
          style={style}
          placeholder={{ blurhash: blurhash ?? DEFAULT_BLURHASH }}
          placeholderContentFit="cover"
          blurRadius={blurRadius}
          contentFit="cover"
        />
      );
    }
    return <View style={style} />;
  }

  if (ExpoImage) {
    return (
      <ExpoImage
        key={`${retries}${original ? "o" : ""}`}
        source={{ uri: resolvedUri }}
        style={style}
        placeholder={{ blurhash: blurhash ?? DEFAULT_BLURHASH }}
        placeholderContentFit="cover"
        blurRadius={blurRadius}
        transition={transition}
        cachePolicy="memory-disk"
        contentFit="cover"
        contentPosition={contentPosition}
        accessible={accessible}
        accessibilityLabel={accessibilityLabel}
        onLoad={onLoad}
        onError={handleError}
        enforceEarlyResizing={enforceEarlyResizing}
        recyclingKey={recyclingKey}
      />
    );
  }
  return (
    <RNImage
      source={{ uri: resolvedUri }}
      style={style}
      resizeMode="cover"
      accessible={accessible}
      accessibilityLabel={accessibilityLabel}
      onError={handleError}
    />
  );
}
