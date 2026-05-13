import { useState, useEffect, useRef } from "react";
import { Image as RNImage, View, type ImageStyle as RNImageStyle } from "react-native";
import type { StyleProp } from "react-native";

let ExpoImage: any = null;
try {
  ExpoImage = require("expo-image").Image;
} catch {}

const DEFAULT_BLURHASH = "L6PZfS~q-;j[j[j[fQj[j[fQj[";

interface Props {
  uri: string;
  style: StyleProp<RNImageStyle>;
  transition?: number;
  accessible?: boolean;
  accessibilityLabel?: string;
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
  const maxRetries = 3;
  const failed = retries > maxRetries;
  const retryTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => { if (retryTimer.current) clearTimeout(retryTimer.current); }, []);

  const handleError = () => {
    if (retries < maxRetries) {
      retryTimer.current = setTimeout(() => setRetries(r => r + 1), 800 * (retries + 1));
    } else {
      setRetries(r => r + 1);
    }
  };

  // Bust expo-image disk cache on retry by appending a param
  const resolvedUri = retries > 0 ? `${uri}${uri.includes("?") ? "&" : "?"}_r=${retries}` : uri;

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
        source={{ uri: resolvedUri }}
        style={style}
        placeholder={{ blurhash: blurhash ?? DEFAULT_BLURHASH }}
        placeholderContentFit="cover"
        transition={transition}
        cachePolicy="memory"
        contentFit="cover"
        accessible={accessible}
        accessibilityLabel={accessibilityLabel}
        onError={handleError}
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
