import { useState } from "react";
import { Image as RNImage, View, type ImageStyle as RNImageStyle } from "react-native";
import type { StyleProp } from "react-native";

let ExpoImage: any = null;
try {
  ExpoImage = require("expo-image").Image;
} catch {}

// Subtle warm-neutral blurhash placeholder — resolves to a soft blur before the
// real image loads, eliminating the "pop from nothing" effect.
const DEFAULT_BLURHASH = "L6PZfS~q-;j[j[j[fQj[j[fQj[";

interface Props {
  uri: string;
  style: StyleProp<RNImageStyle>;
  transition?: number;
  accessible?: boolean;
  accessibilityLabel?: string;
  /** Blurhash string for blur-up placeholder (uses default if omitted) */
  blurhash?: string | null;
}

export function CachedImage({
  uri,
  style,
  transition = 300,
  accessible,
  accessibilityLabel,
  blurhash,
}: Props) {
  const [retries, setRetries] = useState(0);
  const maxRetries = 2;
  const failed = retries > maxRetries;

  // No URI or exhausted retries — show blurhash placeholder
  if (!uri || failed) {
    if (ExpoImage) {
      return (
        <ExpoImage
          source={undefined}
          style={style}
          placeholder={{ blurhash: blurhash ?? DEFAULT_BLURHASH }}
          placeholderContentFit="cover"
          contentFit="cover"
        />
      );
    }
    return <View style={style} />;
  }

  if (ExpoImage) {
    return (
      <ExpoImage
        key={retries}
        source={{ uri }}
        style={style}
        placeholder={{ blurhash: blurhash ?? DEFAULT_BLURHASH }}
        placeholderContentFit="cover"
        transition={transition}
        cachePolicy="memory-disk"
        contentFit="cover"
        accessible={accessible}
        accessibilityLabel={accessibilityLabel}
        onError={() => setRetries(r => r + 1)}
      />
    );
  }
  return (
    <RNImage
      source={{ uri }}
      style={style}
      resizeMode="cover"
      accessible={accessible}
      accessibilityLabel={accessibilityLabel}
      onError={() => setRetries(r => r + 1)}
    />
  );
}
