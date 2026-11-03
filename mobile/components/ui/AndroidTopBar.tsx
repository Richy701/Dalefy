import { Platform, StyleSheet } from "react-native";
import Animated, { Extrapolation, interpolate, useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Tall enough to clear the status bar and the 44pt back button in Android's transparent header */
export const ANDROID_BAR_H = 64;

/**
 * Android's transparent header has nothing behind it, so a page scrolling under it runs straight through the
 * back button, the title and the status bar. This solid bar fades in once content reaches them. Place it after
 * the scroll view; iOS has its own scroll edge and blur.
 */
export function AndroidTopBar({ scrollY, from, color, borderColor }: { scrollY: SharedValue<number>; from: number; color: string; borderColor: string }) {
  const insets = useSafeAreaInsets();
  const fade = useAnimatedStyle(() => ({ opacity: interpolate(scrollY.value, [from, from + 24], [0, 1], Extrapolation.CLAMP) }));
  if (Platform.OS !== "android") return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: "absolute", top: 0, left: 0, right: 0, height: insets.top + ANDROID_BAR_H, backgroundColor: color, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: borderColor }, fade]}
    />
  );
}
