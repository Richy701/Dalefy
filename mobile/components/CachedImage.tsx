import { Image as RNImage, type ImageStyle as RNImageStyle } from "react-native";
import type { StyleProp } from "react-native";

let ExpoImage: any = null;
try {
  ExpoImage = require("expo-image").Image;
} catch {}

interface Props {
  uri: string;
  style: StyleProp<RNImageStyle>;
  transition?: number;
}

export function CachedImage({ uri, style, transition = 200 }: Props) {
  if (ExpoImage) {
    return (
      <ExpoImage
        source={{ uri }}
        style={style}
        transition={transition}
        cachePolicy="memory-disk"
        contentFit="cover"
      />
    );
  }
  return <RNImage source={{ uri }} style={style} resizeMode="cover" />;
}
