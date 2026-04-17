import { Image as RNImage, type ImageStyle as RNImageStyle } from "react-native";
import type { StyleProp } from "react-native";

let ExpoImage: any = null;
try {
  ExpoImage = require("expo-image").Image;
} catch {}

// Subtle warm-neutral blurhash placeholder — resolves to a soft blur before the
// real image loads, eliminating the "pop from nothing" effect.
// L6PZfS~q-;j[j[j[fQj[j[fQj[ → warm gray, works for travel imagery.
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
  if (ExpoImage) {
    return (
      <ExpoImage
        source={{ uri }}
        style={style}
        placeholder={{ blurhash: blurhash ?? DEFAULT_BLURHASH }}
        placeholderContentFit="cover"
        transition={transition}
        cachePolicy="memory-disk"
        contentFit="cover"
        accessible={accessible}
        accessibilityLabel={accessibilityLabel}
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
    />
  );
}
