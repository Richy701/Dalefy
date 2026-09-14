import {
  useSharedValue, useAnimatedScrollHandler, useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";

/** Match Home: keep the cover's top at the screen edge during pull-down. */
export function useBannerStretch(height: number, existingScrollY?: SharedValue<number>) {
  const localScrollY = useSharedValue(0);
  const scrollY = existingScrollY ?? localScrollY;
  const onScroll = useAnimatedScrollHandler(e => { scrollY.value = e.contentOffset.y; });
  const stretchStyle = useAnimatedStyle(() => {
    const y = Math.min(0, scrollY.value);
    return { transform: [{ translateY: y / 2 }, { scale: 1 - y / height }] };
  });
  return { onScroll, stretchStyle };
}
